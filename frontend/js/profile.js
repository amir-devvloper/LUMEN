/* LUMEN — profile page: account, library (favorites + playlists) and #settings
   (daily goal, sign out). The goal is saved with PATCH /users/me, which
   validates the 30–1440 minute range server-side. */
(function (LUMEN) {
  "use strict";

  const { $, esc, duration, fill } = LUMEN.ui;
  const api = LUMEN.api;

  const PLAY =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  const HEART =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" aria-hidden="true"><path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z"/></svg>';

  const el = {
    favorites: $("[data-favorites]"),
    favoritesCount: $("[data-favorites-count]"),
    facts: $("[data-facts]"),
    goalForm: $("[data-goal-form]"),
    goalInput: $("[data-goal-input]"),
    goalNote: $("[data-goal-note]"),
    goalSubmit: $("[data-goal-submit]"),
    logout: $("[data-logout]")
  };

  let favorites = [];

  /* ---------------------------------------------------------------- render */

  function time(seconds) {
    const s = Math.max(0, Math.round(seconds || 0));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function renderUser(user) {
    if (!user) return;
    fill({ "user-name": user.name, "user-plan": user.plan, "user-email": user.email });
    if (el.goalInput && user.daily_goal_minutes) el.goalInput.value = user.daily_goal_minutes;
  }

  function fact(label, value) {
    return '<div><p class="fact__label">' + esc(label) + '</p><p class="fact__value">' + esc(value) + "</p></div>";
  }

  function renderFacts(user, today, week) {
    if (!el.facts) return;

    const joined = user && user.created_at
      ? new Date(String(user.created_at).replace(" ", "T") + "Z")
          .toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : "—";

    el.facts.innerHTML = [
      fact("Member since", joined),
      fact("Daily goal", user ? (user.daily_goal_minutes || 240) + " min" : "—"),
      today ? fact("Current streak", today.streakDays + (today.streakDays === 1 ? " day" : " days")) : "",
      week ? fact("This week", duration(week.totalSeconds)) : ""
    ].join("");
  }

  function renderFavorites(rows) {
    favorites = rows || [];
    if (!el.favorites) return;

    if (el.favoritesCount) {
      el.favoritesCount.textContent = favorites.length +
        (favorites.length === 1 ? " track" : " tracks");
    }

    if (!favorites.length) {
      el.favorites.innerHTML = '<p class="empty">Nothing saved yet — tap a heart on the ' +
        '<a class="link" href="music.html">Music</a> page.</p>';
      return;
    }

    el.favorites.innerHTML = favorites.map(function (t) {
      const meta = t.album ? t.artist + " / " + t.album : t.artist;
      return (
        '<div class="tracklist__row" data-track-id="' + esc(t.id) + '">' +
          '<button class="icon-btn tracklist__play" type="button" data-action="play" ' +
            'aria-label="Play ' + esc(t.title) + '">' + PLAY + "</button>" +
          '<span class="tracklist__art" aria-hidden="true"></span>' +
          '<div class="tracklist__meta">' +
            '<p class="tracklist__title">' + esc(t.title) + "</p>" +
            '<p class="tracklist__artist">' + esc(meta) + "</p>" +
          "</div>" +
          '<span class="tracklist__time">' + time(t.duration_seconds) + "</span>" +
          '<button class="tracklist__icon" type="button" data-action="unfavorite" aria-pressed="true" ' +
            'aria-label="Remove ' + esc(t.title) + ' from favorites">' + HEART + "</button>" +
        "</div>"
      );
    }).join("");
  }

  function goalNote(message, ok) {
    if (!el.goalNote) return;
    el.goalNote.textContent = message || "";
    el.goalNote.classList.toggle("form-note--ok", !!ok);
    el.goalNote.toggleAttribute("hidden", !message);
  }

  /* -------------------------------------------------------------- listeners */

  if (el.favorites) {
    el.favorites.addEventListener("click", function (e) {
      const row = e.target.closest("[data-track-id]");
      if (!row) return;
      const id = row.getAttribute("data-track-id");
      const track = favorites.find(function (t) { return t.id === id; });
      if (!track) return;

      if (e.target.closest('[data-action="play"]') && LUMEN.player) {
        LUMEN.player.setTrack({ ...track, liked: true });
        LUMEN.player.setPlaying(true);
        return;
      }

      if (e.target.closest('[data-action="unfavorite"]')) {
        const button = e.target.closest('[data-action="unfavorite"]');
        button.disabled = true;
        api.toggleFavorite(id)
          .then(function () { return api.favorites(); })
          .then(renderFavorites)
          .catch(function () { button.disabled = false; });
      }
    });
  }

  if (el.goalForm) {
    el.goalForm.addEventListener("submit", function (e) {
      e.preventDefault();
      goalNote("");

      const minutes = Number(el.goalInput.value);
      /* the server validates too — this is just a faster, friendlier no */
      if (!Number.isInteger(minutes) || minutes < 30 || minutes > 1440) {
        el.goalInput.setAttribute("aria-invalid", "true");
        return goalNote("Enter a whole number between 30 and 1440 minutes.", false);
      }
      el.goalInput.removeAttribute("aria-invalid");

      if (el.goalSubmit) el.goalSubmit.disabled = true;
      api.updateMe({ daily_goal_minutes: minutes })
        .then(function (user) {
          renderUser(user);
          goalNote("Saved — your daily goal is now " + user.daily_goal_minutes + " minutes.", true);
          return api.dailyStats().catch(function () { return null; });
        })
        .then(function (today) { if (today) renderFacts(LUMEN.user, today, null); })
        .catch(function (err) { goalNote(err.message, false); })
        .then(function () { if (el.goalSubmit) el.goalSubmit.disabled = false; });
    });
  }

  if (el.logout) {
    el.logout.addEventListener("click", function () {
      api.logout();
      location.href = "login.html";
    });
  }

  /* ------------------------------------------------------------------ init */

  if (LUMEN.playlists) LUMEN.playlists.mount();

  Promise.allSettled([api.me(), api.favorites(), api.dailyStats(), api.weekly()])
    .then(function (results) {
      const value = (i) => (results[i].status === "fulfilled" ? results[i].value : null);
      const user = value(0), favs = value(1), today = value(2), week = value(3);

      if (user) { LUMEN.user = user; renderUser(user); }
      renderFacts(user, today, week);

      if (favs) renderFavorites(favs);
      else if (el.favorites) {
        el.favorites.innerHTML = '<p class="empty">Your library needs the backend running.</p>';
        if (el.favoritesCount) el.favoritesCount.textContent = "offline";
      }
    });
})(window.LUMEN);

/* LUMEN — music page: catalogue, search, ambient filter, favorites and play.
   Playing a track hands it to the player bar (LUMEN.player.setTrack); the
   catalogue itself always comes from the API, with a small demo list so the
   page is never empty when the backend is down (same pattern as analytics.js). */
(function (LUMEN) {
  "use strict";

  const { $, esc, duration } = LUMEN.ui;
  const api = LUMEN.api;

  const HEART =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z"/></svg>';
  const PLAY =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  const PLUS =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

  /* shown only when the API is unreachable */
  const DEMO = [
    { id: "demo-1", title: "Weightless Horizon", artist: "Aether", album: "Still Forms", duration_seconds: 588, is_ambient: 1 },
    { id: "demo-2", title: "Low Tide", artist: "Mira Lund", album: "Coastline", duration_seconds: 402, is_ambient: 1 },
    { id: "demo-3", title: "Glass Rooms", artist: "Aether", album: "Still Forms", duration_seconds: 356, is_ambient: 1 },
    { id: "demo-4", title: "Quiet Machinery", artist: "Ken Oda", album: "Interiors", duration_seconds: 274, is_ambient: 0 },
    { id: "demo-5", title: "Paper Cranes", artist: "Mira Lund", album: "Coastline", duration_seconds: 318, is_ambient: 0 }
  ];

  const el = {
    list:   $("[data-tracks]"),
    count:  $("[data-tracks-count]"),
    title:  $("[data-tracks-title]"),
    search: $("[data-search]")
  };

  const state = {
    tab: "all",           /* all | ambient | favorites */
    q: "",
    tracks: [],
    favorites: new Set(),
    online: false
  };

  const TAB_TITLES = { all: "All tracks", ambient: "Ambient only", favorites: "Favorites" };

  /* ---------------------------------------------------------------- render */

  function time(seconds) {
    const s = Math.max(0, Math.round(seconds || 0));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function row(track) {
    const liked = state.favorites.has(track.id);
    const meta = track.album ? track.artist + " / " + track.album : track.artist;
    return (
      '<div class="tracklist__row" data-track-id="' + esc(track.id) + '">' +
        '<button class="icon-btn tracklist__play" type="button" data-action="play" ' +
          'aria-label="Play ' + esc(track.title) + '">' + PLAY + "</button>" +
        '<span class="tracklist__art" aria-hidden="true"></span>' +
        '<div class="tracklist__meta">' +
          '<p class="tracklist__title">' + esc(track.title) + "</p>" +
          '<p class="tracklist__artist">' + esc(meta) + "</p>" +
        "</div>" +
        (track.is_ambient ? '<span class="chip tracklist__badge">Ambient</span>' : "") +
        '<span class="tracklist__time">' + time(track.duration_seconds) + "</span>" +
        '<button class="tracklist__icon" type="button" data-action="favorite" aria-pressed="' + liked + '" ' +
          'aria-label="' + (liked ? "Remove " : "Save ") + esc(track.title) + '">' + HEART + "</button>" +
        '<button class="tracklist__icon" type="button" data-action="add" ' +
          'aria-label="Add ' + esc(track.title) + ' to a playlist">' + PLUS + "</button>" +
      "</div>"
    );
  }

  function render() {
    if (!el.list) return;

    if (el.title) el.title.textContent = TAB_TITLES[state.tab];

    if (!state.tracks.length) {
      el.list.innerHTML = '<p class="empty">' + (
        state.tab === "favorites" ? "No favorites yet — tap a heart to save a track."
          : state.q ? "Nothing matches “" + esc(state.q) + "”."
          : "No tracks in the catalogue. Run <code class=\"code\">npm run seed</code> to load a few."
      ) + "</p>";
    } else {
      el.list.innerHTML = state.tracks.map(row).join("");
    }

    if (el.count) {
      el.count.textContent = state.online
        ? state.tracks.length + (state.tracks.length === 1 ? " track" : " tracks")
        : "demo data";
    }

    /* reflect the heart state in the player bar when it's the same track */
    const playing = LUMEN.player && LUMEN.player.state && LUMEN.player.state.trackId;
    if (playing) {
      const btn = el.list.querySelector('[data-track-id="' + CSS.escape(playing) + '"] [data-action="favorite"]');
      if (btn) btn.setAttribute("aria-pressed", String(state.favorites.has(playing)));
    }
  }

  /* ------------------------------------------------------------------ data */

  function loadFavorites() {
    return api.favorites().then(function (rows) {
      state.favorites = new Set((rows || []).map(function (t) { return t.id; }));
      return rows || [];
    });
  }

  function matches(track) {
    if (!state.q) return true;
    const q = state.q.toLowerCase();
    return String(track.title).toLowerCase().indexOf(q) !== -1 ||
           String(track.artist).toLowerCase().indexOf(q) !== -1;
  }

  function load() {
    const request = state.tab === "favorites"
      ? loadFavorites().then(function (rows) { return rows.filter(matches); })
      : loadFavorites()
          .catch(function () { /* favorites are decoration here */ })
          .then(function () { return api.tracks({ q: state.q, ambient: state.tab === "ambient" }); });

    return request.then(function (rows) {
      state.online = true;
      state.tracks = rows || [];
      render();
    }).catch(function () {
      state.online = false;
      state.tracks = DEMO.filter(function (t) {
        if (state.tab === "ambient" && !t.is_ambient) return false;
        if (state.tab === "favorites") return false;
        return matches(t);
      });
      render();
    });
  }

  /* --------------------------------------------------------------- actions */

  function play(track) {
    if (LUMEN.player) {
      LUMEN.player.setTrack({ ...track, liked: state.favorites.has(track.id) });
      LUMEN.player.setPlaying(true);
    }
  }

  function favorite(trackId, button) {
    const wasLiked = state.favorites.has(trackId);
    /* optimistic, reverted if the request fails */
    if (wasLiked) state.favorites.delete(trackId); else state.favorites.add(trackId);
    button.setAttribute("aria-pressed", String(!wasLiked));

    api.toggleFavorite(trackId).then(function (res) {
      if (res.liked) state.favorites.add(trackId); else state.favorites.delete(trackId);
      button.setAttribute("aria-pressed", String(res.liked));

      /* keep the player bar's heart in sync when it's the same track */
      const playing = LUMEN.player && LUMEN.player.state;
      if (playing && playing.trackId === trackId) {
        const bar = $('.player [data-action="like"]');
        if (bar) {
          bar.setAttribute("aria-pressed", String(res.liked));
          const icon = $("svg", bar);
          if (icon) icon.setAttribute("fill", res.liked ? "currentColor" : "none");
        }
      }

      if (state.tab === "favorites") load();
    }).catch(function () {
      if (wasLiked) state.favorites.add(trackId); else state.favorites.delete(trackId);
      button.setAttribute("aria-pressed", String(wasLiked));
    });
  }

  /* -------------------------------------------------------------- listeners */

  if (el.list) {
    el.list.addEventListener("click", function (e) {
      const rowEl = e.target.closest("[data-track-id]");
      if (!rowEl) return;
      const id = rowEl.getAttribute("data-track-id");
      const track = state.tracks.find(function (t) { return t.id === id; });
      if (!track) return;

      if (e.target.closest('[data-action="play"]')) return play(track);
      if (e.target.closest('[data-action="favorite"]')) {
        if (!state.online) return; /* demo data has no server-side favorites */
        return favorite(id, e.target.closest('[data-action="favorite"]'));
      }
      if (e.target.closest('[data-action="add"]') && LUMEN.playlists) {
        return LUMEN.playlists.menu(rowEl, track);
      }
    });
  }

  if (el.search) {
    let timer = null;
    el.search.addEventListener("input", function () {
      state.q = el.search.value.trim();
      clearTimeout(timer);
      timer = setTimeout(load, 180); /* one request per pause, not per keystroke */
    });
  }

  const tabs = Array.from(document.querySelectorAll("[data-tab]"));
  tabs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      tabs.forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
      btn.setAttribute("aria-pressed", "true");
      state.tab = btn.getAttribute("data-tab");
      load();
    });
  });

  /* ------------------------------------------------------------------ init */

  if (LUMEN.playlists) LUMEN.playlists.mount();
  load();

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && state.online) load();
  });
})(window.LUMEN);

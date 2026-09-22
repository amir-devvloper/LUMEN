/* LUMEN — playlists: create, delete, expand, add/remove tracks.
   Mounted by music.js and profile.js against the same markup
   ([data-playlists-panel] with a [data-playlist-form] and a [data-playlists]),
   and exposes a small menu so a track row can be added to a playlist. */
(function (LUMEN) {
  "use strict";

  const { $, $$, esc } = LUMEN.ui;
  const api = LUMEN.api;

  const CHEVRON =
    '<svg class="playlist__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const TRASH =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/></svg>';
  const MINUS =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 12h12"/></svg>';

  const state = {
    playlists: [],      /* [{ id, name, is_system, track_count }] */
    tracks: {},         /* playlistId -> [track] */
    open: {},           /* playlistId -> bool */
    online: false,
    listeners: []
  };

  let panel = null, listEl = null, formEl = null, errorEl = null, countEl = null;
  let openMenu = null;

  /* ------------------------------------------------------------------ util */

  function note(message, isError) {
    if (!errorEl) return;
    errorEl.textContent = message || "";
    errorEl.classList.toggle("form-note--ok", !isError && !!message);
    errorEl.toggleAttribute("hidden", !message);
  }

  function emit() {
    state.listeners.forEach(function (fn) {
      try { fn(state.playlists); } catch (_) { /* a broken listener must not stop the render */ }
    });
  }

  /* ---------------------------------------------------------------- render */

  function renderTracks(playlistId) {
    const rows = state.tracks[playlistId];
    if (!rows) return '<div class="playlist__tracks"><span class="playlist__track">Loading…</span></div>';
    if (!rows.length) return '<div class="playlist__tracks"><span class="playlist__track">Empty — add a track from the list.</span></div>';

    return '<div class="playlist__tracks">' + rows.map(function (t) {
      return (
        '<div class="playlist__track">' +
          "<span>" + esc(t.title) + " · " + esc(t.artist) + "</span>" +
          '<button class="tracklist__icon" type="button" data-remove="' + esc(t.id) + '" ' +
            'data-from="' + esc(playlistId) + '" aria-label="Remove ' + esc(t.title) + ' from this playlist">' +
            MINUS +
          "</button>" +
        "</div>"
      );
    }).join("") + "</div>";
  }

  function render() {
    if (!listEl) return;

    if (countEl) {
      countEl.textContent = state.online
        ? state.playlists.length + (state.playlists.length === 1 ? " playlist" : " playlists")
        : "offline";
    }

    if (!state.playlists.length) {
      listEl.innerHTML = '<p class="empty">' +
        (state.online ? "No playlists yet. Name one above to start." : "Playlists need the backend running.") +
        "</p>";
      return;
    }

    listEl.innerHTML = state.playlists.map(function (p) {
      const isOpen = !!state.open[p.id];
      return (
        '<div class="playlist" data-playlist="' + esc(p.id) + '">' +
          '<div class="playlist__head">' +
            '<button class="playlist__toggle" type="button" data-toggle="' + esc(p.id) + '" aria-expanded="' + isOpen + '">' +
              CHEVRON +
              '<span class="playlist__name">' + esc(p.name) + "</span>" +
            "</button>" +
            '<span class="playlist__count">' + (p.track_count || 0) + "</span>" +
            (p.is_system
              ? '<span class="playlist__system" title="System playlists can\'t be deleted">SYS</span>'
              : '<button class="tracklist__icon" type="button" data-delete="' + esc(p.id) + '" ' +
                'aria-label="Delete playlist ' + esc(p.name) + '">' + TRASH + "</button>") +
          "</div>" +
          (isOpen ? renderTracks(p.id) : "") +
        "</div>"
      );
    }).join("");
  }

  /* ------------------------------------------------------------------ data */

  function load() {
    return api.playlists().then(function (rows) {
      state.online = true;
      state.playlists = rows || [];
      render();
      emit();
      return state.playlists;
    }).catch(function () {
      state.online = false;
      render();
      emit();
    });
  }

  function loadTracks(playlistId) {
    return api.playlistTracks(playlistId).then(function (rows) {
      state.tracks[playlistId] = rows || [];
      render();
    }).catch(function () {
      state.tracks[playlistId] = [];
      render();
    });
  }

  function create(name) {
    return api.createPlaylist(name).then(function (created) {
      note("");
      return load().then(function () { return created; });
    }).catch(function (err) {
      note(err.message, true);
      throw err;
    });
  }

  function remove(playlistId) {
    return api.deletePlaylist(playlistId).then(function () {
      delete state.tracks[playlistId];
      delete state.open[playlistId];
      note("");
      return load();
    }).catch(function (err) {
      /* the backend answers 403 for is_system playlists */
      note(err.message, true);
    });
  }

  function addTrack(playlistId, trackId) {
    return api.addToPlaylist(playlistId, trackId).then(function (res) {
      delete state.tracks[playlistId]; /* force a refetch next time it opens */
      return load().then(function () { return res; });
    });
  }

  /* ------------------------------------------------------------------ menu */

  function closeMenu() {
    if (openMenu && openMenu.parentNode) openMenu.parentNode.removeChild(openMenu);
    openMenu = null;
  }

  /**
   * Small pop-over anchored inside `row`, listing the playlists a track can be
   * added to. Used by the track rows on the music page.
   */
  function menu(row, track) {
    closeMenu();

    const el = document.createElement("div");
    el.className = "menu";
    el.setAttribute("role", "menu");

    if (!state.playlists.length) {
      el.innerHTML = '<p class="menu__empty">No playlists yet — create one in the rail.</p>';
    } else {
      el.innerHTML = state.playlists.map(function (p) {
        return '<button class="menu__item" type="button" role="menuitem" data-add-to="' + esc(p.id) + '">' +
          "<span>" + esc(p.name) + "</span><span>" + (p.track_count || 0) + "</span></button>";
      }).join("");
    }

    el.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-add-to]");
      if (!btn) return;
      const playlistId = btn.getAttribute("data-add-to");
      btn.disabled = true;
      addTrack(playlistId, track.id)
        .then(function (res) { flash(row, res && res.added === false ? "Already there" : "Added"); })
        .catch(function (err) { flash(row, err.message); })
        .then(closeMenu, closeMenu);
    });

    row.appendChild(el);
    openMenu = el;
    const first = $(".menu__item", el);
    if (first) first.focus();
  }

  /** One-shot confirmation under a track row. */
  function flash(row, message) {
    const existing = $(".form-note", row);
    if (existing) existing.remove();
    const p = document.createElement("p");
    p.className = "form-note form-note--ok";
    p.setAttribute("role", "status");
    p.textContent = message;
    p.style.position = "absolute";
    p.style.insetInlineEnd = "8px";
    p.style.bottom = "-2px";
    row.appendChild(p);
    setTimeout(function () { if (p.parentNode) p.remove(); }, 1800);
  }

  document.addEventListener("click", function (e) {
    if (openMenu && !openMenu.contains(e.target) && !e.target.closest('[data-action="add"]')) closeMenu();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });

  /* ----------------------------------------------------------------- mount */

  function mount(options) {
    const opts = options || {};
    panel = opts.panel || $("[data-playlists-panel]");
    if (!panel) return Promise.resolve([]);

    listEl = $("[data-playlists]", panel);
    formEl = $("[data-playlist-form]", panel);
    errorEl = $("[data-playlist-error]", panel);
    countEl = $("[data-playlists-count]", panel);

    if (formEl) {
      formEl.addEventListener("submit", function (e) {
        e.preventDefault();
        const input = formEl.querySelector('input[name="name"]');
        const name = String(input.value || "").trim();
        if (!name) return note("Give the playlist a name.", true);
        const submit = formEl.querySelector('button[type="submit"]');
        if (submit) submit.disabled = true;
        create(name)
          .then(function () { input.value = ""; })
          .catch(function () { /* the message is already on screen */ })
          .then(function () { if (submit) submit.disabled = false; });
      });
    }

    listEl.addEventListener("click", function (e) {
      const toggle = e.target.closest("[data-toggle]");
      if (toggle) {
        const id = toggle.getAttribute("data-toggle");
        state.open[id] = !state.open[id];
        render();
        if (state.open[id] && !state.tracks[id]) loadTracks(id);
        return;
      }

      const del = e.target.closest("[data-delete]");
      if (del) {
        del.disabled = true;
        remove(del.getAttribute("data-delete"));
        return;
      }

      const rm = e.target.closest("[data-remove]");
      if (rm) {
        const playlistId = rm.getAttribute("data-from");
        rm.disabled = true;
        api.removeFromPlaylist(playlistId, rm.getAttribute("data-remove"))
          .then(function () { return loadTracks(playlistId).then(load); })
          .catch(function (err) { note(err.message, true); });
      }
    });

    render();
    return load();
  }

  LUMEN.playlists = {
    mount: mount,
    reload: load,
    menu: menu,
    addTrack: addTrack,
    closeMenu: closeMenu,
    all: function () { return state.playlists; },
    onChange: function (fn) { state.listeners.push(fn); }
  };
})(window.LUMEN);

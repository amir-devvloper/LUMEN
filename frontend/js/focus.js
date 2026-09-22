/* LUMEN — focus page: preset, sound, and the session timer.
   The countdown ticks in the browser, but the server owns the session: every
   start / pause / resume / complete answers with the authoritative
   remainingSeconds, and a reload picks the open session back up from
   /focus/active. */
(function (LUMEN) {
  "use strict";

  const { $, clock, duration, fill, esc, setPlayIcon } = LUMEN.ui;
  const api = LUMEN.api;
  const RING_LENGTH = 2 * Math.PI * 54; /* r=54 in the 120x120 viewBox */

  const PRESET_ORDER = ["deep", "sprint", "ambient"];
  const DEFAULT_PRESET = "deep";

  const el = {
    session: $("[data-session]"),
    ring:    $("[data-ring]"),
    clock:   $("[data-clock]"),
    toggle:  $('[data-action="toggle"]'),
    complete: $('[data-action="complete"]'),
    status:  $("[data-session-status]"),
    presets: $("[data-presets]"),
    sounds:  $("[data-sounds]"),
    soundNote: $("[data-sound-note]"),
    history: $("[data-history]")
  };

  function storedPreset() {
    try {
      const saved = localStorage.getItem(LUMEN.config.presetKey);
      return LUMEN.config.presets[saved] ? saved : DEFAULT_PRESET;
    } catch (_) { return DEFAULT_PRESET; }
  }

  const state = {
    online: false,
    sessionId: null,
    status: "idle",     /* idle | running | paused */
    preset: storedPreset(),
    trackId: null,
    tracks: [],
    mode: "",
    presetName: "",
    length: 0,
    remaining: 0,
    busy: false
  };

  let finishing = false;

  /* ---------------------------------------------------------------- render */

  function renderTimer() {
    const elapsed = state.length - state.remaining;
    const ratio = state.length ? Math.min(1, Math.max(0, elapsed / state.length)) : 0;

    if (el.clock) el.clock.textContent = clock(state.remaining);

    if (el.ring) {
      el.ring.setAttribute("stroke-dasharray", RING_LENGTH.toFixed(2));
      el.ring.setAttribute("stroke-dashoffset", (RING_LENGTH * (1 - ratio)).toFixed(2));
    }

    const percent = $("[data-session-percent]");
    if (percent) percent.textContent = Math.round(ratio * 100);

    const running = state.status === "running";
    /* SVG elements have no .hidden property, so toggle the attribute */
    setPlayIcon(el.toggle, running);
    if (el.toggle) {
      el.toggle.setAttribute("aria-label",
        running ? "Pause session" : state.sessionId ? "Resume session" : "Start session");
    }
    if (el.complete) el.complete.disabled = !state.sessionId;

    if (el.session) {
      el.session.classList.toggle("session--running", running);
      el.session.classList.toggle("session--idle", !state.sessionId);
    }
  }

  function renderMeta() {
    const p = LUMEN.config.presets[state.preset] || LUMEN.config.presets[DEFAULT_PRESET];
    fill({
      "session-mode": state.mode || p.label,
      "session-preset": state.presetName || p.preset,
      "session-length": Math.round((state.length || p.length * 60) / 60) + " min"
    });
  }

  function renderStatus(message) {
    if (!el.status) return;
    if (message) { el.status.textContent = message; return; }
    if (!state.online) { el.status.textContent = "Offline — the timer here is local only."; return; }
    if (!state.sessionId) { el.status.textContent = "Pick a preset and press play."; return; }
    el.status.textContent = state.status === "running"
      ? "Running · " + clock(state.remaining) + " left of " + Math.round(state.length / 60) + " min"
      : "Paused · " + clock(state.remaining) + " left";
  }

  function renderPresets() {
    if (!el.presets) return;
    const locked = !!state.sessionId;

    el.presets.innerHTML = PRESET_ORDER.map(function (key) {
      const p = LUMEN.config.presets[key];
      const active = key === state.preset;
      return (
        '<button class="pick" type="button" data-preset="' + key + '" aria-pressed="' + active + '"' +
          (locked ? " disabled" : "") + ">" +
          '<span class="pick__body">' +
            '<span class="pick__name">' + esc(p.label) + "</span>" +
            '<span class="pick__meta">' + p.length + " min · " + p.break + " min break</span>" +
          "</span>" +
        "</button>"
      );
    }).join("");
  }

  function renderSounds() {
    if (!el.sounds) return;
    const locked = !!state.sessionId;

    if (!state.tracks.length) {
      el.sounds.innerHTML = '<p class="empty">' +
        (state.online ? "No tracks yet — run the seed to load a few."
                      : "Sounds need the backend running.") + "</p>";
      return;
    }

    const none =
      '<button class="pick" type="button" data-sound="" aria-pressed="' + (!state.trackId) + '"' +
        (locked ? " disabled" : "") + ">" +
        '<span class="pick__body"><span class="pick__name">Silence</span>' +
        '<span class="pick__meta">no track attached</span></span></button>';

    el.sounds.innerHTML = none + state.tracks.map(function (t) {
      const active = t.id === state.trackId;
      return (
        '<button class="pick" type="button" data-sound="' + esc(t.id) + '" aria-pressed="' + active + '"' +
          (locked ? " disabled" : "") + ">" +
          '<span class="pick__body">' +
            '<span class="pick__name">' + esc(t.title) + "</span>" +
            '<span class="pick__meta">' + esc(t.artist) + "</span>" +
          "</span>" +
        "</button>"
      );
    }).join("");

    if (el.soundNote) el.soundNote.textContent = locked ? "locked while running" : "optional";
  }

  function renderHistory(rows) {
    if (!el.history) return;

    if (!rows || !rows.length) {
      el.history.innerHTML = '<p class="empty">Finished sessions show up here.</p>';
      return;
    }

    el.history.innerHTML = rows.slice(0, 8).map(function (s) {
      const focused = Math.max(0, s.lengthSeconds - s.remainingSeconds);
      const when = s.startedAt ? new Date(s.startedAt) : null;
      const label = when
        ? when.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " +
          when.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
        : "—";
      return (
        '<div class="history__row history__row--' + esc(s.status) + '">' +
          '<span class="history__dot" aria-hidden="true"></span>' +
          '<div class="history__body">' +
            '<p class="history__mode">' + esc(s.mode) + "</p>" +
            '<p class="history__when">' + esc(label) + " · " + esc(s.status) + "</p>" +
          "</div>" +
          '<span class="history__time">' + duration(focused) + "</span>" +
        "</div>"
      );
    }).join("");
  }

  /* ------------------------------------------------------------------ data */

  /** Apply a session object from the API (or null = nothing open). */
  function applySession(s) {
    if (!s || s.status === "completed" || s.status === "abandoned") {
      state.sessionId = null;
      state.status = "idle";
      const p = LUMEN.config.presets[state.preset] || LUMEN.config.presets[DEFAULT_PRESET];
      state.mode = p.label;
      state.presetName = p.preset;
      state.length = p.length * 60;
      state.remaining = s ? 0 : p.length * 60;
      if (s) state.remaining = 0;
    } else {
      state.sessionId = s.id;
      state.status = s.status;
      state.mode = s.mode;
      state.presetName = s.preset;
      state.length = s.lengthSeconds;
      state.remaining = s.remainingSeconds; /* the server is the source of truth */
      if (s.trackId) state.trackId = s.trackId;
    }
    renderMeta();
    renderPresets();
    renderSounds();
    renderTimer();
    renderStatus();
  }

  function loadActive() {
    return api.activeSession().then(function (open) {
      state.online = true;
      applySession(open);
    }).catch(function () {
      state.online = false;
      applySession(null);
    });
  }

  function loadTracks() {
    return api.tracks().then(function (rows) {
      state.tracks = rows || [];
      if (state.trackId && !state.tracks.some(function (t) { return t.id === state.trackId; })) {
        state.trackId = null;
      }
      renderSounds();
    }).catch(function () {
      state.tracks = [];
      renderSounds();
    });
  }

  function loadHistory() {
    return api.focusHistory().then(renderHistory).catch(function () { renderHistory(null); });
  }

  /* --------------------------------------------------------------- actions */

  function guard(promise) {
    state.busy = true;
    return promise.then(function (value) { state.busy = false; return value; },
                        function (err) { state.busy = false; throw err; });
  }

  function start() {
    return guard(api.startSession(state.preset, state.trackId || undefined)).then(function (s) {
      applySession(s);
      loadHistory();
      const track = state.tracks.find(function (t) { return t.id === state.trackId; });
      if (track && LUMEN.player) { LUMEN.player.setTrack(track); LUMEN.player.setPlaying(true); }
    }).catch(function (err) {
      renderStatus("Could not start: " + err.message);
    });
  }

  function toggle() {
    if (state.busy) return;

    if (!state.online) { /* offline: local countdown only, so the page still demos */
      state.status = state.status === "running" ? "paused" : "running";
      renderTimer();
      return;
    }

    if (!state.sessionId) return start();

    const wasRunning = state.status === "running";
    state.status = wasRunning ? "paused" : "running"; /* optimistic; the reply re-syncs */
    renderTimer();

    guard(wasRunning ? api.pauseSession(state.sessionId) : api.resumeSession(state.sessionId))
      .then(applySession)
      .catch(function (err) {
        state.status = wasRunning ? "running" : "paused";
        renderTimer();
        renderStatus(err.message);
      });
  }

  function complete() {
    if (finishing || !state.sessionId) return;
    finishing = true;
    api.completeSession(state.sessionId).then(function (done) {
      applySession(done);
      renderStatus("Session complete — nice one.");
      loadHistory();
    }).catch(function (err) {
      renderStatus("Could not complete: " + err.message);
    }).then(function () { finishing = false; });
  }

  /* ------------------------------------------------------------------ tick */

  setInterval(function () {
    if (state.status !== "running") return;
    state.remaining = Math.max(0, state.remaining - 1);
    renderTimer();
    renderStatus();
    if (state.remaining === 0) {
      state.status = "idle";
      renderTimer();
      if (state.online && state.sessionId) complete();
    }
  }, 1000);

  /* -------------------------------------------------------------- listeners */

  if (el.toggle) el.toggle.addEventListener("click", toggle);
  if (el.complete) el.complete.addEventListener("click", complete);

  if (el.presets) {
    el.presets.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-preset]");
      if (!btn || btn.disabled) return;
      state.preset = btn.getAttribute("data-preset");
      try { localStorage.setItem(LUMEN.config.presetKey, state.preset); } catch (_) {}
      applySession(null); /* preview the new preset's length on the idle ring */
    });
  }

  if (el.sounds) {
    el.sounds.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-sound]");
      if (!btn || btn.disabled) return;
      state.trackId = btn.getAttribute("data-sound") || null;
      renderSounds();
      const track = state.tracks.find(function (t) { return t.id === state.trackId; });
      if (track && LUMEN.player) LUMEN.player.setTrack(track);
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.code === "Space" && e.target === document.body) { e.preventDefault(); toggle(); }
  });

  /* Background tabs throttle timers: re-sync with the server on return. */
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && state.online && !state.busy) { loadActive(); loadHistory(); }
  });

  /* ------------------------------------------------------------------ init */

  applySession(null);
  renderHistory(null);
  loadTracks();
  loadActive();
  loadHistory();
})(window.LUMEN);

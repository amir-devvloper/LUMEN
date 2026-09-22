/* LUMEN — onboarding, shown once right after signup (auth.js sends new
   accounts here). Three steps: name + daily goal, default preset, and a sound
   to start with. Everything it collects goes somewhere real: the name and goal
   through PATCH /users/me, the preset into localStorage (the focus page reads
   it), the sound into favorites. "Skip for now" is always available. */
(function (LUMEN) {
  "use strict";

  const { $, $$, esc } = LUMEN.ui;
  const api = LUMEN.api;

  /* no session -> nothing to set up */
  if (!api.token()) { location.replace("login.html"); return; }

  const LAST_STEP = 3;

  const el = {
    title: $("[data-step-title]"),
    sub:   $("[data-step-sub]"),
    now:   $("[data-step-now]"),
    error: $("[data-error]"),
    next:  $("[data-next]"),
    back:  $("[data-back]"),
    name:  $("[data-name]"),
    goal:  $("[data-goal]"),
    presets: $("[data-presets]"),
    sounds:  $("[data-sounds]")
  };

  const COPY = {
    1: { title: "Welcome to Lumen", sub: "Two things before you start.", cta: "Continue" },
    2: { title: "How do you like to work?", sub: "This becomes the preset the focus page opens with.", cta: "Continue" },
    3: { title: "Pick a sound", sub: "We'll save it to your favorites — skip if you'd rather work in silence.", cta: "Finish" }
  };

  const state = { step: 1, preset: "deep", trackId: null, tracks: [] };

  /* ---------------------------------------------------------------- render */

  function error(message) {
    if (!el.error) return;
    el.error.textContent = message || "";
    el.error.toggleAttribute("hidden", !message);
  }

  function renderStep() {
    const copy = COPY[state.step];
    if (el.title) el.title.textContent = copy.title;
    if (el.sub) el.sub.textContent = copy.sub;
    if (el.now) el.now.textContent = state.step;
    if (el.next) el.next.textContent = copy.cta;
    if (el.back) el.back.toggleAttribute("hidden", state.step === 1);

    $$("[data-step]").forEach(function (panel) {
      panel.toggleAttribute("hidden", Number(panel.getAttribute("data-step")) !== state.step);
    });

    $$("[data-step-dot]").forEach(function (dot) {
      dot.setAttribute("data-done", String(Number(dot.getAttribute("data-step-dot")) <= state.step));
    });

    error("");
  }

  function renderPresets() {
    if (!el.presets) return;
    el.presets.innerHTML = ["deep", "sprint", "ambient"].map(function (key) {
      const p = LUMEN.config.presets[key];
      return (
        '<button class="choice" type="button" data-preset="' + key + '" aria-pressed="' + (key === state.preset) + '">' +
          '<span class="choice__body">' +
            '<span class="choice__name">' + esc(p.label) + "</span>" +
            '<span class="choice__meta">' + p.length + " min focus · " + p.break + " min break</span>" +
          "</span>" +
        "</button>"
      );
    }).join("");
  }

  function renderSounds() {
    if (!el.sounds) return;

    if (!state.tracks.length) {
      el.sounds.innerHTML = '<p class="auth__sub">No tracks in the catalogue yet — you can save favorites later from the Music page.</p>';
      return;
    }

    el.sounds.innerHTML = state.tracks.map(function (t) {
      return (
        '<button class="choice" type="button" data-sound="' + esc(t.id) + '" aria-pressed="' + (t.id === state.trackId) + '">' +
          '<span class="choice__body">' +
            '<span class="choice__name">' + esc(t.title) + "</span>" +
            '<span class="choice__meta">' + esc(t.artist) + (t.is_ambient ? " · ambient" : "") + "</span>" +
          "</span>" +
        "</button>"
      );
    }).join("");
  }

  /* ---------------------------------------------------------------- steps */

  function saveProfile() {
    const patch = {};
    const name = String((el.name && el.name.value) || "").trim();
    if (name) patch.name = name;

    const minutes = Number(el.goal && el.goal.value);
    if (!Number.isInteger(minutes) || minutes < 30 || minutes > 1440) {
      if (el.goal) el.goal.setAttribute("aria-invalid", "true");
      return Promise.reject(new Error("Enter a whole number between 30 and 1440 minutes."));
    }
    if (el.goal) el.goal.removeAttribute("aria-invalid");
    patch.daily_goal_minutes = minutes;

    return api.updateMe(patch);
  }

  function savePreset() {
    try { localStorage.setItem(LUMEN.config.presetKey, state.preset); } catch (_) { /* storage blocked */ }
    return Promise.resolve();
  }

  function saveSound() {
    if (!state.trackId) return Promise.resolve();
    return api.toggleFavorite(state.trackId).then(function (res) {
      /* toggleFavorite flips: if it was already liked this would unlike it */
      if (res && res.liked === false) return api.toggleFavorite(state.trackId);
    });
  }

  const SAVE = { 1: saveProfile, 2: savePreset, 3: saveSound };

  function advance() {
    el.next.disabled = true;
    SAVE[state.step]()
      .then(function () {
        if (state.step === LAST_STEP) { location.href = "dashboard.html"; return; }
        state.step += 1;
        renderStep();
        el.next.disabled = false;
      })
      .catch(function (err) {
        error(err instanceof TypeError ? "Can't reach the server. Is the backend running?" : err.message);
        el.next.disabled = false;
      });
  }

  /* -------------------------------------------------------------- listeners */

  if (el.next) el.next.addEventListener("click", advance);

  if (el.back) el.back.addEventListener("click", function () {
    if (state.step > 1) { state.step -= 1; renderStep(); }
  });

  if (el.presets) el.presets.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-preset]");
    if (!btn) return;
    state.preset = btn.getAttribute("data-preset");
    renderPresets();
  });

  if (el.sounds) el.sounds.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-sound]");
    if (!btn) return;
    const id = btn.getAttribute("data-sound");
    state.trackId = state.trackId === id ? null : id; /* tapping again deselects */
    renderSounds();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && el.next && !el.next.disabled) { e.preventDefault(); advance(); }
  });

  /* ------------------------------------------------------------------ init */

  renderStep();
  renderPresets();
  renderSounds();

  api.me().then(function (user) {
    if (!user) return;
    if (el.name && !el.name.value) el.name.value = user.name || "";
    if (el.goal && user.daily_goal_minutes) el.goal.value = user.daily_goal_minutes;
  }).catch(function () { /* offline: the defaults in the markup still work */ });

  api.tracks().then(function (rows) {
    state.tracks = (rows || []).slice(0, 8);
    renderSounds();
  }).catch(function () { renderSounds(); });
})(window.LUMEN);

/* LUMEN — dashboard page: focus ring, session timer, week chart, stats.
   The timer ticks locally; the backend is the source of truth for the session
   (start / pause / resume / complete) and for the stats. If the API is
   unreachable the page keeps working on the design's demo values. */
(function (LUMEN) {
  "use strict";

  const { $, clock, duration, fill } = LUMEN.ui;
  const api = LUMEN.api;
  const RING_LENGTH = 2 * Math.PI * 54; /* r=54 in the 120x120 viewBox */
  const DEFAULT_PRESET = "deep";

  const el = {
    session: $("[data-session]"),
    ring:    $("[data-ring]"),
    clock:   $("[data-clock]"),
    toggle:  $('[data-action="toggle"]'),
    reset:   $('[data-action="reset"]'),
    skip:    $('[data-action="skip"]'),
    bars:    $("[data-bars]")
  };

  const state = {
    online: false,      /* true once the API has answered */
    sessionId: null,    /* null = no open session on the server */
    preset: DEFAULT_PRESET,
    mode: "Deep work",
    presetName: "Creative sprint",
    running: true,
    remaining: 47 * 60 + 32,
    length: 90 * 60,
    breakIn: 17 * 60 + 32,
    breakLength: 10 * 60
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

    const percentEl = $("[data-session-percent]");
    if (percentEl) percentEl.textContent = Math.round(ratio * 100);

    /* no open session yet -> there is no break to count down to */
    const idle = state.online && !state.sessionId && state.remaining > 0;

    const breakEl = $("[data-next-break]");
    if (breakEl) breakEl.textContent = idle ? "--:--" : clock(state.breakIn);

    const etaEl = $("[data-next-eta]");
    if (etaEl) etaEl.textContent = idle ? "–" : Math.max(0, Math.round(state.breakIn / 60)) + "m";

    const atEl = $("[data-next-time]");
    if (atEl) {
      const at = new Date(Date.now() + state.breakIn * 1000);
      atEl.textContent = idle ? "--:--" : String(at.getHours()).padStart(2, "0") + ":" + String(at.getMinutes()).padStart(2, "0");
    }

    if (el.toggle) {
      const pause = el.toggle.querySelector('[data-icon="pause"]');
      const play  = el.toggle.querySelector('[data-icon="play"]');
      if (pause) pause.toggleAttribute("hidden", !state.running);
      if (play)  play.toggleAttribute("hidden", state.running);
      el.toggle.setAttribute("aria-label", state.running ? "Pause session" : (state.sessionId || !state.online ? "Resume session" : "Start session"));
    }

    if (el.session) el.session.classList.toggle("session--running", state.running);
  }

  function renderMeta() {
    fill({
      "session-mode": state.mode,
      "session-preset": state.presetName,
      "session-length": Math.round(state.length / 60) + " min",
      "next-length": Math.round(state.breakLength / 60) + " minutes"
    });
  }

  function renderWeek(days) {
    if (!el.bars) return;
    const peak = Math.max.apply(null, days.map((d) => d.minutes).concat(1)); /* concat(1): an empty week must not divide by 0 */
    const todayIndex = (new Date().getDay() + 6) % 7; /* Monday-first */

    el.bars.innerHTML = days.map((d, i) => {
      const height = Math.max(6, Math.round((d.minutes / peak) * 100));
      const today = i === todayIndex ? " bar--today" : "";
      return (
        '<div class="bar' + today + '">' +
          '<div class="bar__slot"><div class="bar__fill" style="height:' + height + '%"></div></div>' +
          '<div class="bar__day">' + d.label.charAt(0) + '</div>' +
        '</div>'
      );
    }).join("");
  }

  const DEMO_WEEK = [
    { label: "Mon", minutes: 132 }, { label: "Tue", minutes: 168 },
    { label: "Wed", minutes: 96 },  { label: "Thu", minutes: 214 },
    { label: "Fri", minutes: 198 }, { label: "Sat", minutes: 226 },
    { label: "Sun", minutes: 150 }
  ];

  /** "+24m vs yesterday" style notes; `note` gets --up / --down modifiers. */
  function setNote(selector, text, direction, base) {
    const node = $(selector);
    if (!node) return;
    node.textContent = text;
    node.classList.toggle(base + "--up", direction > 0);
    node.classList.toggle(base + "--down", direction < 0);
  }

  function renderToday(t) {
    fill({
      "stat-today": duration(t.focusSeconds),
      "stat-goal": t.goalPercent + "%",
      "stat-streak": t.streakDays + (t.streakDays === 1 ? " day" : " days")
    });

    const diff = t.focusSeconds - t.yesterdaySeconds;
    const diffText = diff === 0 ? "Same as yesterday" : (diff > 0 ? "+" : "−") + duration(Math.abs(diff)) + " vs yesterday";
    setNote("[data-stat-today-note]", diffText, diff, "stat__note");

    const left = t.goalSeconds - t.focusSeconds;
    fill({ "stat-goal-note": left > 0 ? duration(left) + " remaining" : "Goal reached" });
    fill({ "stat-streak-note": "Personal best: " + Math.max(t.bestStreakDays, t.streakDays) });
  }

  function renderWeekly(w) {
    const sign = w.deltaPercent > 0 ? "+" : w.deltaPercent < 0 ? "−" : "";
    fill({
      "week-range": w.range,
      "week-total": duration(w.totalSeconds),
      "week-delta": sign + Math.abs(w.deltaPercent) + "%",
      "week-sessions": w.sessions,
      "week-completion": w.completionRate,
      "week-average": (w.averageSeconds / 3600).toFixed(1) + "h"
    });

    const delta = $("[data-week-delta]");
    if (delta) {
      delta.classList.toggle("delta--flat", w.deltaPercent === 0);
      delta.classList.toggle("delta--down", w.deltaPercent < 0);
    }
    renderWeek(w.days);
  }

  /* ------------------------------------------------------------------ data */

  /** Apply a session object from the API (or null = nothing open) to the timer. */
  function applySession(s) {
    if (!s || s.status === "completed" || s.status === "abandoned") {
      state.sessionId = null;
      state.running = false;
      if (!s) {
        const p = LUMEN.config.presets[state.preset] || LUMEN.config.presets[DEFAULT_PRESET];
        state.mode = p.label;
        state.presetName = p.preset;
        state.length = state.remaining = p.length * 60;
        state.breakLength = p.break * 60;
        state.breakIn = state.remaining;
      } else {
        state.remaining = s.remainingSeconds;
      }
    } else {
      state.sessionId = s.id;
      state.running = s.status === "running";
      state.mode = s.mode;
      state.presetName = s.preset;
      state.length = s.lengthSeconds;
      state.remaining = s.remainingSeconds;
      state.breakLength = s.breakSeconds;
      state.breakIn = s.breakInSeconds;
    }
    renderMeta();
    renderTimer();
  }

  async function loadSession() {
    try {
      const open = await api.activeSession();
      state.online = true; /* before applySession, so the first render already knows */
      applySession(open);
    } catch (err) {
      /* offline or not signed in: keep the demo state */
    }
  }

  async function loadStats() {
    const [today, week, insight] = await Promise.allSettled([api.dailyStats(), api.weekly(), api.insight()]);

    if (today.status === "fulfilled" && today.value) renderToday(today.value);
    if (week.status === "fulfilled" && week.value) renderWeekly(week.value);
    else renderWeek(DEMO_WEEK);

    if (insight.status === "fulfilled" && insight.value) {
      fill({ "insight-title": insight.value.title, "insight-body": insight.value.body });
    }
  }

  async function startSession() {
    try {
      applySession(await api.startSession(state.preset));
      loadStats();
    } catch (err) {
      console.warn("Could not start session:", err.message);
    }
  }

  async function finishSession() {
    if (finishing || !state.online || !state.sessionId) return;
    finishing = true;
    try {
      const done = await api.completeSession(state.sessionId);
      applySession(done);
      state.remaining = 0;
      renderTimer();
      loadStats();
    } catch (err) {
      console.warn("Could not complete session:", err.message);
    } finally {
      finishing = false;
    }
  }

  /* ------------------------------------------------------------------ tick */

  function tick() {
    if (!state.running) return;
    state.remaining = Math.max(0, state.remaining - 1);
    state.breakIn = state.online ? state.remaining : Math.max(0, state.breakIn - 1);
    renderTimer();
    if (state.remaining === 0) {
      state.running = false;
      finishSession();
      renderTimer();
    }
  }

  /* --------------------------------------------------------------- actions */

  async function toggle() {
    if (state.online && !state.sessionId) return startSession();

    if (state.online) {
      const wasRunning = state.running;
      state.running = !wasRunning; /* optimistic; the server reply re-syncs the clock */
      renderTimer();
      try {
        applySession(await (wasRunning ? api.pauseSession(state.sessionId) : api.resumeSession(state.sessionId)));
      } catch (err) {
        state.running = wasRunning;
        renderTimer();
      }
      return;
    }

    state.running = !state.running;
    renderTimer();
  }

  function reset() {
    if (state.online && state.sessionId) return startSession(); /* restart = fresh session, same preset */
    if (state.online) return applySession(null);
    state.remaining = state.length;
    state.breakIn = Math.round(state.length / 2);
    state.running = true;
    renderTimer();
  }

  function skip() {
    if (state.online) {
      if (state.sessionId) finishSession();
      return;
    }
    state.remaining = 0;
    state.running = false;
    renderTimer();
  }

  /* ------------------------------------------------------------------ init */

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }

  const greetEl = $("[data-greeting]");
  if (greetEl) greetEl.textContent = greeting();

  renderMeta();
  renderTimer();
  renderWeek(DEMO_WEEK);
  setInterval(tick, 1000);

  loadSession();
  loadStats();

  if (el.toggle) el.toggle.addEventListener("click", toggle);
  if (el.reset)  el.reset.addEventListener("click", reset);
  if (el.skip)   el.skip.addEventListener("click", skip);

  document.addEventListener("keydown", function (e) {
    if (e.code === "Space" && e.target === document.body) {
      e.preventDefault();
      toggle();
    }
  });

  /* Background tabs throttle timers: re-sync from the server when we come back. */
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && state.online) { loadSession(); loadStats(); }
  });
})(window.LUMEN);

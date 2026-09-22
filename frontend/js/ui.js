/* LUMEN — small DOM and formatting helpers used across pages. */
(function (LUMEN) {
  "use strict";

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** 3932 -> "65:32" (mm:ss, hours folded into minutes for the timer) */
  function clock(seconds) {
    const s = Math.max(0, Math.round(seconds));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  /** 13320 -> "3h 42m" */
  function duration(seconds) {
    const m = Math.round(Math.max(0, seconds) / 60);
    const h = Math.floor(m / 60);
    return h ? h + "h " + (m % 60) + "m" : m + "m";
  }

  function greeting(date = new Date()) {
    const h = date.getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }

  function dateLabel(date = new Date()) {
    const day = date.toLocaleDateString("en-US", { weekday: "short" });
    const rest = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return day + " · " + rest;
  }

  /** Escape text before it goes into an innerHTML template (track titles, playlist names…). */
  function esc(value) {
    return String(value).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  /** Write text into every [data-*] slot with the given name. */
  function fill(map, root = document) {
    Object.entries(map).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      $$('[data-' + key + ']', root).forEach((el) => { el.textContent = value; });
    });
  }

  /** Pointer + keyboard driven horizontal track (seek bar, volume). */
  function bindTrack(el, { onChange } = {}) {
    if (!el) return;
    const fillEl = $(".track__fill", el);

    const set = (ratio, commit) => {
      const pct = Math.min(100, Math.max(0, ratio * 100));
      if (fillEl) fillEl.style.width = pct + "%";
      el.setAttribute("aria-valuenow", Math.round(pct));
      if (commit && onChange) onChange(pct / 100);
    };

    const fromEvent = (e) => {
      const r = el.getBoundingClientRect();
      return (e.clientX - r.left) / r.width;
    };

    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      set(fromEvent(e), true);
      const move = (ev) => set(fromEvent(ev), true);
      const up = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
    });

    el.addEventListener("keydown", (e) => {
      const now = Number(el.getAttribute("aria-valuenow")) || 0;
      const step = e.shiftKey ? 10 : 2;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") { set((now + step) / 100, true); e.preventDefault(); }
      if (e.key === "ArrowLeft"  || e.key === "ArrowDown") { set((now - step) / 100, true); e.preventDefault(); }
    });

    return { set: (ratio) => set(ratio, false) };
  }

  /** Swap a paired play/pause icon inside a button. */
  function setPlayIcon(button, playing) {
    if (!button) return;
    const pause = $('[data-icon="pause"]', button);
    const play  = $('[data-icon="play"]', button);
    if (pause) pause.toggleAttribute("hidden", !playing);
    if (play)  play.toggleAttribute("hidden", playing);
    button.setAttribute("aria-label", playing ? "Pause" : "Play");
  }

  LUMEN.ui = { $, $$, clock, duration, greeting, dateLabel, esc, fill, bindTrack, setPlayIcon };
})(window.LUMEN);

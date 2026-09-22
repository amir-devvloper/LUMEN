/* LUMEN — analytics page. Renders from the backend; if the API is
   unreachable it falls back to the design's local demo data so the page is
   never empty. */
(function (LUMEN) {
  "use strict";

  const { $, $$, fill, duration, esc } = LUMEN.ui;
  const api = LUMEN.api;

  /* -------------------------------------------------------------- data */

  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  /* the current range: "week" (default) or "month" (last 30 days) */
  let range = "week";
  let cache = { week: null, month: null };

  let week = [
    { label: "Mon", minutes: 132 }, { label: "Tue", minutes: 168 },
    { label: "Wed", minutes: 96 },  { label: "Thu", minutes: 214 },
    { label: "Fri", minutes: 198 }, { label: "Sat", minutes: 226 },
    { label: "Sun", minutes: 150 }
  ];

  /* 7 days (Mon-Sun) x 6 three-hour blocks, 0-1 intensity */
  let heat = {
    rows: ["6–9", "9–12", "12–15", "15–18", "18–21", "21–24"],
    values: [
      [0.10, 0.35, 0.20, 0.55, 0.30, 0.40, 0.15],
      [0.65, 0.90, 0.80, 0.95, 0.70, 0.50, 0.25],
      [0.40, 0.55, 0.45, 0.60, 0.50, 0.35, 0.20],
      [0.20, 0.30, 0.35, 0.25, 0.40, 0.45, 0.30],
      [0.15, 0.20, 0.15, 0.30, 0.25, 0.60, 0.55],
      [0.05, 0.10, 0.05, 0.15, 0.20, 0.45, 0.35]
    ]
  };

  let mix = [
    { label: "Deep work",    percent: 52 },
    { label: "Sprint",       percent: 31 },
    { label: "Ambient flow", percent: 17 }
  ];

  let sounds = [
    { name: "Weightless Horizon", meta: "Aether / Still Forms", seconds: 3 * 3600 + 10 * 60 },
    { name: "Low Tide",           meta: "Mira Lund",            seconds: 2 * 3600 + 42 * 60 },
    { name: "Glass Rooms",        meta: "Aether",               seconds: 1 * 3600 + 58 * 60 }
  ];

  /* ------------------------------------------------------------ render */

  /** "Saturday" for a week bar, "Sat, Sep 19" for a bar in the 30-day range. */
  function bestDayLabel(day) {
    const FULL = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
    if (range === "week") return FULL[day.label] || day.label;
    if (!day.date) return day.label;
    const [y, m, d] = day.date.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function renderTrend() {
    const el = $("[data-trend]");
    if (!el) return;
    const peak = Math.max.apply(null, week.map((d) => d.minutes).concat(1)); /* an empty week must not divide by 0 */
    const peakIndex = week.findIndex((d) => d.minutes === peak);

    /* 7 bars fit the default grid; 30 need their own column count and no labels */
    el.style.gridTemplateColumns = "repeat(" + week.length + ", minmax(0, 1fr))";
    el.classList.toggle("trend__chart--dense", week.length > 10);

    el.innerHTML = week.map((d, i) => {
      const height = Math.max(6, Math.round((d.minutes / peak) * 100));
      const isPeak = i === peakIndex ? " trend__bar--peak" : "";
      return (
        '<div class="trend__bar' + isPeak + '">' +
          '<div class="trend__slot">' +
            '<span class="trend__value">' + d.minutes + '</span>' +
            '<div class="trend__fill" style="height:' + height + '%"></div>' +
          '</div>' +
          '<div class="trend__day">' + esc(d.label) + '</div>' +
        '</div>'
      );
    }).join("");

    const total = week.reduce((sum, d) => sum + d.minutes, 0);
    fill({
      "trend-total": total.toLocaleString("en-US") + " min total",
      "trend-best": total > 0 ? "Best day: " + bestDayLabel(week[peakIndex]) : "No focus time yet"
    });
  }

  function renderHeatmap() {
    const grid = $("[data-heatmap]");
    if (!grid) return;

    /* always 7 weekday columns — `week` holds 30 entries in the month range */
    let html = '<div class="heatmap__corner"></div>';
    WEEKDAYS.forEach((d) => { html += '<div class="heatmap__col-label">' + esc(d.charAt(0)) + '</div>'; });

    heat.rows.forEach((rowLabel, r) => {
      html += '<div class="heatmap__row-label">' + esc(rowLabel) + '</div>';
      heat.values[r].forEach((v) => {
        html += '<div class="heatmap__cell" style="opacity:' + (0.12 + v * 0.88).toFixed(2) + '" title="' + Math.round(v * 100) + '%"></div>';
      });
    });

    grid.innerHTML = html;

    const legend = $("[data-legend]");
    if (legend) {
      legend.innerHTML = [0.2, 0.4, 0.6, 0.8, 1].map(function (v) {
        return '<span style="opacity:' + v.toFixed(2) + '"></span>';
      }).join("");
    }
  }

  function renderMix() {
    const el = $("[data-mix]");
    if (!el) return;
    if (!mix.length) { el.innerHTML = '<p class="sounds__meta">No completed sessions yet.</p>'; return; }
    el.innerHTML = mix.map(function (m) {
      return (
        '<div class="mix__row">' +
          '<div class="mix__head"><span>' + esc(m.label) + '</span><span>' + m.percent + '%</span></div>' +
          '<div class="mix__track"><div class="mix__fill" style="width:' + m.percent + '%"></div></div>' +
        '</div>'
      );
    }).join("");
  }

  function renderSounds() {
    const el = $("[data-sounds]");
    if (!el) return;
    if (!sounds.length) { el.innerHTML = '<p class="sounds__meta">Play a track during a session to see it here.</p>'; return; }
    el.innerHTML = sounds.map(function (s, i) {
      return (
        '<div class="sounds__item">' +
          '<span class="sounds__rank">' + (i + 1) + '</span>' +
          '<span class="sounds__art" aria-hidden="true"></span>' +
          '<div>' +
            '<p class="sounds__name">' + esc(s.name) + '</p>' +
            '<p class="sounds__meta">' + esc(s.meta) + '</p>' +
          '</div>' +
          '<span class="sounds__time">' + duration(s.seconds) + '</span>' +
        '</div>'
      );
    }).join("");
  }

  /** Top tiles + page header, from /analytics/weekly and /analytics/today. */
  function renderTiles(w, t) {
    if (w) {
      const sign = w.deltaPercent > 0 ? "+" : w.deltaPercent < 0 ? "−" : "";
      const previous = range === "month" ? "the previous 30 days" : "last week";
      fill({
        "range-label": w.range,
        "tile-focus": duration(w.totalSeconds),
        "tile-focus-note": w.deltaPercent === 0 ? "same as " + previous : sign + Math.abs(w.deltaPercent) + "% vs " + previous,
        "tile-avg": duration(w.averageSessionSeconds),
        "tile-avg-note": "across " + w.sessions + " session" + (w.sessions === 1 ? "" : "s"),
        "tile-completion": w.completionRate + "%",
        "tile-completion-note": w.abandonedSessions === 0 ? "every session finished"
          : w.abandonedSessions + " session" + (w.abandonedSessions === 1 ? "" : "s") + " cut short"
      });
      const note = $("[data-tile-focus-note]");
      if (note) {
        note.classList.toggle("tile__note--up", w.deltaPercent > 0);
        note.classList.toggle("tile__note--down", w.deltaPercent < 0);
      }
    }
    if (t) {
      fill({
        "tile-streak": t.streakDays + (t.streakDays === 1 ? " day" : " days"),
        "tile-streak-note": "personal best: " + Math.max(t.bestStreakDays, t.streakDays)
      });
    }
  }

  /** ISO-8601 week number, for the "Week 38" chip. */
  function isoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  function renderAll() {
    renderTrend();
    renderHeatmap();
    renderMix();
    renderSounds();
  }

  /* -------------------------------------------------------------- init */

  fill({ "week-number": "Week " + isoWeek(new Date()) });
  renderAll();

  let today = null;

  Promise.allSettled([api.weekly(), api.dailyStats(), api.heatmap(), api.sessionMix(), api.topSounds()])
    .then(function (results) {
      const value = (i) => (results[i].status === "fulfilled" ? results[i].value : null);
      const w = value(0), t = value(1), h = value(2), m = value(3), s = value(4);

      cache.week = w;
      today = t;
      if (w) week = w.days.map((d) => ({ label: d.label, date: d.date, minutes: d.minutes }));
      if (h) heat = h;
      if (m) mix = m;
      if (s) sounds = s;

      renderTiles(w, t);
      renderAll();
    });

  /** Swap the trend chart + tiles between /analytics/weekly and /analytics/monthly. */
  function showRange(next) {
    range = next;

    const apply = function (data) {
      if (!data) return; /* offline: keep whatever is on screen */
      cache[next] = data;
      week = data.days.map((d) => ({ label: d.label, date: d.date, minutes: d.minutes }));
      renderTiles(data, today);
      renderAll();
    };

    if (cache[next]) return apply(cache[next]);
    (next === "month" ? api.monthly() : api.weekly()).then(apply).catch(function () {
      fill({ "trend-best": "Month view needs the backend running" });
    });
  }

  const toggleButtons = $$("[data-range]");
  toggleButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      const next = btn.getAttribute("data-range");
      if (next === range) return;
      toggleButtons.forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
      btn.setAttribute("aria-pressed", "true");
      showRange(next);
    });
  });
})(window.LUMEN);

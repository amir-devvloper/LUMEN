/* LUMEN — AI page: the current insight plus the numbers it was derived from.
   The insight itself is rule-based today (see generateInsight() in
   backend/services/openai.service.js); this page exists so the "See how this
   was measured" link on the dashboard leads somewhere honest. */
(function (LUMEN) {
  "use strict";

  const { $, fill, duration, esc } = LUMEN.ui;
  const api = LUMEN.api;

  const el = {
    signals: $("[data-signals]"),
    mix: $("[data-mix]")
  };

  function signal(label, value, note) {
    return (
      "<div>" +
        '<p class="signal__label">' + esc(label) + "</p>" +
        '<p class="signal__value">' + esc(value) + "</p>" +
        '<p class="signal__note">' + esc(note) + "</p>" +
      "</div>"
    );
  }

  function renderSignals(week, today) {
    if (!el.signals) return;

    if (!week) {
      el.signals.innerHTML = '<p class="empty">These numbers come from the API — start the backend to see yours.</p>';
      return;
    }

    const sign = week.deltaPercent > 0 ? "+" : week.deltaPercent < 0 ? "−" : "";
    el.signals.innerHTML = [
      signal("Focused time", duration(week.totalSeconds),
        week.deltaPercent === 0 ? "same as last week" : sign + Math.abs(week.deltaPercent) + "% vs last week"),
      signal("Sessions", String(week.sessions),
        week.completedSessions + " finished, " + week.abandonedSessions + " cut short"),
      signal("Completion rate", week.completionRate + "%", "share of sessions run to the end"),
      signal("Average session", duration(week.averageSessionSeconds), "across this week"),
      today ? signal("Current streak", today.streakDays + (today.streakDays === 1 ? " day" : " days"),
        "personal best: " + Math.max(today.bestStreakDays, today.streakDays)) : ""
    ].join("");
  }

  function renderMix(mix) {
    if (!el.mix) return;

    if (!mix || !mix.length) {
      el.mix.innerHTML = '<p class="empty">No completed sessions in the last 28 days yet.</p>';
      return;
    }

    el.mix.innerHTML = mix.map(function (m) {
      return (
        '<div class="mix__row">' +
          '<div class="mix__head"><span>' + esc(m.label) + "</span><span>" + m.percent + "%</span></div>" +
          '<div class="mix__track"><div class="mix__fill" style="width:' + m.percent + '%"></div></div>' +
        "</div>"
      );
    }).join("");
  }

  /* ------------------------------------------------------------------ init */

  Promise.allSettled([api.insight(), api.weekly(), api.dailyStats(), api.sessionMix()])
    .then(function (results) {
      const value = (i) => (results[i].status === "fulfilled" ? results[i].value : null);
      const insight = value(0), week = value(1), today = value(2), mix = value(3);

      if (insight) {
        fill({ "insight-title": insight.title, "insight-body": insight.body });
      } else {
        fill({
          "insight-title": "Insights need the backend running.",
          "insight-body": "Start the server with npm start and reload — the text below explains what it reads."
        });
      }

      if (week) fill({ "range-label": week.range });
      renderSignals(week, today);
      renderMix(mix);
    });
})(window.LUMEN);

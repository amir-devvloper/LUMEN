/**
 * Focus insight generator. Rule-based over the user's own analytics so the
 * app is useful with zero external keys. Swap `generateInsight`'s body for
 * a real OpenAI call later — callers only see { title, body }.
 */
const db = require("../config/databse");
const analytics = require("./analytics.service");

/** Hour of day (server-local) in which the user most often completes sessions, or null. */
function bestHourBlock(userId) {
  const row = db
    .prepare(
      `SELECT CAST(strftime('%H', started_at, 'localtime') AS INTEGER) AS hour, COUNT(*) AS n
       FROM focus_sessions
       WHERE user_id = ? AND status = 'completed' AND started_at >= datetime('now', '-28 days')
       GROUP BY hour ORDER BY n DESC, hour ASC LIMIT 1`
    )
    .get(userId);
  return row ? row.hour : null;
}

function generateInsight(userId) {
  const week = analytics.weekly(userId);
  const pad = (n) => String(n).padStart(2, "0");

  if (week.sessions === 0) {
    return {
      title: "Start your first session to unlock insights.",
      body: "Once you complete a few focus sessions, Lumen AI will start spotting your best hours and patterns."
    };
  }

  const hour = bestHourBlock(userId);
  if (hour === null) {
    return {
      title: "Finish a full session to find your best window.",
      body: "You've started " + week.sessions + " session" + (week.sessions === 1 ? "" : "s") +
        " this week but none has run to the end yet. Complete one and Lumen AI can start spotting your rhythm."
    };
  }

  const windowEnd = (hour + 2) % 24;
  return {
    title: "Your best focus window starts around " + pad(hour) + ":00.",
    body:
      "Your completion rate this week is " + week.completionRate + "%, with most finished sessions between " +
      pad(hour) + ":00 and " + pad(windowEnd) + ":00. Protecting that window tends to produce your longest runs."
  };
}

module.exports = { generateInsight };

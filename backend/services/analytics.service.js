const db = require("../config/databse");
const { todayKey, shiftDays, weekKeys } = require("../utils/helpers");

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const inList = (arr) => arr.map(() => "?").join(",");

function secondsOn(userId, key) {
  const row = db.prepare("SELECT focus_seconds FROM analytics_daily WHERE user_id = ? AND date = ?").get(userId, key);
  return row ? row.focus_seconds : 0;
}

function today(userId) {
  const key = todayKey();
  const user = db.prepare("SELECT daily_goal_minutes FROM users WHERE id = ?").get(userId);
  const goalSeconds = ((user && user.daily_goal_minutes) || 240) * 60;
  const focusSeconds = secondsOn(userId, key);

  return {
    focusSeconds,
    yesterdaySeconds: secondsOn(userId, todayKey(shiftDays(new Date(), -1))),
    goalSeconds,
    goalPercent: Math.min(100, Math.round((focusSeconds / goalSeconds) * 100)),
    streakDays: streak(userId),
    bestStreakDays: bestStreak(userId)
  };
}

/** "Sep 14 – 20", or "Aug 31 – Sep 6" when the week crosses a month. */
function rangeLabel(startKey, endKey) {
  const [, sm, sd] = startKey.split("-").map(Number);
  const [, em, ed] = endKey.split("-").map(Number);
  return sm === em
    ? MONTHS[sm - 1] + " " + sd + " – " + ed
    : MONTHS[sm - 1] + " " + sd + " – " + MONTHS[em - 1] + " " + ed;
}

function weekTotal(userId, keys) {
  return db
    .prepare(`SELECT COALESCE(SUM(focus_seconds), 0) AS s FROM analytics_daily WHERE user_id = ? AND date IN (${inList(keys)})`)
    .get(userId, ...keys).s;
}

function weekly(userId) {
  const keys = weekKeys();
  const rows = db
    .prepare(
      `SELECT date, focus_seconds, sessions_count, completed_count
       FROM analytics_daily WHERE user_id = ? AND date IN (${inList(keys)})`
    )
    .all(userId, ...keys);

  const byDate = Object.fromEntries(rows.map((r) => [r.date, r]));
  const days = keys.map((k, i) => ({
    label: DAY_LABELS[i],
    date: k,
    minutes: Math.round(((byDate[k] && byDate[k].focus_seconds) || 0) / 60)
  }));

  const totalSeconds = rows.reduce((sum, r) => sum + r.focus_seconds, 0);
  const sessions = rows.reduce((sum, r) => sum + r.sessions_count, 0);
  const completed = rows.reduce((sum, r) => sum + r.completed_count, 0);

  // Compare like with like: this week so far vs the same weekdays last week.
  // (Comparing a part-week with a full previous week made Monday always look like -80%.)
  const elapsed = ((new Date().getDay() + 6) % 7) + 1;
  const prevKeys = weekKeys(shiftDays(new Date(), -7)).slice(0, elapsed);
  const prevTotal = weekTotal(userId, prevKeys);
  const thisTotal = weekTotal(userId, keys.slice(0, elapsed));
  const deltaPercent = prevTotal > 0 ? Math.round(((thisTotal - prevTotal) / prevTotal) * 100) : 0;

  return {
    days,
    totalSeconds,
    deltaPercent,
    range: rangeLabel(keys[0], keys[6]),
    weekStart: keys[0],
    weekEnd: keys[6],
    sessions,
    completedSessions: completed,
    abandonedSessions: sessions - completed,
    completionRate: sessions > 0 ? Math.round((completed / sessions) * 100) : 0,
    averageSeconds: Math.round(totalSeconds / 7), // per day
    averageSessionSeconds: sessions > 0 ? Math.round(totalSeconds / sessions) : 0
  };
}

/**
 * The last `days` calendar days ending today, in the same shape as weekly()
 * so the analytics page can render either one with the same code.
 * Day labels are the day of the month ("14"), since 30 weekday names don't fit.
 */
function monthly(userId, days = 30) {
  const now = new Date();
  const keys = Array.from({ length: days }, (_, i) => todayKey(shiftDays(now, i - (days - 1))));

  const rows = db
    .prepare(
      `SELECT date, focus_seconds, sessions_count, completed_count
       FROM analytics_daily WHERE user_id = ? AND date IN (${inList(keys)})`
    )
    .all(userId, ...keys);

  const byDate = Object.fromEntries(rows.map((r) => [r.date, r]));
  const dayList = keys.map((k) => ({
    label: String(Number(k.split("-")[2])),
    date: k,
    minutes: Math.round(((byDate[k] && byDate[k].focus_seconds) || 0) / 60)
  }));

  const totalSeconds = rows.reduce((sum, r) => sum + r.focus_seconds, 0);
  const sessions = rows.reduce((sum, r) => sum + r.sessions_count, 0);
  const completed = rows.reduce((sum, r) => sum + r.completed_count, 0);

  // Same window length immediately before this one, so the delta is like-for-like.
  const prevKeys = Array.from({ length: days }, (_, i) => todayKey(shiftDays(now, i - (days * 2 - 1))));
  const prevTotal = weekTotal(userId, prevKeys);
  const deltaPercent = prevTotal > 0 ? Math.round(((totalSeconds - prevTotal) / prevTotal) * 100) : 0;

  return {
    days: dayList,
    totalSeconds,
    deltaPercent,
    range: rangeLabel(keys[0], keys[keys.length - 1]),
    rangeStart: keys[0],
    rangeEnd: keys[keys.length - 1],
    rangeDays: days,
    sessions,
    completedSessions: completed,
    abandonedSessions: sessions - completed,
    completionRate: sessions > 0 ? Math.round((completed / sessions) * 100) : 0,
    averageSeconds: Math.round(totalSeconds / days), // per day
    averageSessionSeconds: sessions > 0 ? Math.round(totalSeconds / sessions) : 0
  };
}

function completedDates(userId, order) {
  return db
    .prepare(`SELECT date FROM analytics_daily WHERE user_id = ? AND completed_count > 0 ORDER BY date ${order} LIMIT 3700`)
    .all(userId)
    .map((r) => r.date);
}

/** Consecutive days (ending today or yesterday) with at least one completed session. */
function streak(userId) {
  const dates = new Set(completedDates(userId, "DESC"));
  let count = 0;
  let cursor = new Date();

  // allow today to be "in progress" without breaking the streak
  if (!dates.has(todayKey(cursor))) cursor = shiftDays(cursor, -1);

  while (dates.has(todayKey(cursor))) {
    count += 1;
    cursor = shiftDays(cursor, -1);
  }
  return count;
}

/** Longest run of consecutive days with a completed session, ever. */
function bestStreak(userId) {
  const dates = completedDates(userId, "ASC");
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of dates) {
    const [y, m, day] = d.split("-").map(Number);
    const ts = Date.UTC(y, m - 1, day);
    run = prev !== null && ts - prev === 86400000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = ts;
  }
  return best;
}

/** Most-played ambient tracks by focused time over the last `days` days. */
function topSounds(userId, limit = 3, days = 28) {
  return db
    .prepare(
      `SELECT t.id, t.title, t.artist, t.album,
              SUM(f.length_seconds - f.remaining_seconds) AS seconds
       FROM focus_sessions f JOIN tracks t ON t.id = f.track_id
       WHERE f.user_id = ? AND f.status IN ('completed', 'abandoned', 'paused')
         AND f.started_at >= datetime('now', ?)
       GROUP BY t.id HAVING seconds > 0
       ORDER BY seconds DESC LIMIT ?`
    )
    .all(userId, "-" + days + " days", limit)
    .map((r) => ({
      id: r.id,
      name: r.title,
      meta: r.album ? r.artist + " / " + r.album : r.artist,
      seconds: r.seconds
    }));
}

/**
 * Record a finished (completed or abandoned) session into the daily rollup.
 * `date` defaults to today; the seed script passes past dates.
 */
function recordSession({ userId, focusSeconds, completed, date = todayKey() }) {
  db.prepare(
    `INSERT INTO analytics_daily (id, user_id, date, focus_seconds, sessions_count, completed_count)
     VALUES (lower(hex(randomblob(16))), @userId, @date, @focusSeconds, 1, @completedCount)
     ON CONFLICT (user_id, date) DO UPDATE SET
       focus_seconds = focus_seconds + @focusSeconds,
       sessions_count = sessions_count + 1,
       completed_count = completed_count + @completedCount`
  ).run({ userId, date, focusSeconds, completedCount: completed ? 1 : 0 });
}

module.exports = { today, weekly, monthly, streak, bestStreak, topSounds, recordSession };

const analytics = require("../services/analytics.service");
const db = require("../config/databse");
const { asyncHandler } = require("../utils/helpers");

// Three-hour blocks 0-3 … 21-24. The heatmap shows the six waking blocks.
const BLOCK_LABELS = ["0–3", "3–6", "6–9", "9–12", "12–15", "15–18", "18–21", "21–24"];
const FIRST_BLOCK = 2; // 06:00
const HEAT_ROWS = BLOCK_LABELS.slice(FIRST_BLOCK); // 6 rows

const today = asyncHandler(async (req, res) => {
  res.json(analytics.today(req.user.id));
});

const weekly = asyncHandler(async (req, res) => {
  res.json(analytics.weekly(req.user.id));
});

/** The last 30 days, in the same shape as /weekly (the "Month" toggle). */
const monthly = asyncHandler(async (req, res) => {
  res.json(analytics.monthly(req.user.id, 30));
});

/** 6 three-hour blocks (06:00–24:00) x 7 weekdays of completed-session minutes, for the heatmap. */
const heatmap = asyncHandler(async (req, res) => {
  // started_at is stored in UTC; 'localtime' puts weekday/hour on the same clock as analytics_daily.
  const rows = db
    .prepare(
      `SELECT
         CAST(strftime('%w', started_at, 'localtime') AS INTEGER) AS weekday,
         CAST(strftime('%H', started_at, 'localtime') AS INTEGER) / 3 AS block,
         SUM(length_seconds - remaining_seconds) AS seconds
       FROM focus_sessions
       WHERE user_id = ? AND status = 'completed' AND started_at >= datetime('now', '-28 days')
       GROUP BY weekday, block`
    )
    .all(req.user.id);

  const grid = Array.from({ length: HEAT_ROWS.length }, () => Array(7).fill(0));
  let max = 1;
  for (const r of rows) {
    // block 0-1 (00:00-06:00) has no row; the old code wrote it into the wrong rows.
    const row = r.block - FIRST_BLOCK;
    if (row < 0 || row >= grid.length) continue;
    const col = (r.weekday + 6) % 7; // Monday-first
    grid[row][col] = r.seconds;
    if (r.seconds > max) max = r.seconds;
  }
  const values = grid.map((row) => row.map((s) => Number((s / max).toFixed(2))));
  res.json({ rows: HEAT_ROWS, values });
});

const sessionMix = asyncHandler(async (req, res) => {
  const rows = db
    .prepare(
      `SELECT mode, COUNT(*) AS n FROM focus_sessions
       WHERE user_id = ? AND status = 'completed' AND started_at >= datetime('now', '-28 days')
       GROUP BY mode ORDER BY n DESC`
    )
    .all(req.user.id);
  const total = rows.reduce((sum, r) => sum + r.n, 0) || 1;
  res.json(rows.map((r) => ({ label: r.mode, percent: Math.round((r.n / total) * 100) })));
});

const topSounds = asyncHandler(async (req, res) => {
  res.json(analytics.topSounds(req.user.id));
});

module.exports = { today, weekly, monthly, heatmap, sessionMix, topSounds };

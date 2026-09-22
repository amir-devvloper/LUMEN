const db = require("../config/databse");
const analytics = require("../services/analytics.service");
const catalogue = require("../services/soundcloud.service");
const { asyncHandler, id, toIso, parseSqliteUtc, ApiError } = require("../utils/helpers");

const PRESETS = {
  deep:    { mode: "Deep work",    preset: "Creative sprint", length: 90 * 60, brk: 10 * 60 },
  sprint:  { mode: "Sprint",       preset: "Short burst",     length: 25 * 60, brk: 5 * 60 },
  ambient: { mode: "Ambient flow", preset: "Low intensity",   length: 50 * 60, brk: 10 * 60 }
};

// Sessions shorter than this are treated as accidental clicks: they still
// change status but never touch analytics (and can't be used to fake a streak).
const MIN_RECORDED_SECONDS = 60;

/**
 * The timer lives on the client, so the server derives progress from the clock:
 * `remaining_seconds` is the value at `updated_at`; while a session is running,
 * time since `updated_at` has elapsed on top of that. Pause/resume/finish
 * checkpoint it. (Before, remaining_seconds was never updated at all, so every
 * session looked untouched — the heatmap stayed empty and abandoned/early-ended
 * sessions were credited as full-length.)
 */
function remainingNow(row) {
  if (row.status !== "running") return row.remaining_seconds;
  const since = parseSqliteUtc(row.updated_at).getTime();
  const elapsed = Math.max(0, Math.floor((Date.now() - since) / 1000));
  return Math.max(0, row.remaining_seconds - elapsed);
}

function serialize(row) {
  if (!row) return null;
  const remaining = remainingNow(row);
  return {
    id: row.id,
    mode: row.mode,
    preset: row.preset,
    lengthSeconds: row.length_seconds,
    remainingSeconds: remaining,
    breakSeconds: row.break_seconds,   // how long the break lasts
    breakInSeconds: remaining,         // time until it starts: the break follows the focus block
    status: row.status,
    trackId: row.track_id,
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at)
  };
}

const getRow = (sessionId) => db.prepare("SELECT * FROM focus_sessions WHERE id = ?").get(sessionId);

/** Close a session and add it to the daily rollup. */
function finish(row, status) {
  const remaining = remainingNow(row);
  const focusSeconds = Math.max(0, row.length_seconds - remaining);

  db.prepare(
    `UPDATE focus_sessions
     SET status = ?, remaining_seconds = ?, updated_at = datetime('now'),
         completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END
     WHERE id = ?`
  ).run(status, remaining, status, row.id);

  if (focusSeconds >= MIN_RECORDED_SECONDS) {
    analytics.recordSession({ userId: row.user_id, focusSeconds, completed: status === "completed" });
  }
}

const start = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const key = body.preset === undefined || body.preset === null || body.preset === "" ? "deep" : body.preset;
  // hasOwn: PRESETS["constructor"] etc. are truthy and used to slip through.
  if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(PRESETS, key)) {
    throw new ApiError(400, "Unknown preset. Use one of: " + Object.keys(PRESETS).join(", "));
  }
  const p = PRESETS[key];

  if (body.trackId !== undefined && body.trackId !== null) {
    if (typeof body.trackId !== "string") throw new ApiError(400, "trackId must be a string");
    if (!catalogue.findById(body.trackId)) throw new ApiError(404, "Track not found");
  }

  const sessionId = id();
  db.transaction(() => {
    // Starting a new session ends any open one — and keeps the focus time it already earned.
    const open = db
      .prepare("SELECT * FROM focus_sessions WHERE user_id = ? AND status IN ('running','paused')")
      .all(req.user.id);
    open.forEach((row) => finish(row, "abandoned"));

    db.prepare(
      `INSERT INTO focus_sessions (id, user_id, mode, preset, length_seconds, remaining_seconds, break_seconds, track_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(sessionId, req.user.id, p.mode, p.preset, p.length, p.length, p.brk, body.trackId || null);
  })();

  res.status(201).json(serialize(getRow(sessionId)));
});

const active = asyncHandler(async (req, res) => {
  let row = db
    .prepare("SELECT * FROM focus_sessions WHERE user_id = ? AND status IN ('running','paused') ORDER BY started_at DESC, rowid DESC LIMIT 1")
    .get(req.user.id);

  // The timer ran out while the client was away (tab closed, phone asleep): settle it now.
  if (row && row.status === "running" && remainingNow(row) === 0) {
    finish(row, "completed");
    row = null;
  }
  res.json(serialize(row));
});

function requireOwnedSession(req) {
  const row = db.prepare("SELECT * FROM focus_sessions WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!row) throw new ApiError(404, "Session not found");
  return row;
}

function requireOpen(row) {
  if (row.status === "completed" || row.status === "abandoned") {
    throw new ApiError(409, "This session has already ended");
  }
}

const pause = asyncHandler(async (req, res) => {
  const row = requireOwnedSession(req);
  requireOpen(row);
  if (row.status === "running") {
    db.prepare("UPDATE focus_sessions SET status = 'paused', remaining_seconds = ?, updated_at = datetime('now') WHERE id = ?")
      .run(remainingNow(row), row.id);
  }
  res.json(serialize(getRow(row.id)));
});

const resume = asyncHandler(async (req, res) => {
  const row = requireOwnedSession(req);
  requireOpen(row);
  if (row.status === "paused") {
    db.prepare("UPDATE focus_sessions SET status = 'running', updated_at = datetime('now') WHERE id = ?").run(row.id);
  }
  res.json(serialize(getRow(row.id)));
});

const complete = asyncHandler(async (req, res) => {
  const row = requireOwnedSession(req);
  // Idempotent: a retried request must not add the same session to analytics twice.
  if (row.status === "completed") return res.json(serialize(row));
  requireOpen(row);

  finish(row, "completed");
  res.json(serialize(getRow(row.id)));
});

const history = asyncHandler(async (req, res) => {
  const rows = db
    .prepare("SELECT * FROM focus_sessions WHERE user_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 50")
    .all(req.user.id);
  res.json(rows.map(serialize));
});

module.exports = { start, active, pause, resume, complete, history };

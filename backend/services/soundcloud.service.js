/**
 * Track catalogue. Named for the eventual SoundCloud integration; for now
 * it reads from the local `tracks` table so the app works without an API
 * key. Swap the body of these functions for real SoundCloud calls later —
 * the controller layer doesn't need to change.
 */
const db = require("../config/databse");

/** Escape LIKE wildcards so a search for "100%" or "a_b" matches literally. */
const likeTerm = (q) => "%" + String(q).replace(/[\\%_]/g, "\\$&") + "%";

function list({ ambientOnly = false, q = "" } = {}) {
  let sql = "SELECT * FROM tracks WHERE 1=1";
  const params = [];

  if (ambientOnly) sql += " AND is_ambient = 1";
  if (q) {
    sql += " AND (title LIKE ? ESCAPE '\\' OR artist LIKE ? ESCAPE '\\')";
    params.push(likeTerm(q), likeTerm(q));
  }
  // rowid tie-break: seeded tracks share a created_at second.
  sql += " ORDER BY created_at DESC, rowid DESC";

  return db.prepare(sql).all(...params);
}

function findById(trackId) {
  return db.prepare("SELECT * FROM tracks WHERE id = ?").get(trackId);
}

/** A stable "now playing" pick until real playback state is wired up. */
function nowPlaying(userId) {
  const active = db
    .prepare(
      `SELECT t.* FROM focus_sessions f
       JOIN tracks t ON t.id = f.track_id
       WHERE f.user_id = ? AND f.status = 'running'
       ORDER BY f.started_at DESC LIMIT 1`
    )
    .get(userId);

  // The fallback used ORDER BY RANDOM(), so the "stable" pick changed on every
  // request (and on every page load). Pick the first ambient track instead.
  return active || db.prepare("SELECT * FROM tracks ORDER BY is_ambient DESC, rowid ASC LIMIT 1").get();
}

module.exports = { list, findById, nowPlaying };

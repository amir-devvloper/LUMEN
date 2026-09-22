const catalogue = require("../services/soundcloud.service");
const db = require("../config/databse");
const { asyncHandler, ApiError } = require("../utils/helpers");

const list = asyncHandler(async (req, res) => {
  res.json(catalogue.list({ ambientOnly: req.query.ambient === "true", q: typeof req.query.q === "string" ? req.query.q : "" }));
});

const nowPlaying = asyncHandler(async (req, res) => {
  const track = catalogue.nowPlaying(req.user.id);
  if (!track) throw new ApiError(404, "No tracks in the catalogue yet");

  // `liked` lets the player bar show the right heart state on load.
  const liked = !!db.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND track_id = ?").get(req.user.id, track.id);
  res.json({ ...track, liked });
});

const toggleFavorite = asyncHandler(async (req, res) => {
  const trackId = req.params.trackId;
  const track = catalogue.findById(trackId);
  if (!track) throw new ApiError(404, "Track not found");

  const existing = db.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND track_id = ?").get(req.user.id, trackId);
  if (existing) {
    db.prepare("DELETE FROM favorites WHERE user_id = ? AND track_id = ?").run(req.user.id, trackId);
    return res.json({ liked: false });
  }
  db.prepare("INSERT INTO favorites (user_id, track_id) VALUES (?, ?)").run(req.user.id, trackId);
  res.json({ liked: true });
});

const favorites = asyncHandler(async (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.* FROM favorites f JOIN tracks t ON t.id = f.track_id
       WHERE f.user_id = ? ORDER BY f.created_at DESC, f.rowid DESC`
    )
    .all(req.user.id);
  res.json(rows);
});

module.exports = { list, nowPlaying, toggleFavorite, favorites };

const db = require("../config/databse");
const catalogue = require("../services/soundcloud.service");
const { asyncHandler, id, ApiError } = require("../utils/helpers");

const list = asyncHandler(async (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*, COUNT(pt.track_id) AS track_count
       FROM playlists p LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
       WHERE p.user_id = ? GROUP BY p.id ORDER BY p.created_at DESC, p.rowid DESC`
    )
    .all(req.user.id);
  res.json(rows);
});

const create = asyncHandler(async (req, res) => {
  const name = req.body && typeof req.body.name === "string" ? req.body.name.trim() : "";
  if (!name) throw new ApiError(400, "Playlist name is required");
  if (name.length > 100) throw new ApiError(400, "Playlist name is too long");

  const playlist = { id: id(), user_id: req.user.id, name };
  db.prepare("INSERT INTO playlists (id, user_id, name) VALUES (@id, @user_id, @name)").run(playlist);
  res.status(201).json(db.prepare("SELECT * FROM playlists WHERE id = ?").get(playlist.id));
});

function requireOwnedPlaylist(req) {
  const row = db.prepare("SELECT * FROM playlists WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!row) throw new ApiError(404, "Playlist not found");
  return row;
}

const tracks = asyncHandler(async (req, res) => {
  const playlist = requireOwnedPlaylist(req);
  const rows = db
    .prepare(
      `SELECT t.* FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
       WHERE pt.playlist_id = ? ORDER BY pt.position ASC`
    )
    .all(playlist.id);
  res.json(rows);
});

const addTrack = asyncHandler(async (req, res) => {
  const playlist = requireOwnedPlaylist(req);
  const trackId = req.body && req.body.trackId;
  if (!trackId || typeof trackId !== "string") throw new ApiError(400, "trackId is required");
  // INSERT OR IGNORE does not cover foreign-key errors, so an unknown track was a 500.
  if (!catalogue.findById(trackId)) throw new ApiError(404, "Track not found");

  const position = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM playlist_tracks WHERE playlist_id = ?").get(playlist.id).next;
  const result = db.prepare("INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)").run(playlist.id, trackId, position);

  // 201 only when something was actually added; 200 if it was already in the playlist.
  res.status(result.changes ? 201 : 200).json({ added: result.changes > 0 });
});

const removeTrack = asyncHandler(async (req, res) => {
  const playlist = requireOwnedPlaylist(req);
  db.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?").run(playlist.id, req.params.trackId);
  res.json({ removed: true });
});

const remove = asyncHandler(async (req, res) => {
  const playlist = requireOwnedPlaylist(req);
  if (playlist.is_system) throw new ApiError(403, "System playlists can't be deleted");
  db.prepare("DELETE FROM playlists WHERE id = ?").run(playlist.id);
  res.json({ deleted: true });
});

module.exports = { list, create, tracks, addTrack, removeTrack, remove };

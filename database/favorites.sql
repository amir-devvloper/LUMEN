-- LUMEN — favorites (liked tracks)

CREATE TABLE IF NOT EXISTS favorites (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id   TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);

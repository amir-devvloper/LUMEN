-- LUMEN — focus sessions

CREATE TABLE IF NOT EXISTS focus_sessions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode              TEXT NOT NULL DEFAULT 'Deep work',
  preset            TEXT NOT NULL DEFAULT 'Creative sprint',
  length_seconds    INTEGER NOT NULL,
  remaining_seconds INTEGER NOT NULL,
  break_seconds     INTEGER NOT NULL DEFAULT 600,
  status            TEXT NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running', 'paused', 'completed', 'abandoned')),
  track_id          TEXT REFERENCES tracks(id) ON DELETE SET NULL,
  started_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_focus_user ON focus_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_focus_status ON focus_sessions(user_id, status);

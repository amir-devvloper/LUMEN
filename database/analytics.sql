-- LUMEN — daily analytics rollup, written to when a focus session completes.

CREATE TABLE IF NOT EXISTS analytics_daily (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date             TEXT NOT NULL,                 -- YYYY-MM-DD, local to the user
  focus_seconds    INTEGER NOT NULL DEFAULT 0,
  sessions_count   INTEGER NOT NULL DEFAULT 0,
  completed_count  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_user_date ON analytics_daily(user_id, date);

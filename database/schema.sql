-- LUMEN — core schema (users, tracks). Domain-specific tables live in the
-- sibling .sql files and are applied after this one, in this order:
-- schema.sql -> playlists.sql -> favorites.sql -> focus_sessions.sql -> analytics.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'Lumen Free',
  avatar_url    TEXT,
  daily_goal_minutes INTEGER NOT NULL DEFAULT 240,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tracks (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  artist           TEXT NOT NULL,
  album            TEXT,
  duration_seconds INTEGER NOT NULL,
  cover_url        TEXT,
  stream_url       TEXT,
  is_ambient       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

/**
 * SQLite connection + schema bootstrap.
 * Filename kept as `databse.js` to match the existing project structure.
 */
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const env = require("./env");

fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });

const db = new Database(env.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const SCHEMA_ORDER = [
  "schema.sql",
  "playlists.sql",
  "favorites.sql",
  "focus_sessions.sql",
  "analytics.sql"
];

function migrate() {
  for (const file of SCHEMA_ORDER) {
    const full = path.join(env.schemaDir, file);
    // A missing schema file used to be skipped silently, which only surfaced
    // later as a confusing "no such table" error. Fail loudly instead.
    if (!fs.existsSync(full)) {
      throw new Error("Missing schema file: " + full);
    }
    const sql = fs.readFileSync(full, "utf8").trim();
    if (sql) db.exec(sql);
  }
}

migrate();

module.exports = db;

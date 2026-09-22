/**
 * Seeds a demo user, a small track catalogue and two weeks of demo activity
 * (so the dashboard / analytics pages have something to show).
 * Run once with: npm run seed   (or: node database/seed.js)
 * Safe to re-run — it never duplicates the user, tracks or activity.
 */
const path = require("path");
const crypto = require("crypto");
const backend = path.join(__dirname, "..", "backend");
const db = require(path.join(backend, "config", "databse"));
const { hashPassword, todayKey, shiftDays } = require(path.join(backend, "utils", "helpers"));
const analytics = require(path.join(backend, "services", "analytics.service"));

const demoEmail = "amir@lumen.app";
const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(demoEmail);

let userId = existing && existing.id;

if (!existing) {
  const { hash, salt } = hashPassword("lumen1234");
  userId = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, password_salt, plan) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(userId, "Amir Rahman", demoEmail, hash, salt, "Lumen Plus");
  console.log("Created demo user:", demoEmail, "/ lumen1234");
} else {
  console.log("Demo user already exists:", demoEmail);
}

const tracks = [
  { title: "Weightless Horizon", artist: "Aether", album: "Still Forms", duration: 588, ambient: 1 },
  { title: "Low Tide", artist: "Mira Lund", album: "Coastline", duration: 402, ambient: 1 },
  { title: "Glass Rooms", artist: "Aether", album: "Still Forms", duration: 356, ambient: 1 },
  { title: "Quiet Machinery", artist: "Ken Oda", album: "Interiors", duration: 274, ambient: 0 },
  { title: "Paper Cranes", artist: "Mira Lund", album: "Coastline", duration: 318, ambient: 0 }
];

const insertTrack = db.prepare(
  "INSERT INTO tracks (id, title, artist, album, duration_seconds, is_ambient) VALUES (?, ?, ?, ?, ?, ?)"
);

for (const t of tracks) {
  const exists = db.prepare("SELECT id FROM tracks WHERE title = ? AND artist = ?").get(t.title, t.artist);
  if (!exists) insertTrack.run(crypto.randomUUID(), t.title, t.artist, t.album, t.duration, t.ambient);
}

/* ------------------------------------------------------------ demo activity */

// Small deterministic PRNG so every run of the seed produces the same demo data.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const utc = (d) => d.toISOString().slice(0, 19).replace("T", " "); // SQLite datetime format

function seedActivity() {
  if (db.prepare("SELECT 1 FROM focus_sessions WHERE user_id = ? LIMIT 1").get(userId)) {
    console.log("Demo activity already exists");
    return;
  }

  const rand = mulberry32(2026);
  const presets = [
    { mode: "Deep work",    preset: "Creative sprint", length: 90 * 60, brk: 10 * 60 },
    { mode: "Sprint",       preset: "Short burst",     length: 25 * 60, brk: 5 * 60 },
    { mode: "Ambient flow", preset: "Low intensity",   length: 50 * 60, brk: 10 * 60 }
  ];
  const ambient = db.prepare("SELECT id FROM tracks WHERE is_ambient = 1 ORDER BY rowid").all();

  const insert = db.prepare(
    `INSERT INTO focus_sessions
       (id, user_id, mode, preset, length_seconds, remaining_seconds, break_seconds, status, track_id, started_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const now = new Date();
  let count = 0;

  db.transaction(() => {
    for (let back = 13; back >= 0; back--) {
      if (back === 6) continue; // a rest day, so the streak isn't a flat 14
      const day = shiftDays(now, -back);
      const sessions = 2 + Math.floor(rand() * 3);

      for (let n = 0; n < sessions; n++) {
        const p = presets[Math.floor(rand() * presets.length)];
        const completed = n === 0 || rand() < 0.8;
        const elapsed = completed ? p.length : Math.round(p.length * (0.2 + rand() * 0.6));
        const started = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 7 + Math.floor(rand() * 15), Math.floor(rand() * 60));
        if (started > now) continue; // never invent sessions in the future
        const ended = new Date(started.getTime() + elapsed * 1000);
        const track = ambient.length ? ambient[Math.floor(rand() * ambient.length)].id : null;

        insert.run(
          crypto.randomUUID(), userId, p.mode, p.preset, p.length, p.length - elapsed, p.brk,
          completed ? "completed" : "abandoned", track, utc(started), utc(ended), completed ? utc(ended) : null
        );
        analytics.recordSession({ userId, focusSeconds: elapsed, completed, date: todayKey(day) });
        count += 1;
      }
    }
  })();

  console.log("Created", count, "demo focus sessions");
}

seedActivity();

console.log("Seed complete.");

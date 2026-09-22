const crypto = require("crypto");

/** Wrap an async controller so its rejections reach the error middleware. */
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function id() {
  return crypto.randomUUID();
}

/** scrypt password hash — no bcrypt dependency needed. */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  if (typeof password !== "string") return false;
  const attempt = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(attempt);
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, password_salt, ...safe } = user;
  return safe;
}

/**
 * YYYY-MM-DD for the given date in server-local time.
 * (This used toISOString(), which is UTC — so for anyone ahead of UTC the
 * "today" key flipped hours early/late and weekKeys() drifted by a day.)
 */
function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

/** A new Date `days` calendar days away (negative = past), DST-safe. */
function shiftDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
}

/** Monday-first list of the 7 YYYY-MM-DD keys covering the week of `date`. */
function weekKeys(date = new Date()) {
  const dayIndex = (date.getDay() + 6) % 7; // 0 = Monday
  return Array.from({ length: 7 }, (_, i) => todayKey(shiftDays(date, i - dayIndex)));
}

/** SQLite's datetime('now') is "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker. */
function parseSqliteUtc(value) {
  if (!value) return null;
  return new Date(String(value).replace(" ", "T") + "Z");
}

function toIso(value) {
  const d = parseSqliteUtc(value);
  return d ? d.toISOString() : null;
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = {
  asyncHandler,
  id,
  hashPassword,
  verifyPassword,
  sanitizeUser,
  todayKey,
  shiftDays,
  weekKeys,
  parseSqliteUtc,
  toIso,
  ApiError
};

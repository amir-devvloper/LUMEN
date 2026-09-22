const db = require("../config/databse");
const token = require("../utils/token");
const { id, hashPassword, verifyPassword, sanitizeUser, ApiError } = require("../utils/helpers");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function register({ name, email, password } = {}) {
  // Type-check first: a non-string body value used to crash with a TypeError (HTTP 500).
  if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string" ||
      !name.trim() || !email.trim() || !password) {
    throw new ApiError(400, "Name, email and password are required");
  }
  name = name.trim();
  email = email.trim().toLowerCase();

  if (name.length > 80) throw new ApiError(400, "Name is too long");
  if (!EMAIL_RE.test(email) || email.length > 254) throw new ApiError(400, "Enter a valid email address");
  if (password.length < 8) throw new ApiError(400, "Password must be at least 8 characters");
  if (password.length > 128) throw new ApiError(400, "Password is too long");

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) throw new ApiError(409, "An account with this email already exists");

  const { hash, salt } = hashPassword(password);
  const user = { id: id(), name, email, password_hash: hash, password_salt: salt };

  try {
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, password_salt) VALUES (@id, @name, @email, @password_hash, @password_salt)"
    ).run(user);
  } catch (err) {
    if (err && String(err.code).startsWith("SQLITE_CONSTRAINT")) {
      throw new ApiError(409, "An account with this email already exists");
    }
    throw err;
  }

  const fullUser = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  return issueSession(fullUser);
}

function login({ email, password } = {}) {
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
    throw new ApiError(401, "Invalid email or password");
  }

  return issueSession(user);
}

function issueSession(user) {
  const jwt = token.sign({ sub: user.id });
  return { token: jwt, user: sanitizeUser(user) };
}

module.exports = { register, login };

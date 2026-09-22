const token = require("../utils/token");
const db = require("../config/databse");
const { ApiError, sanitizeUser } = require("../utils/helpers");

function requireAuth(req, res, next) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
  if (!match) return next(new ApiError(401, "Missing bearer token"));

  let payload;
  try {
    payload = token.verify(match[1].trim());
  } catch (err) {
    return next(new ApiError(401, err.message === "Token expired" ? "Session expired" : "Not authenticated"));
  }

  // Only token problems are a 401. A database failure here used to be reported
  // as "Not authenticated", which made the frontend bounce users to /login.
  try {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub);
    if (!user) return next(new ApiError(401, "User no longer exists"));
    req.user = sanitizeUser(user);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth };

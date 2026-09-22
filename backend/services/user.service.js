const db = require("../config/databse");
const { sanitizeUser, ApiError } = require("../utils/helpers");

/** A daily goal below 30 minutes is noise, above 24h is impossible. */
const MIN_GOAL_MINUTES = 30;
const MAX_GOAL_MINUTES = 1440;

function byId(userId) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}

/**
 * Partial update of the signed-in user. Only the fields present in `patch`
 * are touched, so the profile page can save the daily goal on its own.
 */
function update(userId, patch = {}) {
  const fields = {};

  if (Object.prototype.hasOwnProperty.call(patch, "daily_goal_minutes")) {
    const raw = patch.daily_goal_minutes;
    // Accept 240 and "240", reject "", null, true, 4.5 and NaN.
    const minutes = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
    if (typeof minutes !== "number" || !Number.isFinite(minutes) || !Number.isInteger(minutes)) {
      throw new ApiError(400, "daily_goal_minutes must be a whole number of minutes");
    }
    if (minutes < MIN_GOAL_MINUTES || minutes > MAX_GOAL_MINUTES) {
      throw new ApiError(400, "Daily goal must be between " + MIN_GOAL_MINUTES + " and " + MAX_GOAL_MINUTES + " minutes");
    }
    fields.daily_goal_minutes = minutes;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "name")) {
    if (typeof patch.name !== "string" || !patch.name.trim()) throw new ApiError(400, "Name is required");
    const name = patch.name.trim();
    if (name.length > 80) throw new ApiError(400, "Name is too long");
    fields.name = name;
  }

  const keys = Object.keys(fields);
  if (!keys.length) throw new ApiError(400, "Nothing to update");

  db.prepare("UPDATE users SET " + keys.map((k) => k + " = @" + k).join(", ") + " WHERE id = @id")
    .run({ ...fields, id: userId });

  return sanitizeUser(byId(userId));
}

module.exports = { update, MIN_GOAL_MINUTES, MAX_GOAL_MINUTES };

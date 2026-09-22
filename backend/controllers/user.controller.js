const userService = require("../services/user.service");
const { asyncHandler, sanitizeUser } = require("../utils/helpers");

const me = asyncHandler(async (req, res) => {
  res.json(sanitizeUser(req.user));
});

const updateMe = asyncHandler(async (req, res) => {
  res.json(userService.update(req.user.id, req.body || {}));
});

module.exports = { me, updateMe };

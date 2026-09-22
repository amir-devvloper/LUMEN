const authService = require("../services/auth.service");
const { asyncHandler, sanitizeUser } = require("../utils/helpers");

const register = asyncHandler(async (req, res) => {
  const result = authService.register(req.body || {});
  res.status(201).json(result);
});

const login = asyncHandler(async (req, res) => {
  const result = authService.login(req.body || {});
  res.json(result);
});

const me = asyncHandler(async (req, res) => {
  res.json(sanitizeUser(req.user));
});

module.exports = { register, login, me };

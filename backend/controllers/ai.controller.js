const openai = require("../services/openai.service");
const { asyncHandler } = require("../utils/helpers");

const insight = asyncHandler(async (req, res) => {
  res.json(openai.generateInsight(req.user.id));
});

module.exports = { insight };

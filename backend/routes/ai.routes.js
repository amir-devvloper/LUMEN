const express = require("express");
const controller = require("../controllers/ai.controller");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();
router.use(requireAuth);

router.get("/insight", controller.insight);

module.exports = router;

const express = require("express");
const controller = require("../controllers/analytics.controller");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();
router.use(requireAuth);

router.get("/today", controller.today);
router.get("/weekly", controller.weekly);
router.get("/monthly", controller.monthly);
router.get("/heatmap", controller.heatmap);
router.get("/session-mix", controller.sessionMix);
router.get("/top-sounds", controller.topSounds);

module.exports = router;

const express = require("express");
const controller = require("../controllers/focus.controller");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();
router.use(requireAuth);

router.get("/active", controller.active);
router.get("/history", controller.history);
router.post("/", controller.start);
router.post("/:id/pause", controller.pause);
router.post("/:id/resume", controller.resume);
router.post("/:id/complete", controller.complete);

module.exports = router;

const express = require("express");
const controller = require("../controllers/playlist.controller");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();
router.use(requireAuth);

router.get("/", controller.list);
router.post("/", controller.create);
router.get("/:id/tracks", controller.tracks);
router.post("/:id/tracks", controller.addTrack);
router.delete("/:id/tracks/:trackId", controller.removeTrack);
router.delete("/:id", controller.remove);

module.exports = router;

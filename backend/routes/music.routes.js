const express = require("express");
const controller = require("../controllers/music.controller");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();
router.use(requireAuth);

router.get("/", controller.list);
router.get("/now-playing", controller.nowPlaying);
router.get("/favorites", controller.favorites);
router.post("/:trackId/favorite", controller.toggleFavorite);

module.exports = router;

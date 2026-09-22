const express = require("express");
const controller = require("../controllers/user.controller");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();
router.use(requireAuth);

router.get("/me", controller.me);
router.patch("/me", controller.updateMe);

module.exports = router;

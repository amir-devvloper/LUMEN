const express = require("express");
const controller = require("../controllers/auth.controller");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/register", controller.register);
router.post("/login", controller.login);
router.get("/me", requireAuth, controller.me);

module.exports = router;

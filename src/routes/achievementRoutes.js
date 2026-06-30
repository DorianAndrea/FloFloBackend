const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const { getAchievements } = require("../controllers/achievementController");

const router = express.Router();

router.get("/children/:childId", authMiddleware, getAchievements);
router.get("/", authMiddleware, getAchievements);

module.exports = router;
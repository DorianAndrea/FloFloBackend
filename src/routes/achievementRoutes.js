const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  getAchievements,
  getAchievementCount,
} = require("../controllers/achievementController");

const router = express.Router();

// Contador ligero de logros
router.get(
  "/children/:childId/count",
  authMiddleware,
  getAchievementCount,
);

router.get("/count", authMiddleware, getAchievementCount);

// Listado completo de logros
router.get("/children/:childId", authMiddleware, getAchievements);
router.get("/", authMiddleware, getAchievements);

module.exports = router;
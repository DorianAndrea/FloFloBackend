const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getExperienceRecommendations,
} = require("../controllers/experienceRecommendationController");

router.get(
  "/",
  authMiddleware,
  getExperienceRecommendations,
);

module.exports = router;
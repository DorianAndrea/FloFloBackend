const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { aiLimiter } = require("../middleware/rateLimiters");

const {
  generatePlaceSteps,
  generateConversation,
  generateContactConversation,
} = require("../controllers/aiController");

const router = express.Router();

router.post(
  "/generate-place-steps",
  authMiddleware,
  aiLimiter,
  generatePlaceSteps,
);

router.post(
  "/generate-conversation",
  authMiddleware,
  aiLimiter,
  generateConversation,
);

router.post(
  "/contact-conversation",
  authMiddleware,
  aiLimiter,
  generateContactConversation,
);

module.exports = router;
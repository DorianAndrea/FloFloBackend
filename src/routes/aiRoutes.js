const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  generatePlaceSteps,
  generateConversation, 
  generateContactConversation,
} = require("../controllers/aiController");

const router = express.Router();

router.post(
  "/generate-place-steps",
  authMiddleware,
  generatePlaceSteps
);
router.post(
  "/generate-conversation",
  authMiddleware,
  generateConversation
);

router.post(
  "/contact-conversation",
  authMiddleware,
  generateContactConversation
);

module.exports = router;
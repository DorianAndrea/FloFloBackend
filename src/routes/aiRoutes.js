const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  generatePlaceSteps,
  generateConversation
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

module.exports = router;
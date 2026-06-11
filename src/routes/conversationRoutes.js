const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  createConversation,
  getConversations,
  completeConversation,
  getConversationProgress,
} = require("../controllers/conversationController");

const router = express.Router();

router.get("/", authMiddleware, getConversations);

router.get("/progress", authMiddleware, getConversationProgress);

router.post("/", authMiddleware, createConversation);

router.post("/:id/complete", authMiddleware, completeConversation);

module.exports = router;
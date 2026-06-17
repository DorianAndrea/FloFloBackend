const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  createConversation,
  getConversations,
  getPaginatedConversations,
  completeConversation,
  getConversationProgress,
  deleteConversation,
  updateConversation,
  toggleFavoriteConversation,
  
} = require("../controllers/conversationController");

const router = express.Router();

router.get("/paginated", authMiddleware, getPaginatedConversations);

router.get("/", authMiddleware, getConversations);

router.get("/progress", authMiddleware, getConversationProgress);

router.post("/", authMiddleware, createConversation);

router.post("/:id/complete", authMiddleware, completeConversation);

router.put("/:id", authMiddleware, updateConversation);

router.delete("/:id", authMiddleware, deleteConversation);

router.patch("/:id/favorite", authMiddleware, toggleFavoriteConversation);

module.exports = router;
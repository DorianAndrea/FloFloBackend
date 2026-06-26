const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getAllContactConversations,
  getContactConversationsByContactId,
  createContactConversation,
  updateContactConversation,
  deleteContactConversation,
  completeContactConversation,
  getContactConversationProgress,
  toggleFavoriteContactConversation,
} = require("../controllers/contactConversationController");

router.get("/", authMiddleware, getAllContactConversations);
router.get("/progress", authMiddleware, getContactConversationProgress);
router.get("/contact/:contactId", authMiddleware, getContactConversationsByContactId);

router.post("/", authMiddleware, createContactConversation);

router.put("/:id", authMiddleware, updateContactConversation);
router.delete("/:id", authMiddleware, deleteContactConversation);

router.post("/:id/complete", authMiddleware, completeContactConversation);
router.post("/:id/favorite", authMiddleware, toggleFavoriteContactConversation);

module.exports = router;
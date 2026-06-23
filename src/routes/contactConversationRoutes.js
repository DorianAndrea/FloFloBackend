const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  getAllContactConversations,
  getContactConversationsByContactId,
  getContactConversationProgress,
  createContactConversation,
  completeContactConversation,
  toggleFavoriteContactConversation,
} = require("../controllers/contactConversationController");

const router = express.Router();

router.get("/", authMiddleware, getAllContactConversations);

router.get("/progress", authMiddleware, getContactConversationProgress);

router.get(
  "/contact/:contactId",
  authMiddleware,
  getContactConversationsByContactId
);

router.post("/", authMiddleware, createContactConversation);

router.post("/:id/complete", authMiddleware, completeContactConversation);

router.post("/", authMiddleware, createContactConversation);

router.post("/:id/complete", authMiddleware, completeContactConversation);

router.post("/:id/favorite", authMiddleware, toggleFavoriteContactConversation);

module.exports = router;
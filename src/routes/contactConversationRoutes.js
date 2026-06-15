const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  getAllContactConversations,
  getContactConversationProgress,
  createContactConversation,
  getContactConversationsByContactId,
  getContactConversationById,
  updateContactConversation,
  deleteContactConversation,
  completeContactConversation,
} = require("../controllers/contactConversationController");

const router = express.Router();

router.get("/", authMiddleware, getAllContactConversations);

router.get("/progress", authMiddleware, getContactConversationProgress);

router.post("/", authMiddleware, createContactConversation);

router.get(
  "/contact/:contactId",
  authMiddleware,
  getContactConversationsByContactId,
);

router.post("/:id/complete", authMiddleware, completeContactConversation);

router.get("/:id", authMiddleware, getContactConversationById);

router.put("/:id", authMiddleware, updateContactConversation);

router.delete("/:id", authMiddleware, deleteContactConversation);

module.exports = router;
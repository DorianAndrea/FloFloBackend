const express = require("express");
const authMiddleware = require ("../middleware/authMiddleware")
const {
  getAllContactConversations,
  getContactConversations,
  createContactConversation,
  getContactConversationsByContactId,
  getContactConversationById,
  updateContactConversation,
  deleteContactConversation,
} = require("../controllers/contactConversationController");

const router = express.Router();

router.get("/", authMiddleware, getAllContactConversations);

router.get("/", authMiddleware ,getContactConversations);

router.post("/", authMiddleware ,createContactConversation);

router.get("/contact/:id", authMiddleware, getContactConversationsByContactId);

router.get("/:id", authMiddleware, getContactConversationById);

router.put("/:id",authMiddleware, updateContactConversation);

router.delete("/:id",authMiddleware, deleteContactConversation);

module.exports = router;
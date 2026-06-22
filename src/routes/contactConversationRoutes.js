const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  getAllContactConversations,
  getContactConversationsByContactId,
  createContactConversation,
} = require("../controllers/contactConversationController");

const router = express.Router();

router.get("/", authMiddleware, getAllContactConversations);

router.get(
  "/contact/:contactId",
  authMiddleware,
  getContactConversationsByContactId
);

router.post("/", authMiddleware, createContactConversation);

module.exports = router;
const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  getAllContactConversations,
  createContactConversation,
} = require("../controllers/contactConversationController");

const router = express.Router();

router.get("/", authMiddleware, getAllContactConversations);
router.post("/", authMiddleware, createContactConversation);

module.exports = router;
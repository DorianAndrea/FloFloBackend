const express = require("express");
const router = express.Router();

const { getMoods, createMood } = require("../controllers/moodController");
const authMiddleware = require("../middleware/authMiddleware");

router.get("/", authMiddleware, getMoods);
router.post("/", authMiddleware, createMood);

module.exports = router;

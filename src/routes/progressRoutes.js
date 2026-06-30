const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const { getUserProgress } = require("../controllers/progressController");

const router = express.Router();

router.get("/children/:childId", authMiddleware, getUserProgress);
router.get("/", authMiddleware, getUserProgress);

module.exports = router;
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  generateMyReport,
  generateChildReport,
} = require("../controllers/reportController");

router.get("/me", authMiddleware, generateMyReport);
router.get("/children/:childId", authMiddleware, generateChildReport);

module.exports = router;
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getMyDashboard,
  getChildDashboard,
} = require("../controllers/parentDashboardController");

router.get("/me", authMiddleware, getMyDashboard);
router.get("/children/:childId", authMiddleware, getChildDashboard);

module.exports = router;
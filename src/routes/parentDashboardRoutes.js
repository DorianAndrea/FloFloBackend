const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getMyDashboard,
  getChildDashboard,
  getChildWeeklySupportPlanHistory,
} = require("../controllers/parentDashboardController");

router.get("/me", authMiddleware, getMyDashboard);

router.get(
  "/children/:childId/weekly-plan-history",
  authMiddleware,
  getChildWeeklySupportPlanHistory,
);

router.get("/children/:childId", authMiddleware, getChildDashboard);

module.exports = router;
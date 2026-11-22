const express = require("express");
const router = express.Router();

const authMiddleware = require(
  "../middleware/authMiddleware"
);

const {
  getOverview,
  getChildSupport,
  getChildOverview,
  getChildRoutines,
} = require("../controllers/dashboardController");

router.use(authMiddleware);

router.get("/overview", getOverview);

router.get(
  "/children/:childId/overview",
  getChildOverview
);

router.get(
  "/children/:childId/support",
  getChildSupport
);

router.get(
  "/children/:childId/routines",
  getChildRoutines
);

module.exports = router;
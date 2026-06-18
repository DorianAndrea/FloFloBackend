const express = require("express");
const router = express.Router();

const {
  getParentDashboard,
} = require("../controllers/parentDashboardController");

router.get("/:userId", getParentDashboard);

module.exports = router;
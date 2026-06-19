const express = require("express");
const router = express.Router();

const {
  generateReport,
} = require("../controllers/reportController");

router.get("/:userId", generateReport);

module.exports = router;
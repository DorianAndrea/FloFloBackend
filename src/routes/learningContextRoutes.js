const express = require("express");

const {
  getLearningContexts,
} = require("../controllers/learningContextController");

const router = express.Router();

router.get("/", getLearningContexts);

module.exports = router;
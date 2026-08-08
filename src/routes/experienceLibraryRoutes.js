const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getExperienceLibrary,
} = require("../controllers/experienceLibraryController");

router.get("/", authMiddleware, getExperienceLibrary);

module.exports = router;
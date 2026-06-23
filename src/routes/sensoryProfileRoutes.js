const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  getMySensoryProfile,
  upsertMySensoryProfile,
  getChildSensoryProfile,
} = require("../controllers/sensoryProfileController");

const router = express.Router();

router.get("/me", authMiddleware, getMySensoryProfile);
router.post("/me", authMiddleware, upsertMySensoryProfile);
router.put("/me", authMiddleware, upsertMySensoryProfile);

router.get("/children/:childId", authMiddleware, getChildSensoryProfile);

module.exports = router;
const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  getMySensoryProfile,
  upsertMySensoryProfile,
  getChildSensoryProfile,
  upsertChildSensoryProfile,
  getMySensoryProfileHistory,
  getChildSensoryProfileHistory,
} = require("../controllers/sensoryProfileController");

const router = express.Router();

router.get("/me", authMiddleware, getMySensoryProfile);
router.post("/me", authMiddleware, upsertMySensoryProfile);
router.put("/me", authMiddleware, upsertMySensoryProfile);
router.get("/me/history", authMiddleware, getMySensoryProfileHistory);

router.get("/children/:childId", authMiddleware, getChildSensoryProfile);
router.post("/children/:childId", authMiddleware, upsertChildSensoryProfile);
router.put("/children/:childId", authMiddleware, upsertChildSensoryProfile);
router.get(
  "/children/:childId/history",
  authMiddleware,
  getChildSensoryProfileHistory,
);

module.exports = router;
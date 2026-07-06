const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { aiLimiter } = require("../middleware/rateLimiters");

const {
  generateChildIntelligentObservation,
  getLatestChildIntelligentObservation,
  getChildIntelligentObservationHistory,
  downloadLatestChildIntelligentObservationPdf,
  getChildIntelligentObservationById,
  downloadChildIntelligentObservationPdfById,
} = require("../controllers/intelligentObservationController");

const router = express.Router();

router.post(
  "/children/:childId/generate",
  authMiddleware,
  aiLimiter,
  generateChildIntelligentObservation
);

router.get(
  "/children/:childId/latest",
  authMiddleware,
  getLatestChildIntelligentObservation
);

router.get(
  "/children/:childId/history",
  authMiddleware,
  getChildIntelligentObservationHistory
);

router.get(
  "/children/:childId/latest/pdf",
  authMiddleware,
  downloadLatestChildIntelligentObservationPdf
);

router.get(
  "/children/:childId/reports/:reportId",
  authMiddleware,
  getChildIntelligentObservationById
);

router.get(
  "/children/:childId/reports/:reportId/pdf",
  authMiddleware,
  downloadChildIntelligentObservationPdfById
);

module.exports = router;
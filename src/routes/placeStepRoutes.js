const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

const {
  getPlaceSteps,
  createPlaceStep,
} = require("../controllers/placeStepController");

const router = express.Router();

router.get(
  "/:id/steps",
  authMiddleware,
  getPlaceSteps
);

router.post(
  "/:id/steps",
  authMiddleware,
  upload.single("image"),
  createPlaceStep
);

module.exports = router;
const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

const {
  getPlaceSteps,
  createPlaceStep,
  replacePlaceSteps,
} = require("../controllers/placeStepController");

const router = express.Router();

/*
  Rutas padre/cuidador para pasos de lugares del hijo.
*/
router.get("/children/:childId/:id/steps", authMiddleware, getPlaceSteps);

router.post(
  "/children/:childId/:id/steps",
  authMiddleware,
  upload.single("image"),
  createPlaceStep,
);

router.put(
  "/children/:childId/:id/steps/replace",
  authMiddleware,
  replacePlaceSteps,
);

/*
  Rutas normales del niño/a.
*/
router.get("/:id/steps", authMiddleware, getPlaceSteps);

router.post(
  "/:id/steps",
  authMiddleware,
  upload.single("image"),
  createPlaceStep,
);

router.put("/:id/steps/replace", authMiddleware, replacePlaceSteps);

module.exports = router;
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  registerExperienceRecent,
  getExperienceRecents,
} = require("../controllers/experienceRecentController");

/*
  Usuario usando sus propias experiencias recientes.
*/
router.get(
  "/",
  authMiddleware,
  getExperienceRecents,
);

router.post(
  "/:templateId",
  authMiddleware,
  registerExperienceRecent,
);

/*
  Padre/cuidador/profesional trabajando con un niño seleccionado.
*/
router.get(
  "/children/:childId",
  authMiddleware,
  getExperienceRecents,
);

router.post(
  "/children/:childId/:templateId",
  authMiddleware,
  registerExperienceRecent,
);

module.exports = router;
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getExperienceCategories,
  getExperienceTemplates,
  getExperienceTemplate,
} = require("../controllers/experienceTemplateController");

/*
|--------------------------------------------------------------------------
| Banco de Experiencias FloFlo
|--------------------------------------------------------------------------
*/

router.get(
  "/categories",
  authMiddleware,
  getExperienceCategories,
);

router.get(
  "/",
  authMiddleware,
  getExperienceTemplates,
);

router.get(
  "/:id",
  authMiddleware,
  getExperienceTemplate,
);

module.exports = router;
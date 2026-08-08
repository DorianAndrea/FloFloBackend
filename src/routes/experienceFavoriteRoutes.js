const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getExperienceFavorites,
  addExperienceFavorite,
  removeExperienceFavorite,
} = require("../controllers/experienceFavoriteController");

router.get(
  "/",
  authMiddleware,
  getExperienceFavorites,
);

router.post(
  "/:templateId",
  authMiddleware,
  addExperienceFavorite,
);

router.delete(
  "/:templateId",
  authMiddleware,
  removeExperienceFavorite,
);

module.exports = router;
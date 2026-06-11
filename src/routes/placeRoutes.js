const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

const {
  getPlaces,
  getPlaceById,
  createPlace,
  updatePlace,
  deletePlace,
  completePlace,
} = require("../controllers/placeController");

const router = express.Router();

router.get("/", authMiddleware, getPlaces);
router.get("/:id", authMiddleware, getPlaceById);
router.post("/", authMiddleware, upload.single("image"), createPlace);
router.put("/:id", authMiddleware, upload.single("image"), updatePlace);
router.delete("/:id", authMiddleware, deletePlace);
router.post("/:id/complete", authMiddleware, completePlace);

module.exports = router;
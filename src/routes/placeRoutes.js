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

/*
  Rutas padre/cuidador para lugares del hijo.
*/
router.get("/children/:childId", authMiddleware, getPlaces);
router.get("/children/:childId/:id", authMiddleware, getPlaceById);

router.post(
  "/children/:childId",
  authMiddleware,
  upload.single("image"),
  createPlace,
);

router.put(
  "/children/:childId/:id",
  authMiddleware,
  upload.single("image"),
  updatePlace,
);

router.delete("/children/:childId/:id", authMiddleware, deletePlace);
router.post("/children/:childId/:id/complete", authMiddleware, completePlace);

/*
  Rutas normales del niño/a.
*/
router.get("/", authMiddleware, getPlaces);
router.get("/:id", authMiddleware, getPlaceById);

router.post("/", authMiddleware, upload.single("image"), createPlace);
router.put("/:id", authMiddleware, upload.single("image"), updatePlace);

router.delete("/:id", authMiddleware, deletePlace);
router.post("/:id/complete", authMiddleware, completePlace);

module.exports = router;
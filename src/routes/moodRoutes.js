const express = require("express");
const router = express.Router();

const { getMoods, createMood } = require("../controllers/moodController");
const authMiddleware = require("../middleware/authMiddleware");

/*
  Rutas para padre/cuidador viendo o registrando
  emociones del hijo seleccionado.
  Van primero para evitar choques futuros.
*/

router.get("/children/:childId", authMiddleware, getMoods);
router.post("/children/:childId", authMiddleware, createMood);

/*
  Rutas normales para el niño/a.
*/

router.get("/", authMiddleware, getMoods);
router.post("/", authMiddleware, createMood);

module.exports = router;
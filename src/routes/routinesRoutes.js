const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getRoutines,
  getTodayRoutines,
  getRoutineHistory,
  createRoutine,
  deleteRoutine,
  updateRoutine,
  completeRoutine,
} = require("../controllers/routineController");

router.get("/today", authMiddleware, getTodayRoutines);
router.get("/history", authMiddleware, getRoutineHistory);
router.get("/", authMiddleware, getRoutines);

router.post("/", authMiddleware, createRoutine);

router.put("/:id", authMiddleware, updateRoutine);
router.delete("/:id", authMiddleware, deleteRoutine);

router.post("/:id/complete", authMiddleware, completeRoutine);

module.exports = router;
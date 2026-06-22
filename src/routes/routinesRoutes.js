const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getRoutines,
  createRoutine,
  deleteRoutine,
  updateRoutine,
  completeRoutine,
} = require("../controllers/routineController");

router.get("/", authMiddleware, getRoutines);
router.post("/", authMiddleware, createRoutine);
router.delete("/:id", authMiddleware, deleteRoutine);
router.put("/:id", authMiddleware, updateRoutine);
router.post("/:id/complete", authMiddleware, completeRoutine);

module.exports = router;
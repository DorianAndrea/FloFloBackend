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
  completeRoutineStep,
  uncompleteRoutineStep,
  startRoutineStepFloCard,
  completeRoutine,
} = require("../controllers/routineController");

/*
  Rutas para padre/cuidador viendo rutinas de un hijo asociado.
  Van primero para que Express no confunda "children" con un :id.
*/
router.get("/children/:childId/today", authMiddleware, getTodayRoutines);
router.get("/children/:childId/history", authMiddleware, getRoutineHistory);
router.get("/children/:childId", authMiddleware, getRoutines);

router.post("/children/:childId", authMiddleware, createRoutine);
router.put("/children/:childId/:id", authMiddleware, updateRoutine);
router.delete("/children/:childId/:id", authMiddleware, deleteRoutine);
router.post("/children/:childId/:id/complete", authMiddleware, completeRoutine);
router.post(
  "/children/:childId/:routineId/steps/:stepId/complete",
  authMiddleware,
  completeRoutineStep,
);
router.delete(
  "/children/:childId/:routineId/steps/:stepId/complete",
  authMiddleware,
  uncompleteRoutineStep,
);

router.post(
  "/children/:childId/:routineId/steps/:stepId/complete",
  authMiddleware,
  completeRoutineStep,
);

router.post(
  "/children/:childId/:routineId/steps/:stepId/flocard/start",
  authMiddleware,
  startRoutineStepFloCard,
);
/*
  Rutas normales para niño/a usando sus propias rutinas.
*/
/*
  Rutas normales para niño/a usando sus propias rutinas.
*/
router.get("/today", authMiddleware, getTodayRoutines);
router.get("/history", authMiddleware, getRoutineHistory);
router.get("/", authMiddleware, getRoutines);

router.post("/", authMiddleware, createRoutine);
router.post(
  "/:routineId/steps/:stepId/flocard/start",
  authMiddleware,
  startRoutineStepFloCard,
);
/*
  Las rutas específicas de pasos deben ir antes
  que las rutas genéricas con /:id.
*/
router.post(
  "/:routineId/steps/:stepId/complete",
  authMiddleware,
  completeRoutineStep,
);

router.delete(
  "/:routineId/steps/:stepId/complete",
  authMiddleware,
  uncompleteRoutineStep,
);

router.post(
  "/:id/complete",
  authMiddleware,
  completeRoutine,
);

router.put("/:id", authMiddleware, updateRoutine);
router.delete("/:id", authMiddleware, deleteRoutine);

router.post(
  "/:routineId/steps/:stepId/complete",
  authMiddleware,
  completeRoutineStep,
);

module.exports = router;
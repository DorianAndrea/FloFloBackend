const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware")
const{ 
    getRoutines,
    createRoutine,
    deleteRoutine, 
    updateRoutine,
    completeRoutine,
 } = require("../controllers/routineController");
 


router.get('/', getRoutines);
router.post('/', createRoutine);
router.delete('/:id', deleteRoutine);
router.put('/:id', updateRoutine);
router.post("/:id/complete", authMiddleware, completeRoutine);

module.exports = router;
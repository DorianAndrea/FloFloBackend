const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getMyChildren,
  linkChildToMe,
} = require("../controllers/parentChildController");

router.get("/me/children", authMiddleware, getMyChildren);
router.post("/me/children", authMiddleware, linkChildToMe);

module.exports = router;
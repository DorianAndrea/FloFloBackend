const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getMyChildren,
  createMyLinkCode,
  linkChildToMe,
} = require("../controllers/parentChildController");

router.get("/me/children", authMiddleware, getMyChildren);

router.post("/me/link-code", authMiddleware, createMyLinkCode);

router.post("/me/children", authMiddleware, linkChildToMe);

module.exports = router;
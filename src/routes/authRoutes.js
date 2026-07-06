const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

const {
  authLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  changePasswordLimiter,
} = require("../middleware/rateLimiters");

const {
  register,
  login,
  getMe,
  updateMe,
  forgotPassword,
  resetPassword,
  changePassword,
} = require("../controllers/authController");

const router = express.Router();

router.post("/register", registerLimiter, upload.single("avatar"), register);

router.post("/login", authLimiter, login);

router.get("/me", authMiddleware, getMe);

router.put("/me", authMiddleware, upload.single("avatar"), updateMe);

router.put(
  "/change-password",
  changePasswordLimiter,
  authMiddleware,
  changePassword
);

router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);

router.post("/reset-password", resetPasswordLimiter, resetPassword);

module.exports = router;
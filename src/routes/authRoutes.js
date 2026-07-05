const express = require("express")
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
const {
  authLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  changePasswordLimiter,
} = require("../middleware/rateLimiters");

const router = express.Router();

const {
    register,
    login, 
    getMe,
    updateMe,
    forgotPassword,
    resetPassword,
    changePassword,
} = require("../controllers/authController");

router.post("/register", registerLimiter, upload.single("avatar"), register);
router.post("/login",registerLimiter, login);
router.get("/me", authMiddleware, getMe);
router.put("/me", authMiddleware, upload.single("avatar"), updateMe);
router.put("/change-password", changePasswordLimiter ,authMiddleware, changePassword);
router.post("/forgot-password", forgotPasswordLimiter ,forgotPassword);
router.post("/reset-password", registerLimiter ,resetPassword);
module.exports = router;
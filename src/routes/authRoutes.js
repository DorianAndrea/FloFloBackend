const express = require("express")
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

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

router.post("/register", upload.single("avatar"), register);
router.post("/login", login);
router.get("/me", authMiddleware, getMe);
router.put("/me", authMiddleware, upload.single("avatar"), updateMe);
router.put("/change-password", authMiddleware, changePassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
module.exports = router;
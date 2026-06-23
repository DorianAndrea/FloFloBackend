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
    resetPassword
} = require("../controllers/authController");

router.post("/register", upload.single("avatar"), register);
router.post("/login", login);
router.get("/me", authMiddleware, getMe);
router.put("/me", authMiddleware, upload.single("avatar"), updateMe);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
module.exports = router;
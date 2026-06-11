const express = require("express");
const upload = require("../middleware/upload");
const authMiddleware = require("../middleware/authMiddleware");

const {
  getContacts,
  getContactById,
  createContact,
  deleteContact,
  updateContact,
} = require("../controllers/contactController");

const router = express.Router();

router.get("/", authMiddleware, getContacts);

router.get("/:id", authMiddleware, getContactById);

router.post(
  "/",
  authMiddleware,
  upload.single("image"),
  createContact
);

router.put(
  "/:id",
  authMiddleware,
  upload.single("image"),
  updateContact
);

router.delete("/:id", authMiddleware, deleteContact);

module.exports = router;
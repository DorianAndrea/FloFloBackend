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

/*
  Rutas para padre/cuidador gestionando amigos/contactos
  del hijo seleccionado.
  Van primero para que "children" no se confunda con ":id".
*/

router.get("/children/:childId", authMiddleware, getContacts);

router.get("/children/:childId/:id", authMiddleware, getContactById);

router.post(
  "/children/:childId",
  authMiddleware,
  upload.single("image"),
  createContact,
);

router.put(
  "/children/:childId/:id",
  authMiddleware,
  upload.single("image"),
  updateContact,
);

router.delete("/children/:childId/:id", authMiddleware, deleteContact);

/*
  Rutas normales para niño/a usando sus propios amigos/contactos.
*/

router.get("/", authMiddleware, getContacts);

router.get("/:id", authMiddleware, getContactById);

router.post("/", authMiddleware, upload.single("image"), createContact);

router.put("/:id", authMiddleware, upload.single("image"), updateContact);

router.delete("/:id", authMiddleware, deleteContact);

module.exports = router;1
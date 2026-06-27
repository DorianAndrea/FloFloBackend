const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getAllContactConversations,
  getContactConversationsByContactId,
  createContactConversation,
  updateContactConversation,
  deleteContactConversation,
  completeContactConversation,
  getContactConversationProgress,
  toggleFavoriteContactConversation,
} = require("../controllers/contactConversationController");

/*
  Rutas para padre/cuidador gestionando conversaciones
  de contactos del hijo seleccionado.
  Van primero para que "children" no se confunda con ":id".
*/

router.get(
  "/children/:childId/progress",
  authMiddleware,
  getContactConversationProgress,
);

router.get(
  "/children/:childId/contact/:contactId",
  authMiddleware,
  getContactConversationsByContactId,
);

router.get(
  "/children/:childId",
  authMiddleware,
  getAllContactConversations,
);

router.post(
  "/children/:childId",
  authMiddleware,
  createContactConversation,
);

router.put(
  "/children/:childId/:id",
  authMiddleware,
  updateContactConversation,
);

router.delete(
  "/children/:childId/:id",
  authMiddleware,
  deleteContactConversation,
);

router.post(
  "/children/:childId/:id/complete",
  authMiddleware,
  completeContactConversation,
);

router.post(
  "/children/:childId/:id/favorite",
  authMiddleware,
  toggleFavoriteContactConversation,
);

/*
  Rutas normales para niño/a usando sus propias conversaciones
  asociadas a contactos.
*/

router.get("/", authMiddleware, getAllContactConversations);

router.get("/progress", authMiddleware, getContactConversationProgress);

router.get(
  "/contact/:contactId",
  authMiddleware,
  getContactConversationsByContactId,
);

router.post("/", authMiddleware, createContactConversation);

router.put("/:id", authMiddleware, updateContactConversation);

router.delete("/:id", authMiddleware, deleteContactConversation);

router.post("/:id/complete", authMiddleware, completeContactConversation);

router.post("/:id/favorite", authMiddleware, toggleFavoriteContactConversation);

module.exports = router;
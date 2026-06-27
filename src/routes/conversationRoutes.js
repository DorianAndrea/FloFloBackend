const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  createConversation,
  getConversations,
  getPaginatedConversations,
  completeConversation,
  getConversationProgress,
  deleteConversation,
  updateConversation,
  toggleFavoriteConversation,
} = require("../controllers/conversationController");

const router = express.Router();

/*
  Rutas para padre/cuidador gestionando conversaciones
  generales del hijo seleccionado.
  Van primero para evitar choques con ":id".
*/

router.get(
  "/children/:childId/paginated",
  authMiddleware,
  getPaginatedConversations,
);

router.get(
  "/children/:childId/progress",
  authMiddleware,
  getConversationProgress,
);

router.get(
  "/children/:childId",
  authMiddleware,
  getConversations,
);

router.post(
  "/children/:childId",
  authMiddleware,
  createConversation,
);

router.post(
  "/children/:childId/:id/complete",
  authMiddleware,
  completeConversation,
);

router.put(
  "/children/:childId/:id",
  authMiddleware,
  updateConversation,
);

router.delete(
  "/children/:childId/:id",
  authMiddleware,
  deleteConversation,
);

router.patch(
  "/children/:childId/:id/favorite",
  authMiddleware,
  toggleFavoriteConversation,
);

/*
  Rutas normales para el usuario conectado.
  Esto lo usa el niño/a.
*/

router.get("/paginated", authMiddleware, getPaginatedConversations);

router.get("/progress", authMiddleware, getConversationProgress);

router.get("/", authMiddleware, getConversations);

router.post("/", authMiddleware, createConversation);

router.post("/:id/complete", authMiddleware, completeConversation);

router.put("/:id", authMiddleware, updateConversation);

router.delete("/:id", authMiddleware, deleteConversation);

router.patch("/:id/favorite", authMiddleware, toggleFavoriteConversation);

module.exports = router;
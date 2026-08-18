const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const authMiddleware = require("../middleware/authMiddleware");

const {
  getMyChildren,
  createChildProfile,
  createMyLinkCode,
  linkChildToMe,
  getChildSupportTeam,
  createChildSupportTeamInvitation,
  getSupportTeamInvitation,
  acceptSupportTeamInvitation,
  cancelChildSupportTeamInvitation,
  removeChildSupportTeamMember,
} = require("../controllers/parentChildController");

/* -------------------------------------------------------------------------- */
/* NIÑOS DEL CUIDADOR                                                         */
/* -------------------------------------------------------------------------- */

/*
 * Obtener los perfiles infantiles asociados
 * al adulto autenticado.
 */
router.get(
  "/me/children",
  authMiddleware,
  getMyChildren,
);

/*
 * NUEVO FLUJO
 *
 * Crear un perfil infantil sin:
 * - correo
 * - contraseña
 * - cuenta user
 *
 * POST /me/children
 */
router.post(
  "/me/children",
  authMiddleware,
  upload.single("avatar"),
  createChildProfile,
);

/* -------------------------------------------------------------------------- */
/* LEGACY - VINCULACIÓN ANTIGUA                                               */
/* -------------------------------------------------------------------------- */

/*
 * Estos endpoints se mantienen temporalmente
 * mientras retiramos el flujo antiguo del frontend.
 *
 * NO deben utilizarse para niños nuevos.
 */
router.post(
  "/me/link-code",
  authMiddleware,
  createMyLinkCode,
);

router.post(
  "/me/children/link",
  authMiddleware,
  linkChildToMe,
);

/* -------------------------------------------------------------------------- */
/* EQUIPO FLOFLO                                                              */
/* -------------------------------------------------------------------------- */

router.get(
  "/children/:childId/team",
  authMiddleware,
  getChildSupportTeam,
);

router.post(
  "/children/:childId/team/invitations",
  authMiddleware,
  createChildSupportTeamInvitation,
);

router.patch(
  "/children/:childId/team/invitations/:invitationId/cancel",
  authMiddleware,
  cancelChildSupportTeamInvitation,
);

router.delete(
  "/children/:childId/team/members/:memberId",
  authMiddleware,
  removeChildSupportTeamMember,
);

/* -------------------------------------------------------------------------- */
/* INVITACIONES                                                               */
/* -------------------------------------------------------------------------- */

router.get(
  "/team/invitations/:token",
  getSupportTeamInvitation,
);

router.post(
  "/team/invitations/:token/accept",
  authMiddleware,
  acceptSupportTeamInvitation,
);

module.exports = router;
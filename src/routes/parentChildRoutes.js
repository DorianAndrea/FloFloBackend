const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getMyChildren,
  createMyLinkCode,
  linkChildToMe,

  getChildSupportTeam,
  createChildSupportTeamInvitation,
  getSupportTeamInvitation,
  acceptSupportTeamInvitation,
  cancelChildSupportTeamInvitation,
  removeChildSupportTeamMember,
} = require("../controllers/parentChildController");

router.get("/me/children", authMiddleware, getMyChildren);

router.post("/me/link-code", authMiddleware, createMyLinkCode);

router.post("/me/children", authMiddleware, linkChildToMe);

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
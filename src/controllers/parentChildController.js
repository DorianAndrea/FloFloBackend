const parentChildService = require("../services/parentChildService");
const emailService = require("../services/emailService");

const getMyChildren = async (req, res) => {
  try {
    const parentId = req.user.id;

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo una cuenta cuidadora puede tener niños asociados",
      });
    }

    const children = await parentChildService.getChildrenByParent(parentId);

    return res.json(children);
  } catch (error) {
    console.error("Error obteniendo niños del padre:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo niños asociados",
    });
  }
};

const createChildProfile = async (req, res) => {
  try {
    const parentId = req.user.id;

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo una cuenta cuidadora puede crear perfiles infantiles",
      });
    }

    const firstName = String(req.body.firstName || "").trim();
    const lastName = String(req.body.lastName || "").trim();
    const birthDate = req.body.birthDate || null;
    const avatarUrl = req.file ? req.file.path : null;

    if (!firstName) {
      return res.status(400).json({
        message: "El nombre del niño/a es obligatorio",
      });
    }

    const child = await parentChildService.createChildProfile({
      parentId,
      firstName,
      lastName: lastName || null,
      birthDate,
      avatarUrl,
    });

    return res.status(201).json({
      message: "Perfil infantil creado correctamente",
      child,
    });
  } catch (error) {
    console.error("Error creando perfil infantil:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "No se pudo crear el perfil del niño/a",
    });
  }
};

const createMyLinkCode = async (req, res) => {
  try {
    const childId = req.user.id;

    if (req.user.role !== "child") {
      return res.status(403).json({
        message:
          "Solo una cuenta de niño/a puede generar código de vinculación",
      });
    }

    const result = await parentChildService.createChildLinkCode(childId);

    return res.status(201).json({
      message: "Código de vinculación generado",
      code: result.code,
      expires_at: result.expires_at,
      expiresInMinutes: result.expiresInMinutes,
    });
  } catch (error) {
    console.error("Error generando código de vinculación:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error generando código de vinculación",
    });
  }
};

const linkChildToMe = async (req, res) => {
  try {
    const parentId = req.user.id;

    const childEmail = String(req.body.childEmail || "")
      .trim()
      .toLowerCase();

    const linkCode = String(req.body.linkCode || "")
      .replace(/\s+/g, "")
      .trim();

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo una cuenta cuidadora puede asociar niños",
      });
    }

    if (!childEmail || !linkCode) {
      return res.status(400).json({
        message: "El correo del niño/a y el código son obligatorios",
      });
    }

    const result = await parentChildService.linkChildToParent(
      parentId,
      childEmail,
      linkCode,
    );

    return res.status(201).json(result);
  } catch (error) {
    console.error("Error asociando niño:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error asociando niño al cuidador",
    });
  }
};

/* -------------------------------------------------------------------------- */
/* EQUIPO FLOFLO                                                              */
/* -------------------------------------------------------------------------- */

const getChildSupportTeam = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const childId = req.params.childId;

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo una cuenta adulta puede consultar el Equipo FloFlo",
      });
    }

    const team = await parentChildService.getSupportTeam(requesterId, childId);

    return res.json({
      team,
    });
  } catch (error) {
    console.error("Error obteniendo Equipo FloFlo:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "No se pudo obtener el Equipo FloFlo",
    });
  }
};

const createChildSupportTeamInvitation = async (req, res) => {
  try {
    const invitedBy = req.user.id;
    const childId = req.params.childId;

    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const relationshipKey = String(req.body.relationshipKey || "").trim();

    const message = String(req.body.message || "").trim();

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo una cuenta adulta puede enviar invitaciones",
      });
    }

    const result = await parentChildService.createSupportTeamInvitation({
      invitedBy,
      childId,
      email,
      relationshipKey,
      message,
    });
    console.log("🔎 DEBUG EQUIPO FLOFLO", {
      authUserId: req.user?.id,
      authUserEmail: req.user?.email,

      invitedBy,

      emailIngresado: email,
      emailGuardado: result.invitation?.email,

      inviterId: result.inviter?.id,
      inviterFirstName: result.inviter?.firstName,
      inviterLastName: result.inviter?.lastName,

      childId: result.child?.id,
      childFirstName: result.child?.firstName,
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    const invitationUrl = `${frontendUrl}/equipo-floflo/invitacion/${result.token}`;

    console.log("DEBUG INVITACIÓN EQUIPO FLOFLO:", {
      usuarioAutenticado: req.user,
      invitedBy,
      correoIngresado: email,
      correoGuardadoInvitacion: result.invitation?.email,
      invitadorDevuelto: result.inviter,
      child: result.child,
    });

    await emailService.sendSupportTeamInvitationEmail({
      to: result.invitation.email,
      childFirstName: result.child.firstName,
      childLastName: result.child.lastName,
      inviterFirstName: result.inviter.firstName,
      inviterLastName: result.inviter.lastName,
      relationshipKey: result.invitation.relationship_key,
      message: result.invitation.message,
      invitationUrl,
      expiresInDays: result.expiresInDays,
    });

    return res.status(201).json({
      message: "Invitación enviada correctamente",
      invitation: result.invitation,
    });
  } catch (error) {
    console.error("Error creando invitación Equipo FloFlo:", error);

    return res.status(error.statusCode || 500).json({
      message:
        error.message || "No se pudo enviar la invitación al Equipo FloFlo",
    });
  }
};

const getSupportTeamInvitation = async (req, res) => {
  try {
    const token = String(req.params.token || "").trim();

    const invitation =
      await parentChildService.getSupportTeamInvitationByToken(token);

    return res.json({
      invitation,
    });
  } catch (error) {
    console.error("Error consultando invitación Equipo FloFlo:", error);

    return res.status(error.statusCode || 500).json({
      message:
        error.message || "No se pudo consultar la invitación al Equipo FloFlo",
    });
  }
};

const acceptSupportTeamInvitation = async (req, res) => {
  try {
    const token = String(req.params.token || "").trim();

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "La invitación debe aceptarse desde una cuenta adulta",
      });
    }

    const result = await parentChildService.acceptSupportTeamInvitation({
      token,
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
    });

    return res.status(201).json({
      message: "Ahora formas parte del Equipo FloFlo",
      ...result,
    });
  } catch (error) {
    console.error("Error aceptando invitación Equipo FloFlo:", error);

    return res.status(error.statusCode || 500).json({
      message:
        error.message || "No se pudo aceptar la invitación al Equipo FloFlo",
    });
  }
};

const cancelChildSupportTeamInvitation = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const childId = req.params.childId;
    const invitationId = req.params.invitationId;

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo una cuenta adulta puede cancelar invitaciones",
      });
    }

    const invitation = await parentChildService.cancelSupportTeamInvitation({
      requesterId,
      childId,
      invitationId,
    });

    return res.json({
      message: "Invitación cancelada",
      invitation,
    });
  } catch (error) {
    console.error("Error cancelando invitación Equipo FloFlo:", error);

    return res.status(error.statusCode || 500).json({
      message:
        error.message || "No se pudo cancelar la invitación al Equipo FloFlo",
    });
  }
};

const removeChildSupportTeamMember = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const childId = req.params.childId;
    const memberId = req.params.memberId;

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo una cuenta adulta puede quitar integrantes",
      });
    }

    const membership = await parentChildService.removeSupportTeamMember({
      requesterId,
      childId,
      memberId,
    });

    return res.json({
      message: "Integrante removido del Equipo FloFlo",
      membership,
    });
  } catch (error) {
    console.error("Error removiendo integrante Equipo FloFlo:", error);

    return res.status(error.statusCode || 500).json({
      message:
        error.message || "No se pudo remover al integrante del Equipo FloFlo",
    });
  }
};

module.exports = {
  getMyChildren,
  createChildProfile,

  // Legacy temporal
  createMyLinkCode,
  linkChildToMe,

  getChildSupportTeam,
  createChildSupportTeamInvitation,
  getSupportTeamInvitation,
  acceptSupportTeamInvitation,
  cancelChildSupportTeamInvitation,
  removeChildSupportTeamMember,
};

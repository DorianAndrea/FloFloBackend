const parentChildService = require("../services/parentChildService");

const getMyChildren = async (req, res) => {
  try {
    const parentId = req.user.id;

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo una cuenta cuidadora puede tener niños asociados",
      });
    }

    const children = await parentChildService.getChildrenByParent(parentId);

    res.json(children);
  } catch (error) {
    console.error("Error obteniendo niños del padre:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo niños asociados",
    });
  }
};

const createMyLinkCode = async (req, res) => {
  try {
    const childId = req.user.id;

    if (req.user.role !== "child") {
      return res.status(403).json({
        message: "Solo una cuenta de niño/a puede generar código de vinculación",
      });
    }

    const result = await parentChildService.createChildLinkCode(childId);

    res.status(201).json({
      message: "Código de vinculación generado",
      code: result.code,
      expires_at: result.expires_at,
      expiresInMinutes: result.expiresInMinutes,
    });
  } catch (error) {
    console.error("Error generando código de vinculación:", error);

    res.status(error.statusCode || 500).json({
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

    res.status(201).json(result);
  } catch (error) {
    console.error("Error asociando niño:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error asociando niño al cuidador",
    });
  }
};

module.exports = {
  getMyChildren,
  createMyLinkCode,
  linkChildToMe,
};
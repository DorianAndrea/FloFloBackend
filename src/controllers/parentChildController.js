const parentChildService = require("../services/parentChildService");

const getMyChildren = async (req, res) => {
  try {
    //console.log("REQ USER", req.user)
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
    res.status(500).json({
      message: "Error obteniendo niños asociados",
    });
  }
};

const linkChildToMe = async (req, res) => {
  try {
    const parentId = req.user.id;
    const childEmail = String(req.body.childEmail || "")
      .trim()
      .toLowerCase();

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo una cuenta cuidadora puede asociar niños",
      });
    }

    if (!childEmail) {
      return res.status(400).json({
        message: "El correo del niño es obligatorio",
      });
    }

    const result = await parentChildService.linkChildToParent(
      parentId,
      childEmail,
    );

    if (!result) {
      return res.status(404).json({
        message: "No se encontró un usuario niño con ese correo",
      });
    }

    res.status(201).json(result);
  } catch (error) {
    console.error("Error asociando niño:", error);
    res.status(500).json({
      message: "Error asociando niño al cuidador",
    });
  }
};

module.exports = {
  getMyChildren,
  linkChildToMe,
};

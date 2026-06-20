const parentChildService = require("../services/parentChildService");

const getChildrenByParent = async (req, res) => {
  try {
    const { parentId } = req.params;

    const children = await parentChildService.getChildrenByParent(parentId);

    res.json(children);
  } catch (error) {
    console.error("Error obteniendo niños del padre:", error);

    res.status(500).json({
      message: "Error obteniendo niños asociados",
    });
  }
};

const linkChildToParent = async (req, res) => {
  try {
    const { parentId } = req.params;
    const { childEmail } = req.body;
    console.log("PARENT ID:", parentId);
    console.log("BODY:", req.body);
    console.log("CHILD EMAIL:", childEmail);

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
  getChildrenByParent,
  linkChildToParent,
};

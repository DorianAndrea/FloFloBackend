const pool = require("../database/db");
const parentDashboardService = require("../services/parentDashboardService");

const isValidId = (id) => {
  const numberId = Number(id);
  return Number.isInteger(numberId) && numberId > 0;
};

const getMyDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    const dashboard = await parentDashboardService.getParentDashboard(userId);

    res.json(dashboard);
  } catch (error) {
    console.error("Error en panel personal:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error al obtener el panel",
    });
  }
};

const getChildDashboard = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { childId } = req.params;

    if (!isValidId(childId)) {
      return res.status(400).json({
        message: "ID de niño inválido",
      });
    }

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo un cuidador puede acceder al panel de un niño",
      });
    }

    const relation = await pool.query(
      `
      SELECT 1
      FROM "FloFlo".parent_child
      WHERE parent_id = $1
      AND child_id = $2
      LIMIT 1
      `,
      [parentId, Number(childId)]
    );

    if (relation.rows.length === 0) {
      return res.status(403).json({
        message: "No tienes permiso para ver este niño",
      });
    }

    const dashboard = await parentDashboardService.getParentDashboard(
      Number(childId)
    );

    res.json(dashboard);
  } catch (error) {
    console.error("Error en panel de hijo:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error al obtener el panel del niño",
    });
  }
};

module.exports = {
  getMyDashboard,
  getChildDashboard,
};
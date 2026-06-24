const pool = require("../database/db");

const {
  getParentDashboard,
  getWeeklySupportPlanHistory,
} = require("../services/parentDashboardService");

const isValidId = (id) => {
  const numberId = Number(id);
  return Number.isInteger(numberId) && numberId > 0;
};

const checkParentChildRelation = async (parentId, childId) => {
  const result = await pool.query(
    `
    SELECT 1
    FROM "FloFlo".parent_child
    WHERE parent_id = $1
    AND child_id = $2
    LIMIT 1
    `,
    [parentId, childId],
  );

  return result.rows.length > 0;
};

const getMyDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    const dashboard = await getParentDashboard(userId);

    res.json(dashboard);
  } catch (error) {
    console.error("Error obteniendo mi dashboard:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo dashboard",
    });
  }
};

const getChildDashboard = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { childId } = req.params;

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo un cuidador puede ver el dashboard de un niño",
      });
    }

    if (!isValidId(childId)) {
      return res.status(400).json({
        message: "ID de niño inválido",
      });
    }

    const childIdNumber = Number(childId);

    const hasRelation = await checkParentChildRelation(parentId, childIdNumber);

    if (!hasRelation) {
      return res.status(403).json({
        message: "No tienes permiso para ver este dashboard",
      });
    }

    const dashboard = await getParentDashboard(childIdNumber);

    res.json(dashboard);
  } catch (error) {
    console.error("Error obteniendo dashboard del niño:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo dashboard del niño",
    });
  }
};

const getChildWeeklySupportPlanHistory = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { childId } = req.params;

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo un cuidador puede ver el historial del plan semanal",
      });
    }

    if (!isValidId(childId)) {
      return res.status(400).json({
        message: "ID de niño inválido",
      });
    }

    const childIdNumber = Number(childId);

    const hasRelation = await checkParentChildRelation(parentId, childIdNumber);

    if (!hasRelation) {
      return res.status(403).json({
        message: "No tienes permiso para ver este historial",
      });
    }

    const history = await getWeeklySupportPlanHistory(childIdNumber);

    res.json(history);
  } catch (error) {
    console.error("Error obteniendo historial del plan semanal:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo historial del plan semanal",
    });
  }
};

module.exports = {
  getMyDashboard,
  getChildDashboard,
  getChildWeeklySupportPlanHistory,
};
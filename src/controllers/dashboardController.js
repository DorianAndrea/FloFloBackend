const {
  getDashboardOverview,
  getChildSupportOverview,
  getChildDashboardOverview,
  getChildRoutineAnalytics,
} = require("../services/dashboardService");

/*
 * Validar que el usuario esté autenticado
 * y corresponda a una cuenta adulta.
 */

const validateDashboardUser = (req) => {
  if (!req.user || !req.user.id) {
    const error = new Error("Usuario no autenticado");
    error.statusCode = 401;
    throw error;
  }

  if (req.user.role !== "parent") {
    const error = new Error(
      "Este Dashboard está disponible para cuentas adultas autorizadas"
    );

    error.statusCode = 403;
    throw error;
  }

  return req.user.id;
};

/*
 * Manejo centralizado de errores del Dashboard.
 */

const handleDashboardError = (res, error, context) => {
  console.error(`[Dashboard] ${context}:`, error);

  const statusCode = error.statusCode || 500;

  return res.status(statusCode).json({
    message:
      statusCode === 500
        ? "Error interno obteniendo información del Dashboard"
        : error.message,
  });
};

/*
 * GET /api/dashboard/overview
 *
 * Resumen general de todos los niños autorizados.
 */

const getOverview = async (req, res) => {
  try {
    const actorUserId = validateDashboardUser(req);

    const overview = await getDashboardOverview(
      actorUserId
    );

    res.set("Cache-Control", "private, no-store");

    return res.status(200).json(overview);

  } catch (error) {
    return handleDashboardError(
      res,
      error,
      "Error obteniendo resumen general"
    );
  }
};

/*
 * GET /api/dashboard/children/:childId/support
 *
 * Distribución de niveles de apoyo
 * de un niño/a autorizado.
 */

const getChildSupport = async (req, res) => {
  try {
    const actorUserId = validateDashboardUser(req);

    const { childId } = req.params;

    const supportOverview =
      await getChildSupportOverview(
        actorUserId,
        childId
      );

    res.set("Cache-Control", "private, no-store");

    return res.status(200).json(supportOverview);

  } catch (error) {
    return handleDashboardError(
      res,
      error,
      "Error obteniendo niveles de apoyo"
    );
  }
};

const getChildOverview = async (req, res) => {
  try {
    const data = await getChildDashboardOverview(
      req.user.id,
      req.params.childId
    );

    return res.status(200).json(data);
  } catch (error) {
    const statusCode = error.statusCode || 500;

    if (statusCode === 500) {
      console.error(
        "Error obteniendo Dashboard individual:",
        error
      );
    }

    return res.status(statusCode).json({
      message:
        statusCode === 500
          ? "Error interno del servidor"
          : error.message,
    });
  }
};

const getChildRoutines = async (req, res) => {
  try {
    const data = await getChildRoutineAnalytics(
      req.user.id,
      req.params.childId
    );

    return res.status(200).json(data);
  } catch (error) {
    const statusCode = error.statusCode || 500;

    if (statusCode === 500) {
      console.error(
        "Error obteniendo análisis de rutinas:",
        error
      );
    }

    return res.status(statusCode).json({
      message:
        statusCode === 500
          ? "Error interno del servidor"
          : error.message,
    });
  }
};

module.exports = {
  getOverview,
  getChildSupport,
  getChildOverview,
  getChildRoutines,
};
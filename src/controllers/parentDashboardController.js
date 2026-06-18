const parentDashboardService = require("../services/parentDashboardService");

const getParentDashboard = async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log("Dashboard solicitado para usuario:", userId);

    const dashboard = await parentDashboardService.getParentDashboard(userId);

    res.json(dashboard);
  } catch (error) {
    console.error("Error en panel de padres:", error);
    res.status(500).json({
      message: "Error al obtener el panel de padres",
    });
  }
};

module.exports = {
  getParentDashboard,
};
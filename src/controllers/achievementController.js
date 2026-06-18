const achievementService = require("../services/achievementService");

const getAchievements = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        message: "El userId es obligatorio",
      });
    }

    const achievements = await achievementService.getAchievementsByUser(userId);

    res.json(achievements);
  } catch (error) {
    console.error("Error al obtener logros:", error);

    res.status(500).json({
      message: "Error al obtener logros",
    });
  }
};

module.exports = {
  getAchievements,
};
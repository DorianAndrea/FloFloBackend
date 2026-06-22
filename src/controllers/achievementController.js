const achievementService = require("../services/achievementService");

const getAchievements = async (req, res) => {
  try {
    const userId = req.user.id;

    const achievements =
      await achievementService.getAchievementsByUser(userId);

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
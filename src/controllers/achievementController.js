const pool = require("../database/db");

const getAchievements = async (req, res) => {
  try {
    const userId = req.user.id;

    const progressResult = await pool.query(
      `
      SELECT
        points,
        level,
        completed_conversations,
        completed_places,
        completed_routines,
        completed_moods
      FROM "FloFlo".user_progress
      WHERE user_id = $1
      `,
      [userId],
    );

    const progress = progressResult.rows[0] || {
      points: 0,
      level: 1,
      completed_conversations: 0,
      completed_places: 0,
      completed_routines: 0,
      completed_moods: 0,
    };

    const result = await pool.query(
      `
      SELECT 
        a.id,
        a.name,
        a.description,
        a.icon,
        a.required_type,
        a.required_value,
        ua.unlocked_at
      FROM "FloFlo".achievement a
      LEFT JOIN "FloFlo".user_achievement ua
        ON a.id = ua.achievement_id
        AND ua.user_id = $1
      ORDER BY a.required_value ASC
      `,
      [userId],
    );

    const achievements = result.rows.map((achievement) => {
      let unlockedByProgress = false;

      if (achievement.required_type === "points") {
        unlockedByProgress =
          Number(progress.points) >= Number(achievement.required_value);
      }

      if (achievement.required_type === "level") {
        unlockedByProgress =
          Number(progress.level) >= Number(achievement.required_value);
      }

      if (achievement.required_type === "completed_conversations") {
        unlockedByProgress =
          Number(progress.completed_conversations) >=
          Number(achievement.required_value);
      }

      if (achievement.required_type === "completed_places") {
        unlockedByProgress =
          Number(progress.completed_places) >=
          Number(achievement.required_value);
      }

      if (achievement.required_type === "completed_routines") {
        unlockedByProgress =
          Number(progress.completed_routines) >=
          Number(achievement.required_value);
      }

      if (achievement.required_type === "completed_moods") {
        unlockedByProgress =
          Number(progress.completed_moods) >=
          Number(achievement.required_value);
      }

      return {
        ...achievement,
        unlocked: Boolean(achievement.unlocked_at || unlockedByProgress),
      };
    });

    res.json(achievements);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  getAchievements,
};

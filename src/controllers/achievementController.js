const pool = require("../database/db");

const getAchievements = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT 
        a.id,
        a.name,
        a.description,
        a.icon,
        a.required_type,
        a.required_value,
        ua.unlocked_at,
        CASE 
          WHEN ua.id IS NULL THEN false
          ELSE true
        END AS unlocked
      FROM "FloFlo".achievement a
      LEFT JOIN "FloFlo".user_achievement ua
        ON a.id = ua.achievement_id
        AND ua.user_id = $1
      ORDER BY a.required_value ASC
      `,
      [userId]
    );

    res.json(result.rows);
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
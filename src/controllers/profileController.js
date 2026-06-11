const pool = require("../database/db");

const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const userResult = await pool.query(
      `
      SELECT id, "firstName", "lastName", email, avatar
      FROM "FloFlo"."user"
      WHERE id = $1
      `,
      [userId]
    );

    const progressResult = await pool.query(
      `
      SELECT *
      FROM "FloFlo".user_progress
      WHERE user_id = $1
      `,
      [userId]
    );

    const achievementsResult = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM "FloFlo".user_achievement
      WHERE user_id = $1
      `,
      [userId]
    );

    res.json({
      user: userResult.rows[0],
      progress: progressResult.rows[0] || {
        points: 0,
        level: 1,
        completed_conversations: 0,
        completed_places: 0,
        completed_routines: 0,
        completed_moods: 0,
      },
      achievements: Number(achievementsResult.rows[0].total),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  getProfile,
};
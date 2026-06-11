const pool = require("../database/db");

const getUserProgress = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT *
      FROM "FloFlo".user_progress
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        user_id: userId,
        points: 0,
        level: 1,
        completed_conversations: 0,
        completed_places: 0,
        completed_routines: 0,
        completed_moods: 0,
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  getUserProgress,
};
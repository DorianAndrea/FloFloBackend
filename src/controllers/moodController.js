const pool = require("../database/db");
const {
  checkAndUnlockAchievements,
} = require("../services/achievementService");

const calculateLevel = (points) => {
  if (points >= 100) return 5;
  if (points >= 50) return 4;
  if (points >= 25) return 3;
  if (points >= 10) return 2;
  return 1;
};

const getMoods = async (req, res) => {
  try {
    const user_id = req.user.id;

    const result = await pool.query(
      `
      SELECT 
        m.id,
        m.user_id,
        m.mood_type_id,
        mt.mood_name,
        mt.icon,
        m.comment,
        m.created_at
      FROM "FloFlo".mood m
      INNER JOIN "FloFlo".mood_type mt 
        ON m.mood_type_id = mt.id
      WHERE m.user_id = $1
      ORDER BY m.created_at DESC
      `,
      [user_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error obteniendo emociones:", error);
    res.status(500).json({ message: error.message });
  }
};

const createMood = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { mood_type_id, comment } = req.body;

    if (!mood_type_id) {
      return res.status(400).json({
        message: "El tipo de emoción es obligatorio",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".mood (
        user_id,
        mood_type_id,
        comment,
        created_at
      )
      VALUES ($1, $2, $3, NOW())
      RETURNING *
      `,
      [user_id, mood_type_id, comment || null]
    );

    const currentProgress = await pool.query(
      `
      SELECT * 
      FROM "FloFlo".user_progress 
      WHERE user_id = $1
      `,
      [user_id]
    );

    let newPoints = 1;

    if (currentProgress.rows.length > 0) {
      newPoints = Number(currentProgress.rows[0].points) + 1;

      await pool.query(
        `
        UPDATE "FloFlo".user_progress
        SET 
          points = $1,
          level = $2,
          completed_moods = completed_moods + 1,
          updated_at = NOW()
        WHERE user_id = $3
        `,
        [newPoints, calculateLevel(newPoints), user_id]
      );
    } else {
      await pool.query(
        `
        INSERT INTO "FloFlo".user_progress (
          user_id,
          points,
          level,
          completed_conversations,
          completed_places,
          completed_routines,
          completed_moods,
          updated_at
        )
        VALUES ($1, $2, $3, 0, 0, 0, 1, NOW())
        `,
        [user_id, 1, 1]
      );
    }

    const unlockedAchievements = await checkAndUnlockAchievements(user_id);

    res.status(201).json({
      message: "Estado de ánimo guardado",
      mood: result.rows[0],
      unlockedAchievements,
    });
  } catch (error) {
    console.error("Error creando emoción:", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getMoods,
  createMood,
};
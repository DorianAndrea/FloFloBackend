const pool = require("../database/db");

const {
  checkAndUnlockAchievements,
} = require("../services/achievementService");

const getRoutines = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * 
      FROM "FloFlo"."routine" 
      ORDER BY start_time ASC;
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error obteniendo rutinas:", error.message);

    res.status(500).json({
      message: "Error obteniendo rutinas",
      error: error.message,
    });
  }
};

const createRoutine = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { name, description, start_time, end_time } = req.body;

    if (!name || !start_time || !end_time) {
      return res.status(400).json({
        message: "name, start_time y end_time son obligatorios",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".routine (
        user_id,
        name,
        description,
        start_time,
        end_time,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
      `,
      [user_id, name, description || null, start_time, end_time]
    );

    res.status(201).json({
      message: "Rutina creada correctamente",
      routine: result.rows[0],
    });
  } catch (error) {
    console.error("Error creando rutina:", error);
    res.status(500).json({
      message: error.message,
    });
  }
};

const deleteRoutine = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM "FloFlo".routine
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Rutina no encontrada",
      });
    }

    res.json({
      message: "Rutina eliminada correctamente",
      routine: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: error.message,
    });
  }
};

const updateRoutine = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, start_time, end_time, description } = req.body;

    if (!name || !start_time || !end_time) {
      return res.status(400).json({
        message: "name, start_time y end_time son obligatorios",
      });
    }

    if (end_time <= start_time) {
      return res.status(400).json({
        message: "La hora de término debe ser posterior a la hora de inicio",
      });
    }

    const result = await pool.query(
      `
      UPDATE "FloFlo".routine
      SET
        name = $1,
        start_time = $2,
        end_time = $3,
        description = $4,
        updated_at = NOW()
      WHERE id = $5
      RETURNING *
      `,
      [name, start_time, end_time, description, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Rutina no encontrada",
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

const calculateLevel = (points) => {
  if (points >= 100) return 5;
  if (points >= 50) return 4;
  if (points >= 25) return 3;
  if (points >= 10) return 2;
  return 1;
};

const completeRoutine = async (req, res) => {
  try {
    const user_id= req.user.id;
    const { id } = req.params;

    const existing = await pool.query(
      `
      SELECT *
      FROM "FloFlo".routine_progress
      WHERE user_id = $1
      AND routine_id = $2
      `,
      [user_id, id]
    );

    if (existing.rows.length > 0) {
      return res.json({
        message: "Rutina ya estaba completada",
        progress: existing.rows[0],
        unlockedAchievements: [],
      });
    }

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".routine_progress
      (
        user_id,
        routine_id,
        completed,
        points,
        completed_at
      )
      VALUES ($1,$2,true,1,NOW())
      RETURNING *
      `,
      [user_id, id]
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
          completed_routines = completed_routines + 1,
          updated_at = NOW()
        WHERE user_id = $3
        `,
        [newPoints, calculateLevel(newPoints), user_id]
      );
    } else {
      await pool.query(
        `
        INSERT INTO "FloFlo".user_progress
        (
          user_id,
          points,
          level,
          completed_conversations,
          completed_places,
          completed_routines,
          completed_moods,
          updated_at
        )
        VALUES ($1,$2,$3,0,0,1,0,NOW())
        `,
        [user_id, 1, 1]
      );
    }

    const unlockedAchievements = await checkAndUnlockAchievements(user_id);

    res.status(201).json({
      message: "Rutina completada",
      progress: result.rows[0],
      unlockedAchievements,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  getRoutines,
  createRoutine,
  deleteRoutine,
  updateRoutine,
  completeRoutine,
};
const pool = require("../database/db");
const {
  checkAndUnlockAchievements,
  unlockAchievement,
} = require("../services/achievementService");

const calculateLevel = (points) => {
  if (points >= 100) return 5;
  if (points >= 50) return 4;
  if (points >= 25) return 3;
  if (points >= 10) return 2;
  return 1;
};

const getPlaces = async (req, res) => {
  try {
    const user_id = req.user.id;

    const result = await pool.query(
      `
      SELECT *
      FROM "FloFlo".place
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [user_id],
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const getPlaceById = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    const result = await pool.query(
      `
      SELECT *
      FROM "FloFlo".place
      WHERE id = $1
      AND user_id = $2
      `,
      [id, user_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Lugar no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const createPlace = async (req, res) => {
  try {
    const user_id = req.user.id;

    const {
      name,
      address,
      description,
      activity,
      people_present,
      transport,
      estimated_duration,
      tips,
    } = req.body;

    const image = req.file ? req.file.path : null;

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".place
      (
        user_id,
        name,
        address,
        image,
        description,
        activity,
        people_present,
        transport,
        estimated_duration,
        tips,
        created_at
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
      RETURNING *
      `,
      [
        user_id,
        name,
        address,
        image,
        description,
        activity,
        people_present,
        transport,
        estimated_duration,
        tips,
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const updatePlace = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    const {
      name,
      address,
      description,
      activity,
      people_present,
      transport,
      estimated_duration,
      tips,
    } = req.body;

    const currentPlace = await pool.query(
      `
      SELECT image
      FROM "FloFlo".place
      WHERE id = $1
      AND user_id = $2
      `,
      [id, user_id],
    );

    if (currentPlace.rows.length === 0) {
      return res.status(404).json({
        message: "Lugar no encontrado",
      });
    }

    const currentImage = currentPlace.rows[0].image;
    const image = req.file ? req.file.path : null;

    const result = await pool.query(
      `
      UPDATE "FloFlo".place
      SET
        name = $1,
        address = $2,
        image = $3,
        description = $4,
        activity = $5,
        people_present = $6,
        transport = $7,
        estimated_duration = $8,
        tips = $9
      WHERE id = $10
      AND user_id = $11
      RETURNING *
      `,
      [
        name,
        address,
        image,
        description,
        activity,
        people_present,
        transport,
        estimated_duration,
        tips,
        id,
        user_id,
      ],
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};

const deletePlace = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    const result = await pool.query(
      `
      DELETE FROM "FloFlo".place
      WHERE id = $1
      AND user_id = $2
      RETURNING *
      `,
      [id, user_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Lugar no encontrado",
      });
    }

    res.json({
      message: "Lugar eliminado correctamente",
      place: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};
const completePlace = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { id } = req.params;

    const existing = await pool.query(
      `
      SELECT *
      FROM "FloFlo".place_progress
      WHERE user_id = $1
      AND place_id = $2
      `,
      [user_id, id],
    );

    if (existing.rows.length > 0) {
      return res.json({
        message: "Lugar ya estaba preparado",
        progress: existing.rows[0],
      });
    }

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".place_progress
      (
        user_id,
        place_id,
        completed,
        points,
        completed_at
      )
      VALUES ($1,$2,true,1,NOW())
      RETURNING *
      `,
      [user_id, id],
    );

    const currentProgress = await pool.query(
      `
      SELECT *
      FROM "FloFlo".user_progress
      WHERE user_id = $1
      `,
      [user_id],
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
          completed_places = completed_places + 1,
          updated_at = NOW()
        WHERE user_id = $3
        `,
        [newPoints, calculateLevel(newPoints), user_id],
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
        VALUES ($1,$2,$3,0,1,0,0,NOW())
        `,
        [user_id, 1, 1],
      );
    }
    const unlockedAchievements = await checkAndUnlockAchievements(user_id);
    res.status(201).json({
      message: "Lugar preparado",
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
  getPlaces,
  getPlaceById,
  createPlace,
  updatePlace,
  deletePlace,
  completePlace,
};

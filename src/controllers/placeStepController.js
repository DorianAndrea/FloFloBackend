const pool = require("../database/db");

const isValidId = (id) => {
  const numberId = Number(id);
  return Number.isInteger(numberId) && numberId > 0;
};

const validatePlaceOwnership = async (placeId, userId) => {
  const result = await pool.query(
    `
    SELECT id
    FROM "FloFlo".place
    WHERE id = $1
    AND user_id = $2
    LIMIT 1
    `,
    [placeId, userId]
  );

  return result.rows.length > 0;
};

const getPlaceSteps = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        message: "ID de lugar inválido",
      });
    }

    const placeId = Number(id);

    const ownsPlace = await validatePlaceOwnership(placeId, user_id);

    if (!ownsPlace) {
      return res.status(404).json({
        message: "Lugar no encontrado para este usuario",
      });
    }

    const result = await pool.query(
      `
      SELECT *
      FROM "FloFlo".place_step
      WHERE place_id = $1
      ORDER BY step_order
      `,
      [placeId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error obteniendo pasos del lugar:", error);
    res.status(500).json({
      message: error.message,
    });
  }
};

const createPlaceStep = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        message: "ID de lugar inválido",
      });
    }

    const placeId = Number(id);

    const ownsPlace = await validatePlaceOwnership(placeId, user_id);

    if (!ownsPlace) {
      return res.status(404).json({
        message: "Lugar no encontrado para este usuario",
      });
    }

    const { step_order, title, description } = req.body;

    if (!step_order || !title) {
      return res.status(400).json({
        message: "step_order y title son obligatorios",
      });
    }

    const image = req.file ? `/uploads/${req.file.filename}` : null;

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".place_step
      (
        place_id,
        step_order,
        title,
        description,
        image,
        created_at
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        NOW()
      )
      RETURNING *
      `,
      [placeId, step_order, title, description || null, image]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creando paso del lugar:", error);
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  getPlaceSteps,
  createPlaceStep,
};
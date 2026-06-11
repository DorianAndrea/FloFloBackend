const pool = require("../database/db");

const getPlaceSteps = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT *
      FROM "FloFlo".place_step
      WHERE place_id = $1
      ORDER BY step_order
      `,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};

const createPlaceStep = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      step_order,
      title,
      description,
    } = req.body;

    const image = req.file
      ? `/uploads/${req.file.filename}`
      : null;

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
      [
        id,
        step_order,
        title,
        description,
        image,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  getPlaceSteps,
  createPlaceStep,
};
const pool = require("../database/db");

const getLearningContexts = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        context_key,
        name,
        category,
        icon,
        color,
        description,
        sort_order
      FROM "FloFlo".learning_context
      WHERE is_active = true
        AND context_key <> 'unspecified'
      ORDER BY sort_order ASC, name ASC
      `,
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Error obteniendo contextos de aprendizaje:", error);

    return res.status(500).json({
      message: "No se pudieron cargar los contextos de aprendizaje",
    });
  }
};

module.exports = {
  getLearningContexts,
};
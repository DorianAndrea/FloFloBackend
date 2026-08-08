const pool = require("../database/db");

const getExperienceFavorites = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT
        ef.id AS favorite_id,
        ef.template_id,
        ef.created_at,

        et.name,
        et.description,
        et.icon,
        et.estimated_minutes,

        ec.id AS category_id,
        ec.name AS category_name,
        ec.icon AS category_icon,
        ec.color AS category_color

      FROM "FloFlo".experience_favorite ef

      JOIN "FloFlo".experience_template et
        ON et.id = ef.template_id

      LEFT JOIN "FloFlo".experience_category ec
        ON ec.id = et.category_id

      WHERE ef.user_id = $1
        AND et.is_active = TRUE

      ORDER BY ef.created_at DESC
      `,
      [userId],
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Error obteniendo favoritas:", error);

    return res.status(500).json({
      message: "Error obteniendo experiencias favoritas",
    });
  }
};

const addExperienceFavorite = async (req, res) => {
  try {
    const userId = req.user.id;
    const templateId = Number(req.params.templateId);

    if (!Number.isInteger(templateId) || templateId <= 0) {
      return res.status(400).json({
        message: "Experiencia inválida",
      });
    }

    const templateResult = await pool.query(
      `
      SELECT id
      FROM "FloFlo".experience_template
      WHERE id = $1
        AND is_active = TRUE
      `,
      [templateId],
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({
        message: "Experiencia no encontrada",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".experience_favorite
        (user_id, template_id)

      VALUES ($1, $2)

      ON CONFLICT (user_id, template_id)
      DO NOTHING

      RETURNING
        id,
        user_id,
        template_id,
        created_at
      `,
      [userId, templateId],
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        message: "La experiencia ya estaba en favoritas",
        template_id: templateId,
        is_favorite: true,
      });
    }

    return res.status(201).json({
      message: "Experiencia agregada a favoritas",
      favorite: result.rows[0],
      is_favorite: true,
    });
  } catch (error) {
    console.error("Error agregando favorita:", error);

    return res.status(500).json({
      message: "Error agregando experiencia a favoritas",
    });
  }
};

const removeExperienceFavorite = async (req, res) => {
  try {
    const userId = req.user.id;
    const templateId = Number(req.params.templateId);

    if (!Number.isInteger(templateId) || templateId <= 0) {
      return res.status(400).json({
        message: "Experiencia inválida",
      });
    }

    await pool.query(
      `
      DELETE FROM "FloFlo".experience_favorite

      WHERE user_id = $1
        AND template_id = $2
      `,
      [userId, templateId],
    );

    return res.json({
      message: "Experiencia eliminada de favoritas",
      template_id: templateId,
      is_favorite: false,
    });
  } catch (error) {
    console.error("Error eliminando favorita:", error);

    return res.status(500).json({
      message: "Error eliminando experiencia de favoritas",
    });
  }
};

module.exports = {
  getExperienceFavorites,
  addExperienceFavorite,
  removeExperienceFavorite,
};
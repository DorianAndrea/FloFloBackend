const pool = require("../database/db");

const getExperienceLibrary = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT
        ec.id AS category_id,
        ec.name AS category_name,
        ec.icon AS category_icon,
        ec.color AS category_color,
        ec.sort_order AS category_sort_order,

        et.id AS template_id,
        et.name AS template_name,
        et.description AS template_description,
        et.icon AS template_icon,
        et.experience_type,
        et.learning_context_id,
        et.default_start_time,
        et.default_end_time,
        et.age_min,
        et.age_max,
        et.difficulty,
        et.estimated_minutes,

        lc.context_key AS learning_context_key,
        lc.name AS learning_context_name,
        lc.icon AS learning_context_icon,
        lc.color AS learning_context_color,

        CASE
          WHEN ef.id IS NULL THEN FALSE
          ELSE TRUE
        END AS is_favorite,

        COALESCE(
          steps_data.steps,
          '[]'::jsonb
        ) AS steps,

        COALESCE(
          steps_data.step_count,
          0
        ) AS step_count

      FROM "FloFlo".experience_category ec

      JOIN "FloFlo".experience_template et
        ON et.category_id = ec.id
        AND et.is_active = TRUE

      LEFT JOIN "FloFlo".learning_context lc
        ON lc.id = et.learning_context_id

      LEFT JOIN "FloFlo".experience_favorite ef
        ON ef.template_id = et.id
        AND ef.user_id = $1

      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS step_count,

          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', ets.id,
                'template_id', ets.template_id,
                'position', ets.position,
                'title', ets.title,
                'description', ets.description,
                'icon', ets.icon,
                'estimated_minutes', ets.estimated_minutes,
                'is_optional', ets.is_optional
              )
              ORDER BY ets.position ASC
            ),
            '[]'::jsonb
          ) AS steps

        FROM "FloFlo".experience_template_step ets

        WHERE ets.template_id = et.id
      ) steps_data ON TRUE

      WHERE ec.is_active = TRUE

      ORDER BY
        ec.sort_order ASC,
        ec.name ASC,
        et.name ASC
      `,
      [userId],
    );

    const categoryMap = new Map();

    for (const row of result.rows) {
      const categoryId = String(row.category_id);

      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          id: row.category_id,
          name: row.category_name,
          icon: row.category_icon,
          color: row.category_color,
          sort_order: row.category_sort_order,
          templates: [],
        });
      }

      categoryMap.get(categoryId).templates.push({
        id: row.template_id,
        name: row.template_name,
        description: row.template_description,
        icon: row.template_icon,
        experience_type: row.experience_type,

        default_start_time: row.default_start_time,
        default_end_time: row.default_end_time,

        age_min: row.age_min,
        age_max: row.age_max,
        difficulty: row.difficulty,
        estimated_minutes: row.estimated_minutes,

        learning_context_id: row.learning_context_id,
        learning_context_key: row.learning_context_key,
        learning_context_name: row.learning_context_name,
        learning_context_icon: row.learning_context_icon,
        learning_context_color: row.learning_context_color,

        is_favorite: Boolean(row.is_favorite),

        step_count: row.step_count,
        steps: row.steps,
      });
    }

    return res.json(Array.from(categoryMap.values()));
  } catch (error) {
    console.error("Error obteniendo biblioteca de experiencias:", error);

    return res.status(500).json({
      message: "No se pudo cargar la biblioteca de experiencias",
    });
  }
};

module.exports = {
  getExperienceLibrary,
};
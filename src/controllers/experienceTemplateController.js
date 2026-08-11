const pool = require("../database/db");
const { getFloCard } = require("../cognitive-engine/services/floCardService");

const getExperienceCategories = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        name,
        icon,
        color,
        sort_order
      FROM "FloFlo".experience_category
      WHERE is_active = TRUE
      ORDER BY sort_order ASC;
    `);

    return res.json(result.rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Error obteniendo categorías",
    });
  }
};

const getExperienceTemplates = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
    et.id,
    et.name,
    et.description,
    et.icon,
    et.default_start_time,
    et.default_end_time,
    et.estimated_minutes,

    ec.id AS category_id,
    ec.name AS category_name,
    ec.icon AS category_icon,
    ec.color AS category_color,

    lc.id AS learning_context_id,
    lc.name AS learning_context_name,

    COALESCE(
        json_agg(
            json_build_object(
                'id', ets.id,
                'position', ets.position,
                'title', ets.title,
                'estimated_minutes', ets.estimated_minutes,
                'is_required', ets.is_required
            )
            ORDER BY ets.position
        ) FILTER (WHERE ets.id IS NOT NULL),
        '[]'
    ) AS steps

        FROM experience_template et

        LEFT JOIN experience_category ec
        ON ec.id = et.category_id

        LEFT JOIN learning_context lc
        ON lc.id = et.learning_context_id

        LEFT JOIN experience_template_step ets
        ON ets.template_id = et.id

        WHERE et.id=$1
        AND et.is_active=true

        GROUP BY
        et.id,
        ec.id,
        lc.id;

    `);

    return res.json(result.rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Error obteniendo experiencias",
    });
  }
};

const getExperienceTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT
        et.id,
        et.name,
        et.description,
        et.icon,
        et.experience_type,
        et.default_start_time,
        et.default_end_time,
        et.estimated_minutes,
        et.age_min,
        et.age_max,
        et.difficulty,

        ec.id AS category_id,
        ec.name AS category_name,
        ec.icon AS category_icon,
        ec.color AS category_color,

        lc.id AS learning_context_id,
        lc.context_key AS learning_context_key,
        lc.name AS learning_context_name,
        lc.icon AS learning_context_icon,
        lc.color AS learning_context_color,

        CASE
          WHEN ef.id IS NULL THEN FALSE
          ELSE TRUE
        END AS is_favorite,

        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', ets.id,
              'template_id', ets.template_id,
              'position', ets.position,
              'title', ets.title,
              'description', ets.description,
              'icon', ets.icon,
              'flocard_code', ets.flocard_code,
              'estimated_minutes', ets.estimated_minutes,
              'is_optional', ets.is_optional,
              'is_required', ets.is_required
            )
            ORDER BY ets.position ASC
          ) FILTER (WHERE ets.id IS NOT NULL),
          '[]'::jsonb
        ) AS steps

      FROM "FloFlo".experience_template et

      LEFT JOIN "FloFlo".experience_category ec
        ON ec.id = et.category_id

      LEFT JOIN "FloFlo".learning_context lc
        ON lc.id = et.learning_context_id

      LEFT JOIN "FloFlo".experience_favorite ef
        ON ef.template_id = et.id
        AND ef.user_id = $2

      LEFT JOIN "FloFlo".experience_template_step ets
        ON ets.template_id = et.id

      WHERE et.id = $1
        AND et.is_active = TRUE

      GROUP BY
        et.id,
        ec.id,
        lc.id,
        ef.id
      `,
      [id, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Experiencia no encontrada",
      });
    }

    const experience = result.rows[0];

    const enrichedSteps = Array.isArray(experience.steps)
      ? experience.steps.map((step) => {
          const floCard = step.flocard_code
            ? getFloCard(step.flocard_code)
            : null;

          return {
            ...step,

            flocard: floCard
              ? {
                  code: floCard.code,
                  name: floCard.name,
                  description: floCard.description,
                  icon: floCard.icon,
                  interaction_type: floCard.interaction_type,
                  action: floCard.action,
                  concepts: floCard.concepts,
                  states: floCard.states,
                  supports: floCard.supports,
                  event_mapping: floCard.event_mapping,
                }
              : null,
          };
        })
      : [];

    return res.json({
      ...experience,
      steps: enrichedSteps,
    });
  } catch (error) {
    console.error("Error obteniendo experiencia:", error);

    return res.status(500).json({
      message: "Error obteniendo experiencia",
    });
  }
};

module.exports = {
  getExperienceCategories,
  getExperienceTemplates,
  getExperienceTemplate,
};

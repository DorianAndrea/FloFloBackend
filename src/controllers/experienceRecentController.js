const pool = require("../database/db");

const validatePositiveInteger = (value) => {
  const numberValue = Number(value);

  return Number.isInteger(numberValue) && numberValue > 0
    ? numberValue
    : null;
};

const resolveOwnerId = (req) => {
  const childId = validatePositiveInteger(req.params.childId);

  if (childId) {
    return childId;
  }

  return validatePositiveInteger(req.user?.id);
};

const registerExperienceRecent = async (req, res) => {
  try {
    const actorUserId = validatePositiveInteger(req.user?.id);
    const ownerUserId = resolveOwnerId(req);
    const templateId = validatePositiveInteger(req.params.templateId);

    if (!actorUserId || !ownerUserId) {
      return res.status(401).json({
        message: "Usuario no válido",
      });
    }

    if (!templateId) {
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
      INSERT INTO "FloFlo".experience_recent (
        owner_user_id,
        actor_user_id,
        template_id,
        last_opened_at,
        open_count,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        NOW(),
        1,
        NOW(),
        NOW()
      )

      ON CONFLICT (owner_user_id, template_id)

      DO UPDATE SET
        actor_user_id = EXCLUDED.actor_user_id,
        last_opened_at = NOW(),
        open_count =
          "FloFlo".experience_recent.open_count + 1,
        updated_at = NOW()

      RETURNING *
      `,
      [ownerUserId, actorUserId, templateId],
    );

    return res.json({
      message: "Experiencia reciente registrada",
      recent: result.rows[0],
    });
  } catch (error) {
    console.error(
      "Error registrando experiencia reciente:",
      error,
    );

    return res.status(500).json({
      message: "No se pudo registrar la experiencia reciente",
    });
  }
};

const getExperienceRecents = async (req, res) => {
  try {
    const ownerUserId = resolveOwnerId(req);

    if (!ownerUserId) {
      return res.status(400).json({
        message: "Usuario objetivo inválido",
      });
    }

    const result = await pool.query(
      `
      SELECT
        er.template_id,
        er.last_opened_at,
        er.open_count,

        et.name,
        et.description,
        et.icon,
        et.estimated_minutes,

        ec.id AS category_id,
        ec.name AS category_name,
        ec.icon AS category_icon,
        ec.color AS category_color,

        lc.id AS learning_context_id,
        lc.name AS learning_context_name,
        lc.icon AS learning_context_icon,

        COALESCE(
          step_data.step_count,
          0
        ) AS step_count

      FROM "FloFlo".experience_recent er

      JOIN "FloFlo".experience_template et
        ON et.id = er.template_id
        AND et.is_active = TRUE

      LEFT JOIN "FloFlo".experience_category ec
        ON ec.id = et.category_id

      LEFT JOIN "FloFlo".learning_context lc
        ON lc.id = et.learning_context_id

      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS step_count
        FROM "FloFlo".experience_template_step ets
        WHERE ets.template_id = et.id
      ) step_data ON TRUE

      WHERE er.owner_user_id = $1

      ORDER BY er.last_opened_at DESC

      LIMIT 6
      `,
      [ownerUserId],
    );

    return res.json(result.rows);
  } catch (error) {
    console.error(
      "Error obteniendo experiencias recientes:",
      error,
    );

    return res.status(500).json({
      message: "No se pudieron obtener las experiencias recientes",
    });
  }
};

module.exports = {
  registerExperienceRecent,
  getExperienceRecents,
};
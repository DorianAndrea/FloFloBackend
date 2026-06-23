const pool = require("../database/db");

const isValidId = (id) => {
  const numberId = Number(id);
  return Number.isInteger(numberId) && numberId > 0;
};

const sanitizeProfilePayload = (body) => {
  return {
    noise_sensitivity: body.noise_sensitivity || null,
    light_sensitivity: body.light_sensitivity || null,
    texture_sensitivity: body.texture_sensitivity || null,
    crowd_sensitivity: body.crowd_sensitivity || null,
    calming_items: body.calming_items || null,
    calming_activities: body.calming_activities || null,
    stress_signals: body.stress_signals || null,
    support_strategies: body.support_strategies || null,
    notes: body.notes || null,
  };
};

const checkParentChildRelation = async (parentId, childId) => {
  const result = await pool.query(
    `
    SELECT id
    FROM "FloFlo".parent_child
    WHERE parent_id = $1
    AND child_id = $2
    LIMIT 1
    `,
    [parentId, childId],
  );

  return result.rows.length > 0;
};

const getProfileByUserId = async (userId) => {
  const result = await pool.query(
    `
    SELECT *
    FROM "FloFlo".sensory_profile
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] || null;
};

const getMySensoryProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const profile = await getProfileByUserId(userId);

    res.json(profile);
  } catch (error) {
    console.error("Error obteniendo perfil sensorial:", error);
    res.status(500).json({
      message: "Error obteniendo perfil sensorial",
    });
  }
};

const upsertMySensoryProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const data = sanitizeProfilePayload(req.body);

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".sensory_profile (
        user_id,
        noise_sensitivity,
        light_sensitivity,
        texture_sensitivity,
        crowd_sensitivity,
        calming_items,
        calming_activities,
        stress_signals,
        support_strategies,
        notes,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        noise_sensitivity = EXCLUDED.noise_sensitivity,
        light_sensitivity = EXCLUDED.light_sensitivity,
        texture_sensitivity = EXCLUDED.texture_sensitivity,
        crowd_sensitivity = EXCLUDED.crowd_sensitivity,
        calming_items = EXCLUDED.calming_items,
        calming_activities = EXCLUDED.calming_activities,
        stress_signals = EXCLUDED.stress_signals,
        support_strategies = EXCLUDED.support_strategies,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *
      `,
      [
        userId,
        data.noise_sensitivity,
        data.light_sensitivity,
        data.texture_sensitivity,
        data.crowd_sensitivity,
        data.calming_items,
        data.calming_activities,
        data.stress_signals,
        data.support_strategies,
        data.notes,
      ],
    );

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error guardando perfil sensorial:", error);
    res.status(500).json({
      message: "Error guardando perfil sensorial",
    });
  }
};

const getChildSensoryProfile = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { childId } = req.params;

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo un padre o cuidador puede ver perfiles de hijos",
      });
    }

    if (!isValidId(childId)) {
      return res.status(400).json({
        message: "ID de niño inválido",
      });
    }

    const hasRelation = await checkParentChildRelation(parentId, Number(childId));

    if (!hasRelation) {
      return res.status(403).json({
        message: "No tienes permiso para ver este perfil sensorial",
      });
    }

    const profile = await getProfileByUserId(Number(childId));

    res.json(profile);
  } catch (error) {
    console.error("Error obteniendo perfil sensorial del niño:", error);
    res.status(500).json({
      message: "Error obteniendo perfil sensorial del niño",
    });
  }
};

module.exports = {
  getMySensoryProfile,
  upsertMySensoryProfile,
  getChildSensoryProfile,
};
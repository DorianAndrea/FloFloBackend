const pool = require("../database/db");

const isValidId = (id) => {
  const numberId = Number(id);
  return Number.isInteger(numberId) && numberId > 0;
};

const cleanText = (value) => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const sanitizeProfilePayload = (body) => {
  return {
    noise_sensitivity: cleanText(body.noise_sensitivity),
    light_sensitivity: cleanText(body.light_sensitivity),
    texture_sensitivity: cleanText(body.texture_sensitivity),
    crowd_sensitivity: cleanText(body.crowd_sensitivity),
    calming_items: cleanText(body.calming_items),
    calming_activities: cleanText(body.calming_activities),
    stress_signals: cleanText(body.stress_signals),
    support_strategies: cleanText(body.support_strategies),
    notes: cleanText(body.notes),
  };
};

const checkParentChildRelation = async (parentId, childId) => {
  const result = await pool.query(
    `
    SELECT pc.child_id
    FROM "FloFlo".parent_child pc
    INNER JOIN "FloFlo"."user" u
      ON u.id = pc.child_id
    WHERE pc.parent_id = $1
      AND pc.child_id = $2
      AND u.role = 'child'
    LIMIT 1
    `,
    [parentId, childId],
  );

  return result.rows.length > 0;
};

const assertChildRole = (req) => {
  if (req.user.role !== "child") {
    const error = new Error(
      "Esta ruta es solo para cuentas de niño/a. Los cuidadores deben usar /children/:childId",
    );

    error.statusCode = 403;
    throw error;
  }
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

const saveSensoryProfileHistory = async (client, profile, createdBy) => {
  if (!profile) return;

  await client.query(
    `
    INSERT INTO "FloFlo".sensory_profile_history (
      user_id,
      created_by,
      noise_sensitivity,
      light_sensitivity,
      texture_sensitivity,
      crowd_sensitivity,
      calming_items,
      calming_activities,
      stress_signals,
      support_strategies,
      notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      profile.user_id,
      createdBy,
      profile.noise_sensitivity,
      profile.light_sensitivity,
      profile.texture_sensitivity,
      profile.crowd_sensitivity,
      profile.calming_items,
      profile.calming_activities,
      profile.stress_signals,
      profile.support_strategies,
      profile.notes,
    ],
  );
};

const getSensoryProfileHistoryByUserId = async (userId) => {
  const result = await pool.query(
    `
    SELECT
      id,
      user_id,
      created_by,
      noise_sensitivity,
      light_sensitivity,
      texture_sensitivity,
      crowd_sensitivity,
      calming_items,
      calming_activities,
      stress_signals,
      support_strategies,
      notes,
      created_at
    FROM "FloFlo".sensory_profile_history
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
    [userId],
  );

  return result.rows;
};

const getMySensoryProfile = async (req, res) => {
  try {
    assertChildRole(req);

    const userId = req.user.id;

    const profile = await getProfileByUserId(userId);

    res.json(profile);
  } catch (error) {
    console.error("Error obteniendo perfil sensorial:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error guardando perfil sensorial",
    });
  }
};

const upsertMySensoryProfile = async (req, res) => {
  const client = await pool.connect();

  try {
    assertChildRole(req);

    const userId = req.user.id;
    const data = sanitizeProfilePayload(req.body);

    await client.query("BEGIN");

    const result = await client.query(
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

    const profile = result.rows[0];

    await saveSensoryProfileHistory(client, profile, userId);

    await client.query("COMMIT");

    res.status(200).json(profile);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error guardando perfil sensorial:", error);

    res.status(500).json({
      message: "Error guardando perfil sensorial",
    });
  } finally {
    client.release();
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

    const assertChildRole = (req) => {
      if (req.user.role !== "child") {
        const error = new Error(
          "Esta ruta es solo para cuentas de niño/a. Los cuidadores deben usar /children/:childId",
        );
        error.statusCode = 403;
        throw error;
      }
    };

    if (!isValidId(childId)) {
      return res.status(400).json({
        message: "ID de niño inválido",
      });
    }

    const childIdNumber = Number(childId);

    const hasRelation = await checkParentChildRelation(parentId, childIdNumber);

    if (!hasRelation) {
      return res.status(403).json({
        message: "No tienes permiso para ver este perfil sensorial",
      });
    }

    const profile = await getProfileByUserId(childIdNumber);

    res.json(profile);
  } catch (error) {
    console.error("Error obteniendo perfil sensorial del niño:", error);

    res.status(500).json({
      message: "Error obteniendo perfil sensorial del niño",
    });
  }
};

const upsertChildSensoryProfile = async (req, res) => {
  const client = await pool.connect();

  try {
    const parentId = Number(req.user.id);
    const { childId } = req.params;

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo un padre o cuidador puede editar perfiles de hijos",
      });
    }

    if (!isValidId(childId)) {
      return res.status(400).json({
        message: "ID de niño inválido",
      });
    }

    const childIdNumber = Number(childId);

    const hasRelation = await checkParentChildRelation(parentId, childIdNumber);

    if (!hasRelation) {
      return res.status(403).json({
        message: "No tienes permiso para editar este perfil sensorial",
      });
    }

    const data = sanitizeProfilePayload(req.body);

    await client.query("BEGIN");

    const result = await client.query(
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
        childIdNumber,
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

    const profile = result.rows[0];

    await saveSensoryProfileHistory(client, profile, parentId);

    await client.query("COMMIT");

    res.status(200).json(profile);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error guardando perfil sensorial del niño:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error guardando perfil sensorial del niño",
    });
  } finally {
    client.release();
  }
};

const getMySensoryProfileHistory = async (req, res) => {
  try {
    assertChildRole(req);

    const userId = req.user.id;

    const history = await getSensoryProfileHistoryByUserId(userId);

    res.json(history);
  } catch (error) {
    console.error("Error obteniendo historial sensorial propio:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo historial sensorial",
    });
  }
};

const getChildSensoryProfileHistory = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { childId } = req.params;

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo un padre o cuidador puede ver historial de hijos",
      });
    }

    if (!isValidId(childId)) {
      return res.status(400).json({
        message: "ID de niño inválido",
      });
    }

    const childIdNumber = Number(childId);

    const hasRelation = await checkParentChildRelation(parentId, childIdNumber);

    if (!hasRelation) {
      return res.status(403).json({
        message: "No tienes permiso para ver este historial sensorial",
      });
    }

    const history = await getSensoryProfileHistoryByUserId(childIdNumber);

    res.json(history);
  } catch (error) {
    console.error("Error obteniendo historial sensorial del niño:", error);

    res.status(500).json({
      message: "Error obteniendo historial sensorial del niño",
    });
  }
};

module.exports = {
  getMySensoryProfile,
  upsertMySensoryProfile,
  getChildSensoryProfile,
  upsertChildSensoryProfile,
  getMySensoryProfileHistory,
  getChildSensoryProfileHistory,
};

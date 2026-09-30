const pool = require("../database/db");

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const validatePositiveInteger = (value, label) => {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw createHttpError(`${label} inválido`, 400);
  }

  return numberValue;
};

const cleanText = (value) => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
};

const sanitizeProfilePayload = (body) => ({
  noise_sensitivity: cleanText(body.noise_sensitivity),
  light_sensitivity: cleanText(body.light_sensitivity),
  texture_sensitivity: cleanText(body.texture_sensitivity),
  crowd_sensitivity: cleanText(body.crowd_sensitivity),

  touch_sensitivity: cleanText(body.touch_sensitivity),
  smell_sensitivity: cleanText(body.smell_sensitivity),
  food_sensitivity: cleanText(body.food_sensitivity),
  unexpected_changes: cleanText(body.unexpected_changes),
  waiting_sensitivity: cleanText(body.waiting_sensitivity),

  calming_items: cleanText(body.calming_items),
  calming_activities: cleanText(body.calming_activities),
  stress_signals: cleanText(body.stress_signals),
  support_strategies: cleanText(body.support_strategies),
  notes: cleanText(body.notes),
});

/*
 * Obtiene la relación activa entre una cuenta adulta y el niño/a.
 *
 * Todos los perfiles asociados pueden ver y editar el perfil sensorial.
 * En este módulo no se exige can_manage_team.
 */
const getAdultChildAccess = async (adultId, childId, client = pool) => {
  const cleanAdultId = validatePositiveInteger(adultId, "Adulto");

  const cleanChildId = validatePositiveInteger(childId, "Niño/a");

  const result = await client.query(
    `
    SELECT
      pc.child_id,
      pc.relationship_key,
      pc.access_profile,
      pc.can_manage_team,
      pc.status

    FROM "FloFlo".parent_child pc

    INNER JOIN "FloFlo".child_profile child
      ON child.id = pc.child_id

    WHERE pc.parent_id = $1
      AND pc.child_id = $2
      AND pc.status = 'active'
      AND child.status = 'active'

    LIMIT 1
    `,
    [cleanAdultId, cleanChildId],
  );

  if (result.rows.length === 0) {
    throw createHttpError(
      "No tienes permiso para acceder al perfil sensorial de este niño/a",
      403,
    );
  }

  return result.rows[0];
};

const assertCanEditSensoryProfile = (accessProfile, relationshipKey) => {
  const allowedAccessProfiles = [
    "caregiver",
    "therapist",
    "teacher",
    "professional",
  ];

  const allowedRelationshipKeys = ["primary_caregiver", "caregiver"];

  const canEdit =
    allowedAccessProfiles.includes(accessProfile) ||
    allowedRelationshipKeys.includes(relationshipKey);

  if (!canEdit) {
    throw createHttpError(
      "No tienes permiso para editar el perfil sensorial de este niño/a",
      403,
    );
  }
};

/*
 * Determina:
 *
 * ownerId: niño/a al que pertenece el perfil sensorial.
 * actorId: usuario que está realizando la acción.
 * accessProfile: categoría general de acceso.
 * relationshipKey: perfil específico del integrante.
 */
const resolveSensoryProfileAccess = async (req, client = pool) => {
  const loggedUserId = validatePositiveInteger(req.user.id, "Usuario");

  const childIdParam = req.params.childId;

  /*
   * Ruta utilizada por el propio niño/a.
   */
  if (!childIdParam) {
    if (req.user.role !== "child") {
      throw createHttpError(
        "Esta ruta es solo para cuentas de niño/a. Las cuentas adultas deben usar /children/:childId",
        403,
      );
    }

    return {
      ownerId: loggedUserId,
      actorId: loggedUserId,
      isAdultManagingChild: false,
      accessProfile: "child",
      relationshipKey: "child",
      canManageTeam: false,
    };
  }

  /*
   * Ruta utilizada por una cuenta adulta asociada.
   */
  const childId = validatePositiveInteger(childIdParam, "Niño/a");

  if (req.user.role !== "parent") {
    throw createHttpError(
      "Solo una cuenta adulta asociada puede utilizar esta ruta",
      403,
    );
  }

  const access = await getAdultChildAccess(loggedUserId, childId, client);

  return {
    ownerId: childId,
    actorId: loggedUserId,
    isAdultManagingChild: true,
    accessProfile: access.access_profile,
    relationshipKey: access.relationship_key,
    canManageTeam: Boolean(access.can_manage_team),
  };
};

/*
 * Obtiene el perfil sensorial actual y los datos de autoría.
 */
const getProfileByUserId = async (userId, client = pool) => {
  const result = await client.query(
    `
    SELECT
      sp.*,

      creator."firstName" AS creator_first_name,
      creator."lastName" AS creator_last_name,
      creator.avatar AS creator_avatar,

      updater."firstName" AS updater_first_name,
      updater."lastName" AS updater_last_name,
      updater.avatar AS updater_avatar

    FROM "FloFlo".sensory_profile sp

    LEFT JOIN "FloFlo"."user" creator
      ON creator.id = sp.created_by

    LEFT JOIN "FloFlo"."user" updater
      ON updater.id = sp.updated_by

    WHERE sp.user_id = $1

    LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] || null;
};

/*
 * Guarda una versión completa dentro del historial.
 *
 * created_by representa a quien realizó ese guardado.
 */
const saveSensoryProfileHistory = async (
  client,
  profile,
  actorId,
  accessProfile,
  relationshipKey,
) => {
  if (!profile) return;

  await client.query(
    `
    INSERT INTO "FloFlo".sensory_profile_history
    (
      user_id,
      created_by,
      creator_access_profile,
      creator_relationship_key,

      noise_sensitivity,
      light_sensitivity,
      texture_sensitivity,
      crowd_sensitivity,

      touch_sensitivity,
      smell_sensitivity,
      food_sensitivity,
      unexpected_changes,
      waiting_sensitivity,

      calming_items,
      calming_activities,
      stress_signals,
      support_strategies,
      notes,

      created_at
    )
    VALUES
    (
      $1,
      $2,
      $3,
      $4,

      $5,
      $6,
      $7,
      $8,

      $9,
      $10,
      $11,
      $12,
      $13,

      $14,
      $15,
      $16,
      $17,
      $18,

      NOW()
    )
    `,
    [
      profile.user_id,
      actorId,
      accessProfile,
      relationshipKey,

      profile.noise_sensitivity,
      profile.light_sensitivity,
      profile.texture_sensitivity,
      profile.crowd_sensitivity,

      profile.touch_sensitivity,
      profile.smell_sensitivity,
      profile.food_sensitivity,
      profile.unexpected_changes,
      profile.waiting_sensitivity,

      profile.calming_items,
      profile.calming_activities,
      profile.stress_signals,
      profile.support_strategies,
      profile.notes,
    ],
  );
};

/*
 * Obtiene el historial completo y el nombre de quien guardó cada versión.
 */
const getSensoryProfileHistoryByUserId = async (userId, client = pool) => {
  const result = await client.query(
    `
    SELECT
      sph.id,
      sph.user_id,
      sph.created_by,
      sph.creator_access_profile,
      sph.creator_relationship_key,

      sph.noise_sensitivity,
      sph.light_sensitivity,
      sph.texture_sensitivity,
      sph.crowd_sensitivity,

      sph.touch_sensitivity,
      sph.smell_sensitivity,
      sph.food_sensitivity,
      sph.unexpected_changes,
      sph.waiting_sensitivity,

      sph.calming_items,
      sph.calming_activities,
      sph.stress_signals,
      sph.support_strategies,
      sph.notes,
      sph.created_at,

      creator."firstName" AS creator_first_name,
      creator."lastName" AS creator_last_name,
      creator.avatar AS creator_avatar

    FROM "FloFlo".sensory_profile_history sph

    LEFT JOIN "FloFlo"."user" creator
      ON creator.id = sph.created_by

    WHERE sph.user_id = $1

    ORDER BY sph.created_at DESC
    `,
    [userId],
  );

  return result.rows;
};

/*
 * Crea o actualiza el perfil sensorial.
 *
 * Si el perfil ya existía:
 * - conserva el creador original;
 * - registra quién realizó la última actualización.
 *
 * Si es un perfil antiguo sin autor:
 * - completa los campos del creador con la primera persona que lo actualice.
 */
const saveOrUpdateSensoryProfile = async (
  client,
  targetUserId,
  data,
  actorId,
  accessProfile,
  relationshipKey,
) => {
  const result = await client.query(
    `
    INSERT INTO "FloFlo".sensory_profile AS sp
    (
      user_id,

      noise_sensitivity,
      light_sensitivity,
      texture_sensitivity,
      crowd_sensitivity,

      touch_sensitivity,
      smell_sensitivity,
      food_sensitivity,
      unexpected_changes,
      waiting_sensitivity,

      calming_items,
      calming_activities,
      stress_signals,
      support_strategies,
      notes,

      created_by,
      creator_access_profile,
      creator_relationship_key,

      updated_by,
      updater_access_profile,
      updater_relationship_key,

      created_at,
      updated_at
    )
    VALUES
    (
      $1,

      $2,
      $3,
      $4,
      $5,

      $6,
      $7,
      $8,
      $9,
      $10,

      $11,
      $12,
      $13,
      $14,
      $15,

      $16,
      $17,
      $18,

      $16,
      $17,
      $18,

      NOW(),
      NOW()
    )

    ON CONFLICT (user_id)
    DO UPDATE SET
      noise_sensitivity = EXCLUDED.noise_sensitivity,
      light_sensitivity = EXCLUDED.light_sensitivity,
      texture_sensitivity = EXCLUDED.texture_sensitivity,
      crowd_sensitivity = EXCLUDED.crowd_sensitivity,

      touch_sensitivity = EXCLUDED.touch_sensitivity,
      smell_sensitivity = EXCLUDED.smell_sensitivity,
      food_sensitivity = EXCLUDED.food_sensitivity,
      unexpected_changes = EXCLUDED.unexpected_changes,
      waiting_sensitivity = EXCLUDED.waiting_sensitivity,

      calming_items = EXCLUDED.calming_items,
      calming_activities = EXCLUDED.calming_activities,
      stress_signals = EXCLUDED.stress_signals,
      support_strategies = EXCLUDED.support_strategies,
      notes = EXCLUDED.notes,

      created_by = COALESCE(
        sp.created_by,
        EXCLUDED.created_by
      ),

      creator_access_profile = COALESCE(
        sp.creator_access_profile,
        EXCLUDED.creator_access_profile
      ),

      creator_relationship_key = COALESCE(
        sp.creator_relationship_key,
        EXCLUDED.creator_relationship_key
      ),

      updated_by = EXCLUDED.updated_by,
      updater_access_profile =
        EXCLUDED.updater_access_profile,
      updater_relationship_key =
        EXCLUDED.updater_relationship_key,

      updated_at = NOW()

    RETURNING *
    `,
    [
      targetUserId,

      data.noise_sensitivity,
      data.light_sensitivity,
      data.texture_sensitivity,
      data.crowd_sensitivity,

      data.touch_sensitivity,
      data.smell_sensitivity,
      data.food_sensitivity,
      data.unexpected_changes,
      data.waiting_sensitivity,

      data.calming_items,
      data.calming_activities,
      data.stress_signals,
      data.support_strategies,
      data.notes,

      actorId,
      accessProfile,
      relationshipKey,
    ],
  );

  return result.rows[0];
};

/*
 * Obtener el perfil sensorial propio.
 */
const getMySensoryProfile = async (req, res) => {
  try {
    const { ownerId } = await resolveSensoryProfileAccess(req);

    const profile = await getProfileByUserId(ownerId);

    return res.json(profile);
  } catch (error) {
    console.error("Error obteniendo perfil sensorial:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo perfil sensorial",
    });
  }
};

/*
 * Crear o actualizar el perfil sensorial propio.
 */
const upsertMySensoryProfile = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { ownerId, actorId, accessProfile, relationshipKey } =
      await resolveSensoryProfileAccess(req, client);

    const data = sanitizeProfilePayload(req.body);

    const savedProfile = await saveOrUpdateSensoryProfile(
      client,
      ownerId,
      data,
      actorId,
      accessProfile,
      relationshipKey,
    );

    await saveSensoryProfileHistory(
      client,
      savedProfile,
      actorId,
      accessProfile,
      relationshipKey,
    );

    const completeProfile = await getProfileByUserId(ownerId, client);

    await client.query("COMMIT");

    return res.status(200).json(completeProfile);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error guardando perfil sensorial:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error guardando perfil sensorial",
    });
  } finally {
    client.release();
  }
};

/*
 * Obtener el perfil sensorial de un niño/a asociado.
 *
 * Puede hacerlo cualquier integrante adulto con una relación activa.
 */
const getChildSensoryProfile = async (req, res) => {
  try {
    const { ownerId } = await resolveSensoryProfileAccess(req);

    const profile = await getProfileByUserId(ownerId);

    return res.json(profile);
  } catch (error) {
    console.error("Error obteniendo perfil sensorial del niño/a:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo perfil sensorial del niño/a",
    });
  }
};

/*
 * Crear o actualizar el perfil sensorial de un niño/a asociado.
 *
 * Todos los perfiles adultos asociados pueden editar.
 */
const upsertChildSensoryProfile = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { ownerId, actorId, accessProfile, relationshipKey } =
      await resolveSensoryProfileAccess(req, client);

    assertCanEditSensoryProfile(accessProfile, relationshipKey);

    const data = sanitizeProfilePayload(req.body);

    const savedProfile = await saveOrUpdateSensoryProfile(
      client,
      ownerId,
      data,
      actorId,
      accessProfile,
      relationshipKey,
    );

    await saveSensoryProfileHistory(
      client,
      savedProfile,
      actorId,
      accessProfile,
      relationshipKey,
    );

    const completeProfile = await getProfileByUserId(ownerId, client);

    await client.query("COMMIT");

    return res.status(200).json(completeProfile);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error guardando perfil sensorial del niño/a:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error guardando perfil sensorial del niño/a",
    });
  } finally {
    client.release();
  }
};

/*
 * Historial del perfil sensorial propio.
 */
const getMySensoryProfileHistory = async (req, res) => {
  try {
    const { ownerId } = await resolveSensoryProfileAccess(req);

    const history = await getSensoryProfileHistoryByUserId(ownerId);

    return res.json(history);
  } catch (error) {
    console.error("Error obteniendo historial sensorial propio:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo historial sensorial",
    });
  }
};

/*
 * Historial del perfil sensorial de un niño/a asociado.
 *
 * Todos los perfiles adultos asociados pueden verlo.
 */
const getChildSensoryProfileHistory = async (req, res) => {
  try {
    const { ownerId } = await resolveSensoryProfileAccess(req);

    const history = await getSensoryProfileHistoryByUserId(ownerId);

    return res.json(history);
  } catch (error) {
    console.error("Error obteniendo historial sensorial del niño/a:", error);

    return res.status(error.statusCode || 500).json({
      message:
        error.message || "Error obteniendo historial sensorial del niño/a",
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

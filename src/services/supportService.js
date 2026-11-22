const pool = require("../database/db");
const { resolveSupportObserver } = require("./supportAccessService");

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getSupportTypes = async (client = pool) => {
  const result = await client.query(`
    SELECT id, code, name, description, is_support, display_order
    FROM "FloFlo".support_type
    WHERE is_active = TRUE
    ORDER BY display_order ASC, id ASC
  `);
  return result.rows;
};

const validateSupportTypes = async (supportCodes, client = pool) => {
  if (!Array.isArray(supportCodes) || supportCodes.length === 0) {
    throw createHttpError("Debes indicar al menos un tipo de apoyo", 400);
  }
  const normalizedCodes = supportCodes.map((code) => {
    if (typeof code !== "string" || !code.trim()) {
      throw createHttpError("Código de apoyo inválido", 400);
    }
    return code.trim();
  });
  const uniqueCodes = [...new Set(normalizedCodes)];
  const result = await client.query(
    `SELECT id, code, name, is_support
       FROM "FloFlo".support_type
      WHERE code = ANY($1::TEXT[]) AND is_active = TRUE`,
    [uniqueCodes]
  );
  if (result.rows.length !== uniqueCodes.length) {
    throw createHttpError("Uno o más tipos de apoyo no existen o están inactivos", 400);
  }
  if (result.rows.some((type) => type.is_support === false) && result.rows.length > 1) {
    throw createHttpError(
      "No se puede combinar la realización sin apoyo con otros tipos de apoyo",
      400
    );
  }
  return result.rows;
};

/**
 * Resuelve la persona desde un progreso ya completado, sin confundir
 * routine.user_id (propietario) con user.id (actor).
 *
 * Para rutinas gestionadas por adultos, la vinculación se comprueba mediante
 * el creador real y parent_child activo. Si existen dos perfiles posibles,
 * no se elige uno arbitrariamente.
 */
const resolveSupportPersonFromProgress = async ({
  sourceModule,
  sourceEntityType,
  sourceEntityId,
}, client = pool) => {
  if (sourceModule !== "routines" || sourceEntityType !== "routine_step_progress") {
    throw createHttpError("Contexto de observación no permitido", 400);
  }
  const progressId = Number(sourceEntityId);
  if (!Number.isSafeInteger(progressId) || progressId <= 0) {
    throw createHttpError("Identificador de progreso inválido", 400);
  }

  const result = await client.query(
    `SELECT DISTINCT cp.id AS person_id
       FROM "FloFlo".routine_step_progress rsp
       JOIN "FloFlo".routine r
         ON r.id = rsp.routine_id AND r.user_id = rsp.user_id
       JOIN "FloFlo".routine_step rs
         ON rs.id = rsp.routine_step_id AND rs.routine_id = r.id
       JOIN "FloFlo".child_profile cp
         ON cp.status = 'active'
        AND (cp.id = r.user_id OR cp.legacy_user_id = r.user_id)
       JOIN "FloFlo".parent_child pc
         ON pc.child_id = cp.id
        AND pc.parent_id = r.created_by
        AND pc.status = 'active'
      WHERE rsp.id = $1
        AND rsp.completed = TRUE`,
    [progressId]
  );

  if (result.rows.length === 0) {
    throw createHttpError(
      "No se encontró una vinculación verificable entre el progreso y el perfil infantil",
      404
    );
  }
  if (result.rows.length !== 1) {
    throw createHttpError(
      "El progreso coincide con más de un perfil infantil; se requiere revisar la vinculación",
      409
    );
  }
  return Number(result.rows[0].person_id);
};

const createSupportObservation = async ({
  authenticatedUser,
  personId,
  sourceModule,
  sourceEntityType,
  sourceEntityId,
  supportCodes,
  notes = null,
}) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Primero se identifica la persona del progreso, sin confiar en el ID enviado.
    const resolvedPersonId = await resolveSupportPersonFromProgress({
      sourceModule,
      sourceEntityType,
      sourceEntityId,
    }, client);
    if (Number(personId) !== resolvedPersonId) {
      throw createHttpError("El progreso no pertenece a la persona indicada", 403);
    }

    // Los permisos del actor se validan independientemente de la identidad del niño.
    const observer = await resolveSupportObserver(authenticatedUser, resolvedPersonId, client);
    const validTypes = await validateSupportTypes(supportCodes, client);
    const progressId = Number(sourceEntityId);
    const cleanNotes = typeof notes === "string" ? notes.trim() || null : null;

    const observationResult = await client.query(
      `INSERT INTO "FloFlo".support_observation (
         person_id, actor_user_id, access_profile, relationship_key,
         source_module, source_entity_type, source_entity_id,
         observation_source, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        observer.personId,
        observer.actorUserId,
        observer.accessProfile,
        observer.relationshipKey,
        sourceModule,
        sourceEntityType,
        progressId,
        observer.observationSource,
        cleanNotes,
      ]
    );
    const observation = observationResult.rows[0];
    for (const supportType of validTypes) {
      await client.query(
        `INSERT INTO "FloFlo".support_observation_type
           (observation_id, support_type_id) VALUES ($1, $2)`,
        [observation.id, supportType.id]
      );
    }
    await client.query("COMMIT");
    return { ...observation, supportTypes: validTypes };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  getSupportTypes,
  validateSupportTypes,
  resolveSupportPersonFromProgress,
  createSupportObservation,
};
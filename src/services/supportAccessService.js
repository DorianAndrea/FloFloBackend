
const pool = require("../database/db");

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const validateId = (value, label) => {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw createHttpError(`${label} inválido`, 400);
  }

  return id;
};

const OBSERVATION_PROFILES = new Set([
  "primary_caregiver",
  "caregiver",
  "therapist",
  "teacher",
  "professional",
]);

/**
 * Resuelve la identidad y los permisos para
 * registrar observaciones de apoyo.
 *
 * La identidad proviene exclusivamente del JWT
 * validado por authMiddleware.
 *
 * personId corresponde actualmente a child_profile.id.
 */
const resolveSupportObserver = async (
  authenticatedUser,
  personId,
  client = pool
) => {
  if (!authenticatedUser) {
    throw createHttpError("Autenticación requerida", 401);
  }

  const actorUserId = validateId(
    authenticatedUser.id,
    "Usuario"
  );

  const cleanPersonId = validateId(
    personId,
    "Persona apoyada"
  );

  if (authenticatedUser.role !== "parent") {
    throw createHttpError(
      "Este perfil no puede registrar observaciones de terceros",
      403
    );
  }

  const result = await client.query(
    `
    SELECT
      pc.child_id,
      pc.access_profile,
      pc.relationship_key
    FROM "FloFlo".parent_child pc

    INNER JOIN "FloFlo".child_profile cp
      ON cp.id = pc.child_id

    INNER JOIN "FloFlo"."user" u
      ON u.id = pc.parent_id

    WHERE pc.parent_id = $1
      AND pc.child_id = $2
      AND pc.status = 'active'
      AND cp.status = 'active'
      AND u.is_active = TRUE

    LIMIT 1
    `,
    [actorUserId, cleanPersonId]
  );

  if (result.rows.length === 0) {
    throw createHttpError(
      "No tienes una relación activa con esta persona",
      403
    );
  }

  const access = result.rows[0];

  if (!OBSERVATION_PROFILES.has(access.access_profile)) {
    throw createHttpError(
      "Tu perfil no permite registrar observaciones de apoyo",
      403
    );
  }

  if (!access.relationship_key) {
    throw createHttpError(
      "La relación de acceso no está configurada",
      403
    );
  }

  return {
    personId: cleanPersonId,
    actorUserId,
    accessProfile: access.access_profile,
    relationshipKey: access.relationship_key,
    observationSource:
      access.access_profile === "primary_caregiver" ||
      access.access_profile === "caregiver"
        ? "caregiver_reported"
        : "professional_reported",
  };
};

module.exports = {
  resolveSupportObserver,
};

const pool = require("../../database/db");

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

const normalizeEventType = (eventType) => {
  const cleanEventType = String(eventType || "")
    .trim()
    .toUpperCase();

  if (!/^[A-Z][A-Z0-9_]*$/.test(cleanEventType)) {
    throw createHttpError("Tipo de evento cognitivo inválido", 400);
  }

  return cleanEventType;
};

const normalizeConceptCodes = (conceptCodes) => {
  if (!Array.isArray(conceptCodes) || conceptCodes.length === 0) {
    throw createHttpError(
      "El evento debe estar asociado al menos a un concepto",
      400,
    );
  }

  return [
    ...new Set(
      conceptCodes.map((code) =>
        String(code || "")
          .trim()
          .toUpperCase(),
      ),
    ),
  ];
};

/**
 * Publica un evento en el Learning Bus.
 *
 * Debe recibir un client PostgreSQL cuando se utilice dentro de
 * una transacción existente.
 */
const publishLearningEvent = async (
  {
    idempotencyKey,
    eventType,
    childId,
    actorUserId = null,
    sourceModule,
    sourceEntityType = null,
    sourceEntityId = null,
    conceptCodes,
    context = {},
    payload = {},
    metadata = {},
    occurredAt = null,
  },
  client = pool,
) => {
  const cleanChildId = validatePositiveInteger(childId, "Niño/a");

  const cleanActorUserId =
    actorUserId === null || actorUserId === undefined
      ? null
      : validatePositiveInteger(actorUserId, "Usuario actor");

  const cleanIdempotencyKey = String(idempotencyKey || "").trim();

  if (!cleanIdempotencyKey) {
    throw createHttpError(
      "La clave de idempotencia es obligatoria",
      400,
    );
  }

  const cleanEventType = normalizeEventType(eventType);

  const cleanSourceModule = String(sourceModule || "").trim();

  if (!cleanSourceModule) {
    throw createHttpError(
      "El módulo de origen es obligatorio",
      400,
    );
  }

  const cleanConceptCodes = normalizeConceptCodes(conceptCodes);

  const conceptResult = await client.query(
    `
    SELECT id, code
    FROM "FloFlo".cognitive_concept
    WHERE code = ANY($1::VARCHAR[])
      AND active = TRUE
    `,
    [cleanConceptCodes],
  );

  if (conceptResult.rows.length !== cleanConceptCodes.length) {
    const foundCodes = new Set(
      conceptResult.rows.map((concept) => concept.code),
    );

    const missingCodes = cleanConceptCodes.filter(
      (code) => !foundCodes.has(code),
    );

    throw createHttpError(
      `Conceptos cognitivos no encontrados: ${missingCodes.join(", ")}`,
      400,
    );
  }

  const eventResult = await client.query(
    `
    INSERT INTO "FloFlo".cognitive_event (
      idempotency_key,
      event_type,
      event_version,
      child_id,
      actor_user_id,
      source_module,
      source_entity_type,
      source_entity_id,
      context,
      payload,
      metadata,
      occurred_at,
      processing_status,
      processing_attempts
    )
    VALUES (
      $1,
      $2,
      1,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8::JSONB,
      $9::JSONB,
      $10::JSONB,
      COALESCE($11::TIMESTAMPTZ, NOW()),
      'pending',
      0
    )

    ON CONFLICT (idempotency_key)
    DO NOTHING

    RETURNING *
    `,
    [
      cleanIdempotencyKey,
      cleanEventType,
      cleanChildId,
      cleanActorUserId,
      cleanSourceModule,
      sourceEntityType
        ? String(sourceEntityType).trim()
        : null,
      sourceEntityId !== null && sourceEntityId !== undefined
        ? String(sourceEntityId)
        : null,
      JSON.stringify(context || {}),
      JSON.stringify(payload || {}),
      JSON.stringify(metadata || {}),
      occurredAt,
    ],
  );

  if (eventResult.rows.length === 0) {
    const existingEvent = await client.query(
      `
      SELECT *
      FROM "FloFlo".cognitive_event
      WHERE idempotency_key = $1
      LIMIT 1
      `,
      [cleanIdempotencyKey],
    );

    return {
      event: existingEvent.rows[0] || null,
      created: false,
      duplicate: true,
    };
  }

  const event = eventResult.rows[0];

  for (const concept of conceptResult.rows) {
    await client.query(
      `
      INSERT INTO "FloFlo".cognitive_event_concept (
        event_id,
        concept_id,
        relevance_weight
      )
      VALUES ($1, $2, $3)

      ON CONFLICT (event_id, concept_id)
      DO NOTHING
      `,
      [
        event.id,
        concept.id,
        concept.code === "AUTONOMY" ? 1 : 0.8,
      ],
    );
  }

  return {
    event,
    created: true,
    duplicate: false,
  };
};

module.exports = {
  publishLearningEvent,
};
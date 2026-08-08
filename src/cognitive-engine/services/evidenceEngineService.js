const {
  COGNITIVE_EVENT_TYPES,
  EVIDENCE_SOURCES,
  EVIDENCE_TYPES,
  EVIDENCE_RESULTS,
} = require("../constants/cognitiveEventTypes");

const createEvidenceError = (message, code = "EVIDENCE_ENGINE_ERROR") => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const validateEvent = (event) => {
  if (!event || !event.id) {
    throw createEvidenceError(
      "El evento cognitivo es obligatorio",
      "INVALID_EVENT",
    );
  }

  if (!event.child_id) {
    throw createEvidenceError(
      "El evento no contiene child_id",
      "MISSING_CHILD_ID",
    );
  }

  if (!event.event_type) {
    throw createEvidenceError(
      "El evento no contiene event_type",
      "MISSING_EVENT_TYPE",
    );
  }
};

/*
 * Obtiene los conceptos que fueron asociados al evento
 * cuando este se publicó mediante el Learning Bus.
 */
const getEventConcepts = async (client, eventId) => {
  const result = await client.query(
    `
    SELECT
      cec.concept_id,
      cec.relevance_weight,
      cc.code,
      cc.name

    FROM "FloFlo".cognitive_event_concept cec

    INNER JOIN "FloFlo".cognitive_concept cc
      ON cc.id = cec.concept_id

    WHERE cec.event_id = $1

    ORDER BY cec.relevance_weight DESC, cc.code ASC
    `,
    [eventId],
  );

  return result.rows;
};

/*
 * Evita guardar dos evidencias para el mismo
 * evento y concepto.
 */
const findExistingEvidence = async (client, eventId, conceptId) => {
  const result = await client.query(
    `
    SELECT *
    FROM "FloFlo".cognitive_evidence
    WHERE event_id = $1
      AND concept_id = $2
    LIMIT 1
    `,
    [eventId, conceptId],
  );

  return result.rows[0] || null;
};

/*
 * Crea una evidencia individual.
 */
const createEvidence = async ({ client, event, concept, processorVersion }) => {
  const existingEvidence = await findExistingEvidence(
    client,
    event.id,
    concept.concept_id,
  );

  if (existingEvidence) {
    return {
      created: false,
      duplicate: true,
      evidence: existingEvidence,
    };
  }

  const context = event.context || {};
  const payload = event.payload || {};
  const metadata = event.metadata || {};

  const routineId =
    context.routineId || payload.routineId || event.source_entity_id || null;

  const learningContext = context.learningContext || {};

  const learningContextKey = String(learningContext.key || "unspecified")
    .trim()
    .toLowerCase();

  const contextKey = learningContextKey;

  /*
   * Una rutina completada es evidencia positiva,
   * pero no demuestra por sí sola dominio del concepto.
   *
   * Por eso la confianza inicial es 0.80 y no 1.00.
   */
  const confidence = 0.8;

  const evidenceValue = Number(concept.relevance_weight || 1);

  const details = {
    eventType: event.event_type,

    concept: {
      id: concept.concept_id,
      code: concept.code,
      name: concept.name,
      relevanceWeight: evidenceValue,
    },

    actor: {
      userId: event.actor_user_id || null,
      source: context.source || null,
      accessProfile: context.accessProfile || null,
      relationshipKey: context.relationshipKey || null,
    },

    routine: {
      id: routineId,
      name: context.routineName || null,
      completionDate: context.completionDate || null,
      scheduledDay: context.scheduledDay || null,
      startTime: payload.startTime || null,
      endTime: payload.endTime || null,
      points: Number(payload.points || 1),
    },

    learningContext: {
      id: learningContext.id || null,
      key: learningContextKey,
      name: learningContext.name || "Sin especificar",
      category: learningContext.category || "environment",
      icon: learningContext.icon || null,
      color: learningContext.color || null,
    },

    processing: {
      processorVersion,
    },

    originalContext: context,
    originalPayload: payload,
    originalMetadata: metadata,
  };

  const result = await client.query(
    `
    INSERT INTO "FloFlo".cognitive_evidence (
      event_id,
      child_id,
      concept_id,
      evidence_source,
      evidence_type,
      result,
      evidence_value,
      confidence,
      support_level,
      difficulty_level,
      context_key,
      details,
      occurred_at,
      created_at
    )
    VALUES (
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
      $12::jsonb,
      $13,
      NOW()
    )
    RETURNING *
    `,
    [
      event.id,
      event.child_id,
      concept.concept_id,

      EVIDENCE_SOURCES.BEHAVIORAL,
      EVIDENCE_TYPES.ROUTINE_COMPLETION,
      EVIDENCE_RESULTS.POSITIVE,

      evidenceValue,
      confidence,

      null,
      null,

      contextKey,
      JSON.stringify(details),
      event.occurred_at || new Date(),
    ],
  );

  return {
    created: true,
    duplicate: false,
    evidence: result.rows[0],
  };
};

/*
 * Procesa específicamente ROUTINE_COMPLETED.
 *
 * Una evidencia será creada por cada concepto
 * asociado al evento.
 */
const processRoutineCompletedEvidence = async ({
  event,
  client,
  processorVersion,
}) => {
  validateEvent(event);

  if (event.event_type !== COGNITIVE_EVENT_TYPES.ROUTINE_COMPLETED) {
    throw createEvidenceError(
      `El Evidence Engine recibió un evento incorrecto: ${event.event_type}`,
      "INVALID_ROUTINE_EVENT",
    );
  }

  if (!client) {
    throw createEvidenceError(
      "La conexión de base de datos es obligatoria",
      "MISSING_DATABASE_CLIENT",
    );
  }

  const concepts = await getEventConcepts(client, event.id);

  if (concepts.length === 0) {
    throw createEvidenceError(
      "El evento no tiene conceptos cognitivos asociados",
      "EVENT_WITHOUT_CONCEPTS",
    );
  }

  const results = [];

  for (const concept of concepts) {
    const evidenceResult = await createEvidence({
      client,
      event,
      concept,
      processorVersion,
    });

    results.push({
      conceptId: concept.concept_id,
      conceptCode: concept.code,
      relevanceWeight: Number(concept.relevance_weight || 1),
      evidenceId: evidenceResult.evidence?.id || null,
      created: evidenceResult.created,
      duplicate: evidenceResult.duplicate,
    });
  }

  return {
    eventId: event.id,
    eventType: event.event_type,
    childId: event.child_id,
    conceptsProcessed: concepts.length,
    evidencesCreated: results.filter((item) => item.created).length,
    duplicatesSkipped: results.filter((item) => item.duplicate).length,
    evidences: results,
  };
};

module.exports = {
  processRoutineCompletedEvidence,
};

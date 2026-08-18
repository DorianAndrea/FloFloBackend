const createContextError = (message, code = "CONTEXT_AGGREGATION_ERROR") => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const validatePositiveInteger = (value, label) => {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw createContextError(`${label} inválido`, "INVALID_ID");
  }

  return numberValue;
};

/**
 * Busca todos los contextos afectados por un evento.
 */
const getEventContexts = async (client, eventId) => {
  const result = await client.query(
    `
    SELECT DISTINCT
      child_id,
      concept_id,
      context_key
    FROM "FloFlo".cognitive_evidence
    WHERE event_id = $1
      AND context_key IS NOT NULL
    `,
    [eventId],
  );

  return result.rows;
};

/**
 * Recalcula desde cero las métricas de un niño,
 * concepto y contexto.
 *
 * Esto evita sumar dos veces si un evento se reprocesa.
 */
const calculateContextSummary = async ({
  client,
  childId,
  conceptId,
  contextKey,
}) => {
  const result = await client.query(
    `
    SELECT
      COUNT(*)::INTEGER AS exposure_count,

      COUNT(*) FILTER (
        WHERE ce.result = 'positive'
      )::INTEGER AS success_count,

      COUNT(*) FILTER (
        WHERE ce.result = 'partial'
      )::INTEGER AS partial_count,

      COUNT(*) FILTER (
        WHERE ce.result IN ('difficulty', 'negative')
      )::INTEGER AS difficulty_count,

      MIN(ce.occurred_at) AS first_observed_at,
      MAX(ce.occurred_at) AS last_observed_at,

      MAX(
        COALESCE(
          lc.name,

          CASE
            WHEN ce.context_key LIKE 'routine:%'
              THEN ce.details #>> '{routine,name}'

            WHEN ce.context_key LIKE 'place:%'
              THEN ce.details #>> '{place,name}'

            WHEN ce.context_key LIKE 'conversation:%'
              THEN ce.details #>> '{conversation,name}'

            ELSE NULL
          END,

          ce.details #>> '{learningContext,name}',
          ce.context_key
        )
      ) AS context_label

    FROM "FloFlo".cognitive_evidence ce

    LEFT JOIN "FloFlo".learning_context lc
      ON lc.context_key = ce.context_key
      AND lc.is_active = TRUE

    WHERE ce.child_id = $1
      AND ce.concept_id = $2
      AND ce.context_key = $3
    `,
    [childId, conceptId, contextKey],
  );

  return result.rows[0];
};

/**
 * Inserta o actualiza el resumen contextual.
 */
const saveContextSummary = async ({
  client,
  childId,
  conceptId,
  contextKey,
  summary,
}) => {
  const result = await client.query(
    `
    INSERT INTO "FloFlo".child_concept_context (
      child_id,
      concept_id,
      context_key,
      context_label,
      exposure_count,
      success_count,
      partial_count,
      difficulty_count,
      first_observed_at,
      last_observed_at,
      created_at,
      updated_at
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
      NOW(),
      NOW()
    )

    ON CONFLICT (child_id, concept_id, context_key)
    DO UPDATE SET
      context_label = COALESCE(
        EXCLUDED.context_label,
        "FloFlo".child_concept_context.context_label
      ),
      exposure_count = EXCLUDED.exposure_count,
      success_count = EXCLUDED.success_count,
      partial_count = EXCLUDED.partial_count,
      difficulty_count = EXCLUDED.difficulty_count,
      first_observed_at = EXCLUDED.first_observed_at,
      last_observed_at = EXCLUDED.last_observed_at,
      updated_at = NOW()

    RETURNING *
    `,
    [
      childId,
      conceptId,
      contextKey,
      summary.context_label || contextKey,
      Number(summary.exposure_count || 0),
      Number(summary.success_count || 0),
      Number(summary.partial_count || 0),
      Number(summary.difficulty_count || 0),
      summary.first_observed_at || null,
      summary.last_observed_at || null,
    ],
  );

  return result.rows[0];
};

/**
 * Actualiza todos los contextos afectados por un evento.
 */
const aggregateEventContexts = async ({ eventId, client }) => {
  if (!client) {
    throw createContextError(
      "La conexión de base de datos es obligatoria",
      "MISSING_DATABASE_CLIENT",
    );
  }

  const cleanEventId = validatePositiveInteger(eventId, "Evento");

  const affectedContexts = await getEventContexts(client, cleanEventId);

  const results = [];

  for (const context of affectedContexts) {
    const summary = await calculateContextSummary({
      client,
      childId: context.child_id,
      conceptId: context.concept_id,
      contextKey: context.context_key,
    });

    const savedContext = await saveContextSummary({
      client,
      childId: context.child_id,
      conceptId: context.concept_id,
      contextKey: context.context_key,
      summary,
    });

    results.push({
      id: savedContext.id,
      childId: savedContext.child_id,
      conceptId: savedContext.concept_id,
      contextKey: savedContext.context_key,
      exposureCount: savedContext.exposure_count,
      successCount: savedContext.success_count,
      partialCount: savedContext.partial_count,
      difficultyCount: savedContext.difficulty_count,
    });
  }

  return {
    eventId: cleanEventId,
    contextsProcessed: results.length,
    contexts: results,
  };
};

module.exports = {
  aggregateEventContexts,
};

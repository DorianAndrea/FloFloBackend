const pool = require("../../database/db");

const resolveMasteryLevel = ({
  masteryScore,
  confidence,
  evidenceCount,
  positiveEvidenceCount,
  contextCount,
  successfulContextCount,
}) => {
  const score = Number(masteryScore || 0);
  const confidenceValue = Number(confidence || 0);
  const evidence = Number(evidenceCount || 0);
  const positive = Number(positiveEvidenceCount || 0);
  const contexts = Number(contextCount || 0);
  const successfulContexts = Number(successfulContextCount || 0);

  /*
   * MASTERED
   *
   * Requiere evidencia abundante, consistente
   * y generalización en varios contextos.
   */
  if (
    score >= 0.85 &&
    confidenceValue >= 0.75 &&
    evidence >= 10 &&
    positive >= 8 &&
    successfulContexts >= 3
  ) {
    return "mastered";
  }

  /*
   * GENERALIZED
   *
   * La habilidad ya aparece en más de un contexto.
   */
  if (
    score >= 0.7 &&
    confidenceValue >= 0.65 &&
    evidence >= 6 &&
    positive >= 5 &&
    contexts >= 2 &&
    successfulContexts >= 2
  ) {
    return "generalized";
  }

  /*
   * UNDERSTOOD
   *
   * Existe evidencia repetida y consistente,
   * aunque todavía no haya generalización suficiente.
   */
  if (
    score >= 0.6 &&
    confidenceValue >= 0.6 &&
    evidence >= 4 &&
    positive >= 3
  ) {
    return "understood";
  }

  /*
   * LEARNING
   *
   * La habilidad está siendo practicada
   * y ya existe más de una evidencia.
   */
  if (score >= 0.35 && evidence >= 2) {
    return "learning";
  }

  /*
   * EXPOSURE
   *
   * Existe al menos una evidencia.
   */
  if (evidence >= 1) {
    return "exposure";
  }

  return "unknown";
};

const recalculateConceptMastery = async ({
  childId,
  conceptId,
  client = pool,
}) => {
  const evidenceResult = await client.query(
    `
    SELECT
      COUNT(*)::int AS evidence_count,

      COUNT(*) FILTER (
        WHERE result = 'positive'
      )::int AS positive_evidence_count,

      COUNT(*) FILTER (
  WHERE result = 'negative'
)::int AS negative_evidence_count,

COUNT(*) FILTER (
  WHERE result = 'partial'
)::int AS partial_evidence_count,

COUNT(*) FILTER (
  WHERE result = 'difficulty'
)::int AS difficulty_evidence_count,

COALESCE(
  AVG(
    evidence_value *
    CASE
      WHEN result = 'positive' THEN 1.00
      WHEN result = 'partial' THEN 0.65
      WHEN result = 'difficulty' THEN 0.30
      WHEN result = 'negative' THEN 0.00
      WHEN result = 'neutral' THEN 0.50
      WHEN result = 'inconclusive' THEN 0.50
      ELSE 0.50
    END
  ),
  0
)::numeric AS mastery_score,

      COALESCE(
        AVG(confidence),
        0
      )::numeric AS confidence,

      MIN(occurred_at) AS first_evidence_at,
      MAX(occurred_at) AS last_evidence_at

    FROM "FloFlo".cognitive_evidence

    WHERE child_id = $1
      AND concept_id = $2
    `,
    [childId, conceptId],
  );

  const stats = evidenceResult.rows[0];

  const contextResult = await client.query(
    `
  SELECT
    COUNT(*)::int AS context_count,

    COUNT(*) FILTER (
      WHERE ccc.exposure_count >= 2
        AND ccc.success_count >= 2
        AND (
          ccc.success_count::numeric /
          NULLIF(ccc.exposure_count, 0)
        ) >= 0.70
    )::int AS successful_context_count

  FROM "FloFlo".child_concept_context ccc

  JOIN "FloFlo".learning_context lc
    ON lc.context_key = ccc.context_key
    AND lc.is_active = TRUE

  WHERE ccc.child_id = $1
    AND ccc.concept_id = $2
    AND ccc.context_key <> 'unspecified'
  `,
    [childId, conceptId],
  );

  const contextStats = contextResult.rows[0];

  const masteryScore = Number(stats.mastery_score || 0);

  const confidence = Number(stats.confidence || 0);

  const evidenceCount = Number(stats.evidence_count || 0);

  const positiveEvidenceCount = Number(stats.positive_evidence_count || 0);

  const negativeEvidenceCount = Number(stats.negative_evidence_count || 0);

  const partialEvidenceCount = Number(stats.partial_evidence_count || 0);

  const difficultyEvidenceCount = Number(stats.difficulty_evidence_count || 0);

  const contextCount = Number(contextStats.context_count || 0);

  const successfulContextCount = Number(
    contextStats.successful_context_count || 0,
  );

  const masteryLevel = resolveMasteryLevel({
    masteryScore,
    confidence,
    evidenceCount,
    positiveEvidenceCount,
    contextCount,
    successfulContextCount,
  });

  const result = await client.query(
    `
    INSERT INTO "FloFlo".child_concept_mastery (
      child_id,
      concept_id,

      mastery_level,
      mastery_score,
      confidence,

      evidence_count,
      positive_evidence_count,
      negative_evidence_count,

      context_count,
      successful_context_count,

      first_evidence_at,
      last_evidence_at,
      last_progress_at,

      calculation_version,
      calculation_details,

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

      $11,
      $12,
      NOW(),

      '1.3.0',
      $13::jsonb,

      NOW(),
      NOW()
    )

    ON CONFLICT (child_id, concept_id)

    DO UPDATE SET
      mastery_level = EXCLUDED.mastery_level,
      mastery_score = EXCLUDED.mastery_score,
      confidence = EXCLUDED.confidence,

      evidence_count = EXCLUDED.evidence_count,
      positive_evidence_count =
        EXCLUDED.positive_evidence_count,
      negative_evidence_count =
        EXCLUDED.negative_evidence_count,

      context_count = EXCLUDED.context_count,
      successful_context_count =
        EXCLUDED.successful_context_count,

      first_evidence_at =
        EXCLUDED.first_evidence_at,
      last_evidence_at =
        EXCLUDED.last_evidence_at,

      last_progress_at = NOW(),

      calculation_version =
        EXCLUDED.calculation_version,
      calculation_details =
        EXCLUDED.calculation_details,

      updated_at = NOW()

    RETURNING *
    `,
    [
      childId,
      conceptId,

      masteryLevel,
      masteryScore,
      confidence,

      evidenceCount,
      positiveEvidenceCount,
      negativeEvidenceCount,

      contextCount,
      successfulContextCount,

      stats.first_evidence_at,
      stats.last_evidence_at,

      JSON.stringify({
        method: "weighted_evidence_context_mastery_v2",

        score: masteryScore,
        confidence,

        evidenceCount,

        positiveEvidenceCount,
        partialEvidenceCount,
        difficultyEvidenceCount,
        negativeEvidenceCount,

        contextCount,
        successfulContextCount,

        evidenceWeights: {
          positive: 1.0,
          partial: 0.65,
          difficulty: 0.3,
          negative: 0.0,
          neutral: 0.5,
          inconclusive: 0.5,
        },

        successfulContextRule: {
          minExposureCount: 2,
          minSuccessCount: 2,
          minSuccessRatio: 0.7,
        },
      }),
    ],
  );

  return result.rows[0];
};

const updateMasteryForEvent = async ({ eventId, childId, client = pool }) => {
  const conceptResult = await client.query(
    `
    SELECT DISTINCT concept_id
    FROM "FloFlo".cognitive_evidence
    WHERE event_id = $1
      AND child_id = $2
    `,
    [eventId, childId],
  );

  const updated = [];

  for (const row of conceptResult.rows) {
    const mastery = await recalculateConceptMastery({
      childId,
      conceptId: row.concept_id,
      client,
    });

    updated.push(mastery);
  }

  return {
    updatedCount: updated.length,
    concepts: updated,
  };
};

const recalculateAllMasteryForChild = async ({ childId, client = pool }) => {
  const conceptsResult = await client.query(
    `
    SELECT DISTINCT concept_id
    FROM "FloFlo".cognitive_evidence
    WHERE child_id = $1
    ORDER BY concept_id
    `,
    [childId],
  );

  const updated = [];

  for (const row of conceptsResult.rows) {
    const mastery = await recalculateConceptMastery({
      childId,
      conceptId: row.concept_id,
      client,
    });

    updated.push(mastery);
  }

  return {
    updatedCount: updated.length,
    concepts: updated,
  };
};

module.exports = {
  resolveMasteryLevel,
  recalculateConceptMastery,
  updateMasteryForEvent,
  recalculateAllMasteryForChild,
};

const pool = require("../../database/db");
const cognitiveKernel = require("../cognitiveKernel");

const MASTERY_PRIORITY = Object.freeze({
  unknown: 0,
  exposure: 18,
  learning: 14,
  understood: 6,
  generalized: -8,
  mastered: -20,
});

const PRIORITY_RULES = Object.freeze({
  BASE: 10,

  NEVER_OPENED: 35,

  NOT_USED_7_DAYS: 20,

  LOW_USAGE: 15,

  FAVORITE: 10,

  SHORT_EXPERIENCE: 5,

  USED_TODAY: -40,

  VERY_FREQUENTLY_USED: -20,
});

const buildExplanation = ({
  neverOpened,
  usedToday,
  daysSinceOpened,
  openCount,
  isFavorite,
  learningContextName,
}) => {
  const explanations = [];

  if (neverOpened) {
    explanations.push("Es una experiencia que todavía no han explorado.");
  }

  if (!neverOpened && daysSinceOpened >= 7) {
    explanations.push("Hace varios días que no practican esta experiencia.");
  }

  if (openCount > 0 && openCount <= 2) {
    explanations.push(
      "Ha sido utilizada pocas veces y puede ser útil retomarla.",
    );
  }

  if (isFavorite) {
    explanations.push("Está entre las experiencias favoritas.");
  }

  if (learningContextName) {
    explanations.push(
      `Puede trabajarse en ${learningContextName.toLowerCase()}.`,
    );
  }

  if (usedToday) {
    explanations.push(
      "Ya fue utilizada recientemente, por eso tiene menor prioridad.",
    );
  }

  return explanations;
};
const buildCognitiveExplanation = (cognitiveProfile) => {
  const explanations = [];

  const priorityConcept = cognitiveProfile
    .filter((concept) =>
      ["exposure", "learning", "understood"].includes(concept.mastery_level),
    )
    .sort((a, b) => b.weight - a.weight)[0];

  if (!priorityConcept) {
    return explanations;
  }

  const conceptName = priorityConcept.name || priorityConcept.code;

  if (priorityConcept.mastery_level === "exposure") {
    explanations.push(
      `Esta experiencia ayuda a desarrollar ${conceptName.toLowerCase()}.`,
    );
  }

  if (priorityConcept.mastery_level === "learning") {
    explanations.push(
      `Esta experiencia fortalece ${conceptName.toLowerCase()}.`,
    );
  }

  if (priorityConcept.mastery_level === "understood") {
    explanations.push(
      `Esta experiencia ayuda a consolidar ${conceptName.toLowerCase()}.`,
    );
  }

  return explanations;
};

const evaluateExperienceCandidate = (
  candidate,
  frameworkExperience,
  masteryByConcept,
  conceptMetaByCode,
) => {
  let priority = PRIORITY_RULES.BASE;

  const openCount = Number(candidate.open_count || 0);

  const neverOpened = !candidate.last_opened_at;

  let daysSinceOpened = null;

  if (candidate.last_opened_at) {
    const lastOpened = new Date(candidate.last_opened_at);
    const now = new Date();

    const diffMs = now.getTime() - lastOpened.getTime();

    daysSinceOpened = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  const usedToday = daysSinceOpened !== null && daysSinceOpened === 0;

  if (neverOpened) {
    priority += PRIORITY_RULES.NEVER_OPENED;
  }

  if (daysSinceOpened !== null && daysSinceOpened >= 7) {
    priority += PRIORITY_RULES.NOT_USED_7_DAYS;
  }

  if (openCount > 0 && openCount <= 2) {
    priority += PRIORITY_RULES.LOW_USAGE;
  }

  if (candidate.is_favorite) {
    priority += PRIORITY_RULES.FAVORITE;
  }

  if (
    candidate.estimated_minutes &&
    Number(candidate.estimated_minutes) <= 15
  ) {
    priority += PRIORITY_RULES.SHORT_EXPERIENCE;
  }

  if (usedToday) {
    priority += PRIORITY_RULES.USED_TODAY;
  }

  if (openCount >= 10) {
    priority += PRIORITY_RULES.VERY_FREQUENTLY_USED;
  }

  /*
   * Información cognitiva proveniente del FCF.
   */
  const frameworkConcepts = frameworkExperience?.concepts || [];

  const primaryConcept =
    frameworkConcepts.find((concept) => concept.is_primary === true) || null;

  const cognitiveProfile = frameworkConcepts.map((concept) => {
    const mastery = masteryByConcept?.get(concept.code);

    const conceptMeta = conceptMetaByCode?.get(concept.code);

    return {
      code: concept.code,
      name: mastery?.concept_name || conceptMeta?.name || concept.code,
      weight: Number(concept.weight),
      is_primary: Boolean(concept.is_primary),

      mastery_level: mastery?.mastery_level || "unknown",

      mastery_score:
        mastery?.mastery_score !== undefined && mastery?.mastery_score !== null
          ? Number(mastery.mastery_score)
          : null,

      confidence:
        mastery?.confidence !== undefined && mastery?.confidence !== null
          ? Number(mastery.confidence)
          : null,

      evidence_count: Number(mastery?.evidence_count || 0),

      context_count: Number(mastery?.context_count || 0),

      successful_context_count: Number(mastery?.successful_context_count || 0),
    };
  });
  let masteryAdjustment = 0;

  for (const concept of cognitiveProfile) {
    const levelAdjustment = MASTERY_PRIORITY[concept.mastery_level] || 0;

    masteryAdjustment += levelAdjustment * concept.weight;
  }

  priority += Math.round(masteryAdjustment);

  const cognitiveExplanations = buildCognitiveExplanation(cognitiveProfile);

  const usageExplanations = buildExplanation({
    neverOpened,
    usedToday,
    daysSinceOpened,
    openCount,
    isFavorite: Boolean(candidate.is_favorite),
    learningContextName: candidate.learning_context_name,
  });

  const explanations = [...cognitiveExplanations, ...usageExplanations];

  return {
    ...candidate,

    recommendation_priority: priority,

    mastery_adjustment: Math.round(masteryAdjustment),

    framework_mapped: Boolean(frameworkExperience),

    primary_concept_code: primaryConcept?.code || null,

    cognitive_concepts: cognitiveProfile,

    explanations,

    reason: explanations[0] || "Puede aportar variedad al aprendizaje actual.",
  };
};

const diversifyRecommendations = (
  candidates,
  limit = 6,
  maxPerCategory = 2,
) => {
  const selected = [];
  const categoryCounts = new Map();

  for (const candidate of candidates) {
    const categoryKey = String(candidate.category_id || "uncategorized");

    const currentCount = categoryCounts.get(categoryKey) || 0;

    if (currentCount >= maxPerCategory) {
      continue;
    }

    selected.push(candidate);

    categoryCounts.set(categoryKey, currentCount + 1);

    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
};

const getAdaptiveExperienceRecommendations = async ({
  ownerUserId,
  actorUserId,
  limit = 6,
}) => {
  const result = await pool.query(
    `
    SELECT
      et.id AS template_id,
      et.code AS template_code,
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

      er.last_opened_at,

      COALESCE(
        er.open_count,
        0
      )::int AS open_count,

      CASE
        WHEN ef.id IS NULL THEN FALSE
        ELSE TRUE
      END AS is_favorite,

      COALESCE(
        step_data.step_count,
        0
      )::int AS step_count

    FROM "FloFlo".experience_template et

    JOIN "FloFlo".experience_category ec
      ON ec.id = et.category_id
      AND ec.is_active = TRUE

    LEFT JOIN "FloFlo".learning_context lc
      ON lc.id = et.learning_context_id

    LEFT JOIN "FloFlo".experience_recent er
      ON er.template_id = et.id
      AND er.owner_user_id = $1

    LEFT JOIN "FloFlo".experience_favorite ef
      ON ef.template_id = et.id
      AND ef.user_id = $2

    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS step_count

      FROM "FloFlo".experience_template_step ets

      WHERE ets.template_id = et.id
    ) step_data ON TRUE

    WHERE et.is_active = TRUE
    `,
    [ownerUserId, actorUserId],
  );
  const masteryResult = await pool.query(
    `
  SELECT
    cc.code AS concept_code,
    cc.name AS concept_name,
    ccm.mastery_level,
    ccm.mastery_score,
    ccm.confidence,
    ccm.evidence_count,
    ccm.positive_evidence_count,
    ccm.negative_evidence_count,
    ccm.context_count,
    ccm.successful_context_count,
    ccm.last_evidence_at,
    ccm.last_progress_at

  FROM "FloFlo".child_concept_mastery ccm

  JOIN "FloFlo".cognitive_concept cc
    ON cc.id = ccm.concept_id

  WHERE ccm.child_id = $1
  `,
    [ownerUserId],
  );

  const conceptsResult = await pool.query(
    `
  SELECT
    code,
    name
  FROM "FloFlo".cognitive_concept
  WHERE active = TRUE
  `,
  );

  const conceptMetaByCode = new Map(
    conceptsResult.rows.map((concept) => [concept.code, concept]),
  );

  const masteryByConcept = new Map(
    masteryResult.rows.map((mastery) => [mastery.concept_code, mastery]),
  );
  const rankedCandidates = result.rows
    .map((row) => {
      const frameworkExperience = cognitiveKernel.getExperience(
        row.template_code,
      );

      return evaluateExperienceCandidate(
        row,
        frameworkExperience,
        masteryByConcept,
        conceptMetaByCode,
      );
    })
    .sort((a, b) => {
      const priorityDifference =
        b.recommendation_priority - a.recommendation_priority;

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return String(a.name).localeCompare(String(b.name), "es");
    });

  return diversifyRecommendations(rankedCandidates, limit, 2);
};

module.exports = {
  PRIORITY_RULES,
  evaluateExperienceCandidate,
  getAdaptiveExperienceRecommendations,
};

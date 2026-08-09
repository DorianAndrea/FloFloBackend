const pool = require("../../database/db");

const {
  recalculateConceptMastery,
} = require("./masteryEngineService");

const recalculateChildMastery = async ({
  childId,
  client = pool,
}) => {
  const cleanChildId = Number(childId);

  if (!Number.isInteger(cleanChildId) || cleanChildId <= 0) {
    throw new Error("childId inválido");
  }

  const conceptsResult = await client.query(
    `
    SELECT DISTINCT concept_id
    FROM "FloFlo".cognitive_evidence
    WHERE child_id = $1
    ORDER BY concept_id
    `,
    [cleanChildId],
  );

  const updated = [];

  for (const row of conceptsResult.rows) {
    const mastery = await recalculateConceptMastery({
      childId: cleanChildId,
      conceptId: row.concept_id,
      client,
    });

    updated.push(mastery);
  }

  return {
    childId: cleanChildId,
    updatedCount: updated.length,
    concepts: updated,
  };
};

const recalculateConceptForAllChildren = async ({
  conceptId,
  client = pool,
}) => {
  const cleanConceptId = Number(conceptId);

  if (!Number.isInteger(cleanConceptId) || cleanConceptId <= 0) {
    throw new Error("conceptId inválido");
  }

  const childrenResult = await client.query(
    `
    SELECT DISTINCT child_id
    FROM "FloFlo".cognitive_evidence
    WHERE concept_id = $1
    ORDER BY child_id
    `,
    [cleanConceptId],
  );

  const updated = [];

  for (const row of childrenResult.rows) {
    const mastery = await recalculateConceptMastery({
      childId: row.child_id,
      conceptId: cleanConceptId,
      client,
    });

    updated.push(mastery);
  }

  return {
    conceptId: cleanConceptId,
    updatedCount: updated.length,
    children: updated,
  };
};

const recalculateAllMastery = async ({
  client = pool,
} = {}) => {
  const pairsResult = await client.query(
    `
    SELECT DISTINCT
      child_id,
      concept_id
    FROM "FloFlo".cognitive_evidence
    ORDER BY child_id, concept_id
    `,
  );

  const updated = [];

  for (const row of pairsResult.rows) {
    const mastery = await recalculateConceptMastery({
      childId: row.child_id,
      conceptId: row.concept_id,
      client,
    });

    updated.push(mastery);
  }

  return {
    updatedCount: updated.length,
    masteryRecords: updated,
  };
};

module.exports = {
  recalculateChildMastery,
  recalculateConceptForAllChildren,
  recalculateAllMastery,
};
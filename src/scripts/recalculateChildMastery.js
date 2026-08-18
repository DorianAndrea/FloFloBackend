const pool = require("../database/db");

const {
  recalculateAllMasteryForChild,
} = require("../cognitive-engine/services/masteryEngineService");

const recalculateChildMastery = async (childId) => {
  const client = await pool.connect();

  try {
    console.log(
      `🧠 Recalculando mastery completo para child_id=${childId}...`,
    );

    await client.query("BEGIN");

    const result = await recalculateAllMasteryForChild({
      childId,
      client,
    });

    await client.query("COMMIT");

    console.log(
      `✅ Recalculo terminado. Conceptos actualizados: ${result.updatedCount}`,
    );

    console.log(
      result.concepts.map((concept) => ({
        concept_id: concept.concept_id,
        mastery_level: concept.mastery_level,
        context_count: concept.context_count,
        successful_context_count:
          concept.successful_context_count,
        calculation_version:
          concept.calculation_version,
      })),
    );
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "❌ Error recalculando mastery:",
      error,
    );

    throw error;
  } finally {
    client.release();
  }
};

recalculateChildMastery(9)
  .then(() => {
    process.exit(0);
  })
  .catch(() => {
    process.exit(1);
  });
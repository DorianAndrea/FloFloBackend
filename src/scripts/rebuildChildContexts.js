const pool = require("../database/db");

const {
  aggregateEventContexts,
} = require("../cognitive-engine/services/contextAggregationService");

const rebuildChildContexts = async (childId) => {
  const client = await pool.connect();

  try {
    const eventResult = await client.query(
      `
      SELECT DISTINCT event_id
      FROM "FloFlo".cognitive_evidence
      WHERE child_id = $1
        AND context_key IS NOT NULL
      ORDER BY event_id
      `,
      [childId],
    );

    console.log(
      `Recalculando contextos para child_id=${childId}. Eventos: ${eventResult.rows.length}`,
    );

    for (const row of eventResult.rows) {
      await client.query("BEGIN");

      try {
        await aggregateEventContexts({
          eventId: row.event_id,
          client,
        });

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("✅ Recalculo contextual terminado.");
  } finally {
    client.release();
  }
};

rebuildChildContexts(9)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error recalculando contextos:", error);
    process.exit(1);
  });
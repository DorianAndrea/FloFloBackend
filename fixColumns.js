const pool = require("./src/database/db");

const run = async () => {
  try {
    console.log("Revisando conexión...");

    const info = await pool.query(`
      SELECT current_database(), current_user, current_schema();
    `);

    console.log("DB:", info.rows[0]);

    await pool.query(`
      ALTER TABLE "FloFlo".user_contact_conversation
      ADD COLUMN IF NOT EXISTS correct_answer TEXT;
    `);

    await pool.query(`
      ALTER TABLE "FloFlo".user_contact_conversation
      ADD COLUMN IF NOT EXISTS wrong_answer_1 TEXT;
    `);

    await pool.query(`
      ALTER TABLE "FloFlo".user_contact_conversation
      ADD COLUMN IF NOT EXISTS wrong_answer_2 TEXT;
    `);

    const columns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'FloFlo'
      AND table_name = 'user_contact_conversation'
      ORDER BY ordinal_position;
    `);

    console.log("Columnas:", columns.rows);

    console.log("✅ Columnas verificadas/agregadas correctamente");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await pool.end();
  }
};

run();
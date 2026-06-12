const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool
  .connect()
  .then(async (client) => {
    console.log("✅ Conectado a PostgreSQL");

    const info = await client.query(`
      SELECT current_database(), current_user, current_schema();
    `);

    console.log("📌 Info conexión:", info.rows[0]);

    const tables = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema = 'FloFlo'
      ORDER BY table_name;
    `);

    console.log("📌 Tablas FloFlo:", tables.rows);

    client.release();
  })
  .catch((error) => {
    console.error("❌ Error PostgreSQL:", error.message);
  });

module.exports = pool;
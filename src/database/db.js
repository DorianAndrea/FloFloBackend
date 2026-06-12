const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool
  .connect()
  .then(async (client) => {
    console.log("✅ Conectado a PostgreSQL");

    const info = await client.query(`
      SELECT
        current_database(),
        current_user,
        current_schema();
    `);

    console.log("📌 Información conexión:");
    console.log(info.rows[0]);

    const schemas = await client.query(`
      SELECT schema_name
      FROM information_schema.schemata
      ORDER BY schema_name;
    `);

    console.log("📌 Schemas:");
    console.log(schemas.rows);

    const tables = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      ORDER BY table_schema, table_name;
    `);

    console.log("📌 Tablas:");
    console.log(tables.rows);

    client.release();
  })
  .catch((error) => {
    console.error("❌ Error PostgreSQL:", error.message);
  });

module.exports = pool;
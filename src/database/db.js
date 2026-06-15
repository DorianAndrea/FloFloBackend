const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool
  .connect()
  .then(async (client) => {
    console.log("✅ Conectado a PostgreSQL");

    const info = await client.query(`
      SELECT current_database(), current_user, current_schema();
    `);

    console.log("📌 Info conexión:", info.rows[0]);

    client.release();
  })
  .catch((error) => {
    console.error("❌ Error PostgreSQL:", error.message);
  });

module.exports = pool;
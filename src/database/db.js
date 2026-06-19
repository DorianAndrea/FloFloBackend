const { Pool } = require("pg");
require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isProduction
        ? {
            rejectUnauthorized: false,
          }
        : false,
    })
  : new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

pool
  .connect()
  .then((client) => {
    console.log("✅ Conectado a PostgreSQL");

    client
      .query(
        `
  SELECT current_database(), current_user, inet_server_addr(), inet_server_port()
`,

  )
  
      .then((result) => {
        console.log("INFO BD:", result.rows[0]);
      });
    client.release();
  })
  .catch((error) => {
    console.error("❌ Error PostgreSQL:", error.message);
  });

module.exports = pool;

const { Pool } = require("pg");
require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: isProduction
        ? {
            rejectUnauthorized: false,
          }
        : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };

const pool = new Pool(poolConfig);

const testConnection = async () => {
  let client;

  try {
    client = await pool.connect();

    console.log("✅ Conectado a PostgreSQL");

    const result = await client.query(`
      SELECT
        current_database() AS database,
        current_user AS user,
        inet_server_addr() AS server_addr,
        inet_server_port() AS server_port
    `);

    console.log("INFO BD:", result.rows[0]);
  } catch (error) {
    console.error("❌ Error PostgreSQL:", error.message);
  } finally {
    if (client) {
      client.release();
    }
  }
};

testConnection();

module.exports = pool;
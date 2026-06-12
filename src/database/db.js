const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.connect()
  .then(() => {
    console.log("✅ Conectado a PostgreSQL");
  })
  .catch((error) => {
    console.error("❌ Error PostgreSQL:", error.message);
  });

module.exports = pool;
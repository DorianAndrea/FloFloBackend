const pool = require("../database/db");

const getRelationshipTypes = async (req, res) => {
  try {
    const result = await pool.query
    (`
        SELECT  
            id,
            relationship_name
        FROM "FloFlo".relationship_type
        ORDER BY relationship_name
            
    `);
    res.json(result.rows);
  } catch (error) {
    console.log(error);

    res.status(500).json({
        message: error.message,
    });
  }
};
module.exports = {
    getRelationshipTypes,
};
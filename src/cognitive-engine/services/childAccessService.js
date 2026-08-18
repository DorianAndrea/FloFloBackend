const pool = require("../../database/db");

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getAdultChildAccess = async (
  adultId,
  childId,
  client = pool,
) => {
  const result = await client.query(
    `
    SELECT
      pc.child_id,
      pc.relationship_key,
      pc.access_profile,
      pc.can_manage_team,
      pc.status

    FROM "FloFlo".parent_child pc

    INNER JOIN "FloFlo".child_profile child
      ON child.id = pc.child_id

    WHERE pc.parent_id = $1
      AND pc.child_id = $2
      AND pc.status = 'active'
      AND child.status = 'active'

    LIMIT 1
    `,
    [adultId, childId],
  );

  if (result.rows.length === 0) {
    throw createHttpError(
      "No tienes permiso para acceder a este niño/a",
      403,
    );
  }

  return result.rows[0];
};

module.exports = {
  getAdultChildAccess,
};
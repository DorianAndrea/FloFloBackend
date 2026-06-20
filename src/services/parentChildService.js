const pool = require("../database/db");

const getChildrenByParent = async (parentId) => {
  const result = await pool.query(
    `
    SELECT
      c.id,
      c."firstName",
      c."lastName",
      c.email,
      c.avatar,
      c.role
    FROM "FloFlo".parent_child pc
    JOIN "FloFlo"."user" c
      ON c.id = pc.child_id
    WHERE pc.parent_id = $1
    ORDER BY c."firstName" ASC
    `,
    [parentId],
  );

  return result.rows;
};

const linkChildToParent = async (parentId, childEmail) => {
  const childResult = await pool.query(
    `
    SELECT id, "firstName", "lastName", email, role
    FROM "FloFlo"."user"
    WHERE email = $1
    AND role = 'child'
    `,
    [childEmail],
  );

  if (childResult.rows.length === 0) {
    return null;
  }

  const child = childResult.rows[0];

  const relationResult = await pool.query(
    `
    INSERT INTO "FloFlo".parent_child
    (parent_id, child_id)
    VALUES ($1, $2)
    ON CONFLICT (parent_id, child_id)
    DO NOTHING
    RETURNING *
    `,
    [parentId, child.id],
  );

  return {
    child,
    linked: relationResult.rows.length > 0,
  };
};

module.exports = {
  getChildrenByParent,
  linkChildToParent
};

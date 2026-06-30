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
      AND c.role = 'child'
    ORDER BY c."firstName" ASC
    `,
    [parentId],
  );

  return result.rows;
};

const linkChildToParent = async (parentId, childEmail) => {
  const normalizedEmail = String(childEmail || "").trim().toLowerCase();

  const childResult = await pool.query(
    `
    SELECT id, "firstName", "lastName", email, role
    FROM "FloFlo"."user"
    WHERE LOWER(email) = $1
      AND role = 'child'
    `,
    [normalizedEmail],
  );

  if (childResult.rows.length === 0) {
    return null;
  }

  const child = childResult.rows[0];

  if (Number(parentId) === Number(child.id)) {
    throw new Error("Un cuidador no puede asociarse a sí mismo");
  }

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

const isChildLinkedToParent = async (parentId, childId) => {
  const result = await pool.query(
    `
    SELECT 1
    FROM "FloFlo".parent_child pc
    JOIN "FloFlo"."user" c
      ON c.id = pc.child_id
    WHERE pc.parent_id = $1
      AND pc.child_id = $2
      AND c.role = 'child'
    LIMIT 1
    `,
    [parentId, childId],
  );

  return result.rows.length > 0;
};

const assertChildBelongsToParent = async (parentId, childId) => {
  const linked = await isChildLinkedToParent(parentId, childId);

  if (!linked) {
    const error = new Error("No tienes permiso para acceder a este niño/a");
    error.statusCode = 403;
    throw error;
  }

  return true;
};

module.exports = {
  getChildrenByParent,
  linkChildToParent,
  isChildLinkedToParent,
  assertChildBelongsToParent,
};
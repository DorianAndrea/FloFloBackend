const crypto = require("crypto");
const pool = require("../database/db");

const LINK_CODE_TTL_MINUTES =
  Number(process.env.PARENT_CHILD_LINK_CODE_TTL_MINUTES) || 15;

const getLinkSecret = () => {
  return (
    process.env.PARENT_CHILD_LINK_SECRET ||
    process.env.JWT_SECRET ||
    "dev-parent-child-link-secret"
  );
};

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeEmail = (email) => {
  return String(email || "").trim().toLowerCase();
};

const normalizeCode = (code) => {
  return String(code || "").replace(/\s+/g, "").trim();
};

const hashLinkCode = (childId, code) => {
  return crypto
    .createHmac("sha256", getLinkSecret())
    .update(`${childId}:${code}`)
    .digest("hex");
};

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

const createChildLinkCode = async (childId) => {
  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = hashLinkCode(childId, code);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      UPDATE "FloFlo".parent_child_link_code
      SET used_at = NOW()
      WHERE child_id = $1
        AND used_at IS NULL
      `,
      [childId],
    );

    const result = await client.query(
      `
      INSERT INTO "FloFlo".parent_child_link_code
      (
        child_id,
        code_hash,
        expires_at,
        created_at
      )
      VALUES
      (
        $1,
        $2,
        NOW() + ($3 * INTERVAL '1 minute'),
        NOW()
      )
      RETURNING id, child_id, expires_at, created_at
      `,
      [childId, codeHash, LINK_CODE_TTL_MINUTES],
    );

    await client.query("COMMIT");

    return {
      code,
      expires_at: result.rows[0].expires_at,
      expiresInMinutes: LINK_CODE_TTL_MINUTES,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const linkChildToParent = async (parentId, childEmail, linkCode) => {
  const normalizedEmail = normalizeEmail(childEmail);
  const normalizedCode = normalizeCode(linkCode);

  if (!normalizedEmail || !normalizedCode) {
    throw createHttpError("Debes ingresar correo del niño/a y código", 400);
  }

  if (!/^\d{6}$/.test(normalizedCode)) {
    throw createHttpError("El código debe tener 6 dígitos", 400);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const childResult = await client.query(
      `
      SELECT id, "firstName", "lastName", email, role
      FROM "FloFlo"."user"
      WHERE LOWER(email) = $1
        AND role = 'child'
      LIMIT 1
      `,
      [normalizedEmail],
    );

    if (childResult.rows.length === 0) {
      throw createHttpError(
        "No se pudo vincular. Revisa el correo y el código.",
        400,
      );
    }

    const child = childResult.rows[0];

    if (Number(parentId) === Number(child.id)) {
      throw createHttpError("Un cuidador no puede asociarse a sí mismo", 400);
    }

    const codeHash = hashLinkCode(child.id, normalizedCode);

    const codeResult = await client.query(
      `
      SELECT id
      FROM "FloFlo".parent_child_link_code
      WHERE child_id = $1
        AND code_hash = $2
        AND used_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [child.id, codeHash],
    );

    if (codeResult.rows.length === 0) {
      throw createHttpError(
        "No se pudo vincular. Revisa el correo y el código.",
        400,
      );
    }

    const relationResult = await client.query(
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

    await client.query(
      `
      UPDATE "FloFlo".parent_child_link_code
      SET used_at = NOW()
      WHERE id = $1
      `,
      [codeResult.rows[0].id],
    );

    await client.query("COMMIT");

    return {
      child,
      linked: relationResult.rows.length > 0,
      alreadyLinked: relationResult.rows.length === 0,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
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
  createChildLinkCode,
  linkChildToParent,
  isChildLinkedToParent,
  assertChildBelongsToParent,
};
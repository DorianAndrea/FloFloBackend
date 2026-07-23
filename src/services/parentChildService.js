const crypto = require("crypto");
const pool = require("../database/db");

const LINK_CODE_TTL_MINUTES =
  Number(process.env.PARENT_CHILD_LINK_CODE_TTL_MINUTES) || 15;

const TEAM_INVITATION_TTL_DAYS =
  Number(process.env.SUPPORT_TEAM_INVITATION_TTL_DAYS) || 7;

const RELATIONSHIP_PROFILES = {
  caregiver: "caregiver",
  family: "family",
  occupational_therapist: "therapist",
  psychologist: "therapist",
  speech_therapist: "therapist",
  teacher: "teacher",
  other_professional: "professional",
};

const ALLOWED_RELATIONSHIPS = Object.keys(RELATIONSHIP_PROFILES);

const getLinkSecret = () => {
  return (
    process.env.PARENT_CHILD_LINK_SECRET ||
    process.env.JWT_SECRET ||
    "dev-parent-child-link-secret"
  );
};

const getInvitationSecret = () => {
  return (
    process.env.SUPPORT_TEAM_INVITATION_SECRET ||
    process.env.JWT_SECRET ||
    "dev-support-team-invitation-secret"
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

const validatePositiveInteger = (value, label = "ID") => {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw createHttpError(`${label} inválido`, 400);
  }

  return numberValue;
};

const hashLinkCode = (childId, code) => {
  return crypto
    .createHmac("sha256", getLinkSecret())
    .update(`${childId}:${code}`)
    .digest("hex");
};

const hashInvitationToken = (token) => {
  return crypto
    .createHmac("sha256", getInvitationSecret())
    .update(String(token || ""))
    .digest("hex");
};

const createInvitationToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

const validateRelationshipKey = (relationshipKey) => {
  const cleanRelationshipKey = String(relationshipKey || "").trim();

  if (!ALLOWED_RELATIONSHIPS.includes(cleanRelationshipKey)) {
    throw createHttpError(
      "El tipo de integrante seleccionado no es válido",
      400,
    );
  }

  return cleanRelationshipKey;
};

/* -------------------------------------------------------------------------- */
/* NIÑOS ASOCIADOS AL ADULTO                                                  */
/* -------------------------------------------------------------------------- */

const getChildrenByParent = async (parentId) => {
  const cleanParentId = validatePositiveInteger(parentId, "Cuidador");

  const result = await pool.query(
    `
    SELECT
      c.id,
      c."firstName",
      c."lastName",
      c.email,
      c.avatar,
      c.role,

      pc.relationship_key,
      pc.access_profile,
      pc.can_manage_team,
      pc.status,
      pc.accepted_at

    FROM "FloFlo".parent_child pc

    JOIN "FloFlo"."user" c
      ON c.id = pc.child_id

    WHERE pc.parent_id = $1
      AND c.role = 'child'
      AND pc.status = 'active'

    ORDER BY c."firstName" ASC
    `,
    [cleanParentId],
  );

  return result.rows;
};

/* -------------------------------------------------------------------------- */
/* CÓDIGO DE VINCULACIÓN ACTUAL                                               */
/* -------------------------------------------------------------------------- */

const createChildLinkCode = async (childId) => {
  const cleanChildId = validatePositiveInteger(childId, "Niño/a");

  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = hashLinkCode(cleanChildId, code);

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
      [cleanChildId],
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
      [cleanChildId, codeHash, LINK_CODE_TTL_MINUTES],
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
  const cleanParentId = validatePositiveInteger(parentId, "Cuidador");
  const normalizedEmail = normalizeEmail(childEmail);
  const normalizedCode = normalizeCode(linkCode);

  if (!normalizedEmail || !normalizedCode) {
    throw createHttpError(
      "Debes ingresar correo del niño/a y código",
      400,
    );
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

    if (cleanParentId === Number(child.id)) {
      throw createHttpError(
        "Un cuidador no puede asociarse a sí mismo",
        400,
      );
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
      FOR UPDATE
      `,
      [child.id, codeHash],
    );

    if (codeResult.rows.length === 0) {
      throw createHttpError(
        "No se pudo vincular. Revisa el correo y el código.",
        400,
      );
    }

    const existingTeamResult = await client.query(
      `
      SELECT 1
      FROM "FloFlo".parent_child
      WHERE child_id = $1
        AND status = 'active'
      LIMIT 1
      `,
      [child.id],
    );

    const isFirstTeamMember = existingTeamResult.rows.length === 0;

    const relationshipKey = isFirstTeamMember
      ? "primary_caregiver"
      : "caregiver";

    const accessProfile = isFirstTeamMember
      ? "primary_caregiver"
      : "caregiver";

    const canManageTeam = isFirstTeamMember;

    const relationResult = await client.query(
      `
      INSERT INTO "FloFlo".parent_child
      (
        parent_id,
        child_id,
        relationship_key,
        access_profile,
        can_manage_team,
        accepted_at,
        status
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), 'active')

      ON CONFLICT (parent_id, child_id)
      DO UPDATE SET
        status = 'active',
        accepted_at = COALESCE(
          "FloFlo".parent_child.accepted_at,
          NOW()
        )

      RETURNING *
      `,
      [
        cleanParentId,
        child.id,
        relationshipKey,
        accessProfile,
        canManageTeam,
      ],
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
      relation: relationResult.rows[0],
      linked: true,
      alreadyLinked: false,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

/* -------------------------------------------------------------------------- */
/* AUTORIZACIÓN                                                               */
/* -------------------------------------------------------------------------- */

const isChildLinkedToParent = async (parentId, childId) => {
  const cleanParentId = validatePositiveInteger(parentId, "Cuidador");
  const cleanChildId = validatePositiveInteger(childId, "Niño/a");

  const result = await pool.query(
    `
    SELECT 1
    FROM "FloFlo".parent_child pc

    JOIN "FloFlo"."user" c
      ON c.id = pc.child_id

    WHERE pc.parent_id = $1
      AND pc.child_id = $2
      AND pc.status = 'active'
      AND c.role = 'child'

    LIMIT 1
    `,
    [cleanParentId, cleanChildId],
  );

  return result.rows.length > 0;
};

const assertChildBelongsToParent = async (parentId, childId) => {
  const linked = await isChildLinkedToParent(parentId, childId);

  if (!linked) {
    throw createHttpError(
      "No tienes permiso para acceder a este niño/a",
      403,
    );
  }

  return true;
};

const assertCanManageTeam = async (parentId, childId) => {
  const cleanParentId = validatePositiveInteger(parentId, "Cuidador");
  const cleanChildId = validatePositiveInteger(childId, "Niño/a");

  const result = await pool.query(
    `
    SELECT
      pc.id,
      pc.can_manage_team,
      pc.relationship_key,
      pc.access_profile

    FROM "FloFlo".parent_child pc

    WHERE pc.parent_id = $1
      AND pc.child_id = $2
      AND pc.status = 'active'
      AND pc.can_manage_team = TRUE

    LIMIT 1
    `,
    [cleanParentId, cleanChildId],
  );

  if (result.rows.length === 0) {
    throw createHttpError(
      "No tienes permiso para administrar el Equipo FloFlo",
      403,
    );
  }

  return result.rows[0];
};

/* -------------------------------------------------------------------------- */
/* EQUIPO FLOFLO                                                              */
/* -------------------------------------------------------------------------- */

const getSupportTeam = async (requesterId, childId) => {
  const cleanRequesterId = validatePositiveInteger(
    requesterId,
    "Cuidador",
  );

  const cleanChildId = validatePositiveInteger(childId, "Niño/a");

  await assertChildBelongsToParent(cleanRequesterId, cleanChildId);

  const result = await pool.query(
    `
    SELECT
      pc.id AS membership_id,
      pc.parent_id AS user_id,
      pc.child_id,
      pc.relationship_key,
      pc.access_profile,
      pc.can_manage_team,
      pc.invited_by,
      pc.accepted_at,
      pc.status,
      pc.created_at,

      u."firstName",
      u."lastName",
      u.email,
      u.avatar

    FROM "FloFlo".parent_child pc

    JOIN "FloFlo"."user" u
      ON u.id = pc.parent_id

    WHERE pc.child_id = $1
      AND pc.status = 'active'
      AND u.role = 'parent'

    ORDER BY
      pc.can_manage_team DESC,
      pc.created_at ASC
    `,
    [cleanChildId],
  );

  return result.rows;
};

/* -------------------------------------------------------------------------- */
/* CREAR INVITACIÓN                                                           */
/* -------------------------------------------------------------------------- */

const createSupportTeamInvitation = async ({
  invitedBy,
  childId,
  email,
  relationshipKey,
  message,
}) => {
  const cleanInvitedBy = validatePositiveInteger(
    invitedBy,
    "Usuario que invita",
  );

  const cleanChildId = validatePositiveInteger(childId, "Niño/a");
  const cleanEmail = normalizeEmail(email);

  const cleanRelationshipKey =
    validateRelationshipKey(relationshipKey);

  const accessProfile =
    RELATIONSHIP_PROFILES[cleanRelationshipKey];

  const cleanMessage = String(message || "").trim().slice(0, 1000);

  if (!cleanEmail) {
    throw createHttpError(
      "Debes ingresar el correo de la persona invitada",
      400,
    );
  }

  await assertCanManageTeam(cleanInvitedBy, cleanChildId);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const childResult = await client.query(
      `
      SELECT id, "firstName", "lastName", email
      FROM "FloFlo"."user"
      WHERE id = $1
        AND role = 'child'
      LIMIT 1
      `,
      [cleanChildId],
    );

    if (childResult.rows.length === 0) {
      throw createHttpError("No se encontró el niño/a", 404);
    }

    const inviterResult = await client.query(
      `
      SELECT id, "firstName", "lastName", email
      FROM "FloFlo"."user"
      WHERE id = $1
        AND role = 'parent'
      LIMIT 1
      `,
      [cleanInvitedBy],
    );

    if (inviterResult.rows.length === 0) {
      throw createHttpError(
        "No se encontró la cuenta que envía la invitación",
        404,
      );
    }

    const inviter = inviterResult.rows[0];

    if (normalizeEmail(inviter.email) === cleanEmail) {
      throw createHttpError(
        "No puedes enviarte una invitación a ti mismo/a",
        400,
      );
    }

    const existingMemberResult = await client.query(
      `
      SELECT pc.id
      FROM "FloFlo".parent_child pc

      JOIN "FloFlo"."user" u
        ON u.id = pc.parent_id

      WHERE pc.child_id = $1
        AND LOWER(u.email) = $2
        AND pc.status = 'active'

      LIMIT 1
      `,
      [cleanChildId, cleanEmail],
    );

    if (existingMemberResult.rows.length > 0) {
      throw createHttpError(
        "Esta persona ya forma parte del Equipo FloFlo",
        409,
      );
    }

    await client.query(
      `
      UPDATE "FloFlo".support_team_invitation
      SET status = 'cancelled'
      WHERE child_id = $1
        AND LOWER(email) = $2
        AND status = 'pending'
      `,
      [cleanChildId, cleanEmail],
    );

    const token = createInvitationToken();
    const tokenHash = hashInvitationToken(token);

    const invitationResult = await client.query(
      `
      INSERT INTO "FloFlo".support_team_invitation
      (
        child_id,
        invited_by,
        email,
        relationship_key,
        access_profile,
        token_hash,
        message,
        expires_at,
        status,
        created_at
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        NOW() + ($8 * INTERVAL '1 day'),
        'pending',
        NOW()
      )

      RETURNING
        id,
        child_id,
        invited_by,
        email,
        relationship_key,
        access_profile,
        message,
        expires_at,
        status,
        created_at
      `,
      [
        cleanChildId,
        cleanInvitedBy,
        cleanEmail,
        cleanRelationshipKey,
        accessProfile,
        tokenHash,
        cleanMessage || null,
        TEAM_INVITATION_TTL_DAYS,
      ],
    );

    await client.query("COMMIT");

    return {
      token,
      invitation: invitationResult.rows[0],
      child: childResult.rows[0],
      inviter,
      expiresInDays: TEAM_INVITATION_TTL_DAYS,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

/* -------------------------------------------------------------------------- */
/* CONSULTAR INVITACIÓN                                                       */
/* -------------------------------------------------------------------------- */

const getSupportTeamInvitationByToken = async (token) => {
  const cleanToken = String(token || "").trim();

  if (!cleanToken) {
    throw createHttpError("Invitación inválida", 400);
  }

  const tokenHash = hashInvitationToken(cleanToken);

  await pool.query(
    `
    UPDATE "FloFlo".support_team_invitation
    SET status = 'expired'
    WHERE token_hash = $1
      AND status = 'pending'
      AND expires_at <= NOW()
    `,
    [tokenHash],
  );

  const result = await pool.query(
    `
    SELECT
      sti.id,
      sti.child_id,
      sti.invited_by,
      sti.email,
      sti.relationship_key,
      sti.access_profile,
      sti.message,
      sti.expires_at,
      sti.accepted_at,
      sti.status,
      sti.created_at,

      child."firstName" AS child_first_name,
      child."lastName" AS child_last_name,
      child.avatar AS child_avatar,

      inviter."firstName" AS inviter_first_name,
      inviter."lastName" AS inviter_last_name

    FROM "FloFlo".support_team_invitation sti

    JOIN "FloFlo"."user" child
      ON child.id = sti.child_id

    JOIN "FloFlo"."user" inviter
      ON inviter.id = sti.invited_by

    WHERE sti.token_hash = $1

    LIMIT 1
    `,
    [tokenHash],
  );

  if (result.rows.length === 0) {
    throw createHttpError(
      "La invitación no existe o ya no está disponible",
      404,
    );
  }

  const invitation = result.rows[0];

  if (invitation.status === "expired") {
    throw createHttpError("La invitación ha expirado", 410);
  }

  if (invitation.status === "cancelled") {
    throw createHttpError("La invitación fue cancelada", 410);
  }

  if (invitation.status === "accepted") {
    throw createHttpError(
      "La invitación ya fue aceptada",
      409,
    );
  }

  return invitation;
};

/* -------------------------------------------------------------------------- */
/* ACEPTAR INVITACIÓN                                                         */
/* -------------------------------------------------------------------------- */

const acceptSupportTeamInvitation = async ({
  token,
  userId,
  userEmail,
  userRole,
}) => {
  const cleanToken = String(token || "").trim();
  const cleanUserId = validatePositiveInteger(userId, "Usuario");
  const cleanUserEmail = normalizeEmail(userEmail);

  if (!cleanToken) {
    throw createHttpError("Invitación inválida", 400);
  }

  if (userRole !== "parent") {
    throw createHttpError(
      "La invitación debe aceptarse desde una cuenta adulta",
      403,
    );
  }

  const tokenHash = hashInvitationToken(cleanToken);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const invitationResult = await client.query(
      `
      SELECT *
      FROM "FloFlo".support_team_invitation
      WHERE token_hash = $1
      LIMIT 1
      FOR UPDATE
      `,
      [tokenHash],
    );

    if (invitationResult.rows.length === 0) {
      throw createHttpError("Invitación inválida", 404);
    }

    const invitation = invitationResult.rows[0];

    if (invitation.status !== "pending") {
      throw createHttpError(
        "La invitación ya no está disponible",
        409,
      );
    }

    if (new Date(invitation.expires_at) <= new Date()) {
      await client.query(
        `
        UPDATE "FloFlo".support_team_invitation
        SET status = 'expired'
        WHERE id = $1
        `,
        [invitation.id],
      );

      throw createHttpError("La invitación ha expirado", 410);
    }

    if (
      normalizeEmail(invitation.email) !== cleanUserEmail
    ) {
      throw createHttpError(
        "Debes iniciar sesión con el correo que recibió la invitación",
        403,
      );
    }

    const membershipResult = await client.query(
      `
      INSERT INTO "FloFlo".parent_child
      (
        parent_id,
        child_id,
        relationship_key,
        access_profile,
        can_manage_team,
        invited_by,
        accepted_at,
        status
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        FALSE,
        $5,
        NOW(),
        'active'
      )

      ON CONFLICT (parent_id, child_id)
      DO UPDATE SET
        relationship_key = EXCLUDED.relationship_key,
        access_profile = EXCLUDED.access_profile,
        invited_by = EXCLUDED.invited_by,
        accepted_at = NOW(),
        status = 'active'

      RETURNING *
      `,
      [
        cleanUserId,
        invitation.child_id,
        invitation.relationship_key,
        invitation.access_profile,
        invitation.invited_by,
      ],
    );

    await client.query(
      `
      UPDATE "FloFlo".support_team_invitation
      SET
        status = 'accepted',
        accepted_at = NOW(),
        accepted_by = $2
      WHERE id = $1
      `,
      [invitation.id, cleanUserId],
    );

    await client.query("COMMIT");

    return {
      accepted: true,
      membership: membershipResult.rows[0],
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

/* -------------------------------------------------------------------------- */
/* CANCELAR INVITACIÓN                                                        */
/* -------------------------------------------------------------------------- */

const cancelSupportTeamInvitation = async ({
  requesterId,
  childId,
  invitationId,
}) => {
  const cleanRequesterId = validatePositiveInteger(
    requesterId,
    "Cuidador",
  );

  const cleanChildId = validatePositiveInteger(childId, "Niño/a");

  const cleanInvitationId = validatePositiveInteger(
    invitationId,
    "Invitación",
  );

  await assertCanManageTeam(cleanRequesterId, cleanChildId);

  const result = await pool.query(
    `
    UPDATE "FloFlo".support_team_invitation
    SET status = 'cancelled'
    WHERE id = $1
      AND child_id = $2
      AND status = 'pending'
    RETURNING id, status
    `,
    [cleanInvitationId, cleanChildId],
  );

  if (result.rows.length === 0) {
    throw createHttpError(
      "La invitación no existe o ya no está pendiente",
      404,
    );
  }

  return result.rows[0];
};

/* -------------------------------------------------------------------------- */
/* QUITAR INTEGRANTE                                                          */
/* -------------------------------------------------------------------------- */

const removeSupportTeamMember = async ({
  requesterId,
  childId,
  memberId,
}) => {
  const cleanRequesterId = validatePositiveInteger(
    requesterId,
    "Cuidador",
  );

  const cleanChildId = validatePositiveInteger(childId, "Niño/a");

  const cleanMemberId = validatePositiveInteger(
    memberId,
    "Integrante",
  );

  await assertCanManageTeam(cleanRequesterId, cleanChildId);

  const memberResult = await pool.query(
    `
    SELECT
      id,
      parent_id,
      relationship_key,
      can_manage_team

    FROM "FloFlo".parent_child

    WHERE id = $1
      AND child_id = $2
      AND status = 'active'

    LIMIT 1
    `,
    [cleanMemberId, cleanChildId],
  );

  if (memberResult.rows.length === 0) {
    throw createHttpError(
      "No se encontró el integrante del equipo",
      404,
    );
  }

  const member = memberResult.rows[0];

  if (
    member.relationship_key === "primary_caregiver" ||
    member.can_manage_team
  ) {
    throw createHttpError(
      "No puedes eliminar al cuidador principal del Equipo FloFlo",
      400,
    );
  }

  const result = await pool.query(
    `
    UPDATE "FloFlo".parent_child
    SET status = 'inactive'
    WHERE id = $1
      AND child_id = $2
    RETURNING id, parent_id, child_id, status
    `,
    [cleanMemberId, cleanChildId],
  );

  return result.rows[0];
};

module.exports = {
  getChildrenByParent,
  createChildLinkCode,
  linkChildToParent,

  isChildLinkedToParent,
  assertChildBelongsToParent,
  assertCanManageTeam,

  getSupportTeam,
  createSupportTeamInvitation,
  getSupportTeamInvitationByToken,
  acceptSupportTeamInvitation,
  cancelSupportTeamInvitation,
  removeSupportTeamMember,
};
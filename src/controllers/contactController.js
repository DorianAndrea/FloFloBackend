const pool = require("../database/db");

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const validatePositiveInteger = (value, label) => {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw createHttpError(`${label} inválido`, 400);
  }

  return numberValue;
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
    INNER JOIN "FloFlo"."user" child
      ON child.id = pc.child_id
    WHERE pc.parent_id = $1
      AND pc.child_id = $2
      AND pc.status = 'active'
      AND child.role = 'child'
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

const resolveContactOwnerId = async (
  req,
  client = pool,
) => {
  const loggedUserId = validatePositiveInteger(
    req.user.id,
    "Usuario",
  );

  const childIdParam = req.params.childId;

  if (!childIdParam) {
    if (req.user.role !== "child") {
      throw createHttpError(
        "Esta ruta es solo para cuentas de niño/a. Las cuentas adultas deben usar /children/:childId",
        403,
      );
    }

    return {
      ownerId: loggedUserId,
      actorId: loggedUserId,
      isAdultManagingChild: false,
      accessProfile: "child",
      relationshipKey: "child",
      canManageTeam: false,
    };
  }

  const childId = validatePositiveInteger(
    childIdParam,
    "Niño/a",
  );

  if (req.user.role !== "parent") {
    throw createHttpError(
      "Solo una cuenta adulta puede usar esta ruta",
      403,
    );
  }

  const access = await getAdultChildAccess(
    loggedUserId,
    childId,
    client,
  );

  return {
    ownerId: childId,
    actorId: loggedUserId,
    isAdultManagingChild: true,
    accessProfile: access.access_profile,
    relationshipKey: access.relationship_key,
    canManageTeam: Boolean(access.can_manage_team),
  };
};

const addAccessMetadata = (
  data,
  isAdultManagingChild,
  canManageTeam,
) => ({
  ...data,
  managed_by_parent: isAdultManagingChild,
  managed_by_adult: isAdultManagingChild,
  can_manage_team: canManageTeam,
});

const getContacts = async (req, res) => {
  try {
    const {
      ownerId,
      isAdultManagingChild,
      canManageTeam,
    } = await resolveContactOwnerId(req);

    const search = req.query.search || "";
    const order = req.query.order || "recientes";

    let orderBy = "uc.id DESC";

    if (order === "antiguos") {
      orderBy = "uc.id ASC";
    }

    if (order === "az") {
      orderBy = "LOWER(uc.name) ASC";
    }

    if (order === "za") {
      orderBy = "LOWER(uc.name) DESC";
    }

    const result = await pool.query(
      `
      SELECT
        uc.id,
        uc.user_id,
        uc.name,
        uc.relationship_type_id,
        uc.where_met,
        uc.image,
        uc.memory_note,

        uc.created_by,
        uc.creator_access_profile,
        uc.creator_relationship_key,

        uc.updated_by,
        uc.updater_access_profile,
        uc.updater_relationship_key,

        uc.created_at,
        uc.updated_at,

        rt.relationship_name,

        creator."firstName" AS creator_first_name,
        creator."lastName" AS creator_last_name,
        creator.avatar AS creator_avatar,

        updater."firstName" AS updater_first_name,
        updater."lastName" AS updater_last_name,
        updater.avatar AS updater_avatar

      FROM "FloFlo".user_contact uc

      INNER JOIN "FloFlo".relationship_type rt
        ON uc.relationship_type_id = rt.id

      LEFT JOIN "FloFlo"."user" creator
        ON creator.id = uc.created_by

      LEFT JOIN "FloFlo"."user" updater
        ON updater.id = uc.updated_by

      WHERE uc.user_id = $1
        AND (
          $2 = ''

          OR translate(
            LOWER(uc.name),
            'áéíóúÁÉÍÓÚñÑ',
            'aeiouaeiounn'
          ) LIKE translate(
            LOWER('%' || $2 || '%'),
            'áéíóúÁÉÍÓÚñÑ',
            'aeiouaeiounn'
          )

          OR translate(
            LOWER(rt.relationship_name),
            'áéíóúÁÉÍÓÚñÑ',
            'aeiouaeiounn'
          ) LIKE translate(
            LOWER('%' || $2 || '%'),
            'áéíóúÁÉÍÓÚñÑ',
            'aeiouaeiounn'
          )

          OR translate(
            LOWER(COALESCE(uc.where_met, '')),
            'áéíóúÁÉÍÓÚñÑ',
            'aeiouaeiounn'
          ) LIKE translate(
            LOWER('%' || $2 || '%'),
            'áéíóúÁÉÍÓÚñÑ',
            'aeiouaeiounn'
          )

          OR translate(
            LOWER(COALESCE(uc.memory_note, '')),
            'áéíóúÁÉÍÓÚñÑ',
            'aeiouaeiounn'
          ) LIKE translate(
            LOWER('%' || $2 || '%'),
            'áéíóúÁÉÍÓÚñÑ',
            'aeiouaeiounn'
          )
        )

      ORDER BY ${orderBy}
      `,
      [ownerId, search],
    );

    return res.json(
      result.rows.map((contact) =>
        addAccessMetadata(
          contact,
          isAdultManagingChild,
          canManageTeam,
        ),
      ),
    );
  } catch (error) {
    console.error(
      "Error obteniendo contactos:",
      error,
    );

    return res
      .status(error.statusCode || 500)
      .json({
        message:
          error.message ||
          "Error obteniendo contactos",
      });
  }
};

const getContactById = async (req, res) => {
  try {
    const {
      ownerId,
      isAdultManagingChild,
      canManageTeam,
    } = await resolveContactOwnerId(req);

    const id = validatePositiveInteger(
      req.params.id,
      "Contacto",
    );

    const result = await pool.query(
      `
      SELECT
        uc.*,
        rt.relationship_name,

        creator."firstName" AS creator_first_name,
        creator."lastName" AS creator_last_name,
        creator.avatar AS creator_avatar,

        updater."firstName" AS updater_first_name,
        updater."lastName" AS updater_last_name,
        updater.avatar AS updater_avatar

      FROM "FloFlo".user_contact uc

      INNER JOIN "FloFlo".relationship_type rt
        ON uc.relationship_type_id = rt.id

      LEFT JOIN "FloFlo"."user" creator
        ON creator.id = uc.created_by

      LEFT JOIN "FloFlo"."user" updater
        ON updater.id = uc.updated_by

      WHERE uc.id = $1
        AND uc.user_id = $2

      LIMIT 1
      `,
      [id, ownerId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Contacto no encontrado",
      });
    }

    return res.json(
      addAccessMetadata(
        result.rows[0],
        isAdultManagingChild,
        canManageTeam,
      ),
    );
  } catch (error) {
    console.error(
      "Error obteniendo contacto:",
      error,
    );

    return res
      .status(error.statusCode || 500)
      .json({
        message:
          error.message ||
          "Error obteniendo contacto",
      });
  }
};

const createContact = async (req, res) => {
  try {
    const {
      ownerId,
      actorId,
      isAdultManagingChild,
      accessProfile,
      relationshipKey,
      canManageTeam,
    } = await resolveContactOwnerId(req);

    const {
      name,
      relationship_type_id,
      where_met,
      memory_note,
    } = req.body;

    const relationshipTypeId =
      validatePositiveInteger(
        relationship_type_id,
        "Tipo de relación",
      );

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message:
          "El nombre del contacto es obligatorio",
      });
    }

    const image = req.file
      ? req.file.path
      : null;

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".user_contact
      (
        user_id,
        name,
        relationship_type_id,
        where_met,
        image,
        memory_note,

        created_by,
        creator_access_profile,
        creator_relationship_key,

        updated_by,
        updater_access_profile,
        updater_relationship_key,

        created_at,
        updated_at
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
        $8,
        $9,

        $7,
        $8,
        $9,

        NOW(),
        NOW()
      )
      RETURNING *
      `,
      [
        ownerId,
        String(name).trim(),
        relationshipTypeId,
        where_met || "",
        image,
        memory_note || "",

        actorId,
        accessProfile,
        relationshipKey,
      ],
    );

    return res.status(201).json(
      addAccessMetadata(
        result.rows[0],
        isAdultManagingChild,
        canManageTeam,
      ),
    );
  } catch (error) {
    console.error(
      "Error creando contacto:",
      error,
    );

    return res
      .status(error.statusCode || 500)
      .json({
        message:
          error.message ||
          "Error creando contacto",
      });
  }
};

const updateContact = async (req, res) => {
  try {
    const {
      ownerId,
      actorId,
      isAdultManagingChild,
      accessProfile,
      relationshipKey,
      canManageTeam,
    } = await resolveContactOwnerId(req);

    const id = validatePositiveInteger(
      req.params.id,
      "Contacto",
    );

    const {
      name,
      relationship_type_id,
      where_met,
      memory_note,
    } = req.body;

    const relationshipTypeId =
      validatePositiveInteger(
        relationship_type_id,
        "Tipo de relación",
      );

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message:
          "El nombre del contacto es obligatorio",
      });
    }

    const currentContact =
      await pool.query(
        `
        SELECT image
        FROM "FloFlo".user_contact
        WHERE id = $1
          AND user_id = $2
        LIMIT 1
        `,
        [id, ownerId],
      );

    if (
      currentContact.rows.length === 0
    ) {
      return res.status(404).json({
        message: "Contacto no encontrado",
      });
    }

    const currentImage =
      currentContact.rows[0].image;

    const image = req.file
      ? req.file.path
      : currentImage;

    const result = await pool.query(
      `
      UPDATE "FloFlo".user_contact
      SET
        name = $1,
        relationship_type_id = $2,
        where_met = $3,
        image = $4,
        memory_note = $5,

        updated_by = $6,
        updater_access_profile = $7,
        updater_relationship_key = $8,

        updated_at = NOW()

      WHERE id = $9
        AND user_id = $10

      RETURNING *
      `,
      [
        String(name).trim(),
        relationshipTypeId,
        where_met || "",
        image,
        memory_note || "",

        actorId,
        accessProfile,
        relationshipKey,

        id,
        ownerId,
      ],
    );

    return res.json(
      addAccessMetadata(
        result.rows[0],
        isAdultManagingChild,
        canManageTeam,
      ),
    );
  } catch (error) {
    console.error(
      "Error actualizando contacto:",
      error,
    );

    return res
      .status(error.statusCode || 500)
      .json({
        message:
          error.message ||
          "Error actualizando contacto",
      });
  }
};

const deleteContact = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      ownerId,
      isAdultManagingChild,
      canManageTeam,
    } = await resolveContactOwnerId(
      req,
      client,
    );

    if (
      !isAdultManagingChild ||
      !canManageTeam
    ) {
      throw createHttpError(
        "Solo el administrador del grupo puede eliminar contactos",
        403,
      );
    }

    const id = validatePositiveInteger(
      req.params.id,
      "Contacto",
    );

    const contactExists =
      await client.query(
        `
        SELECT id
        FROM "FloFlo".user_contact
        WHERE id = $1
          AND user_id = $2
        LIMIT 1
        `,
        [id, ownerId],
      );

    if (
      contactExists.rows.length === 0
    ) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Persona no encontrada",
      });
    }

    const conversations =
      await client.query(
        `
        SELECT id
        FROM "FloFlo".user_contact_conversation
        WHERE user_contact_id = $1
          AND user_id = $2
        `,
        [id, ownerId],
      );

    const conversationIds =
      conversations.rows.map((row) =>
        Number(row.id),
      );

    if (conversationIds.length > 0) {
      await client.query(
        `
        DELETE FROM "FloFlo".user_contact_conversation_progress
        WHERE contact_conversation_id = ANY($1::int[])
          AND user_id = $2
        `,
        [conversationIds, ownerId],
      );

      await client.query(
        `
        DELETE FROM "FloFlo".conversation_option
        WHERE exercise_id IN (
          SELECT id
          FROM "FloFlo".conversation_exercise
          WHERE conversation_id = ANY($1::int[])
        )
        `,
        [conversationIds],
      );

      await client.query(
        `
        DELETE FROM "FloFlo".conversation_exercise
        WHERE conversation_id = ANY($1::int[])
        `,
        [conversationIds],
      );

      await client.query(
        `
        DELETE FROM "FloFlo".conversation_message
        WHERE conversation_id = ANY($1::int[])
        `,
        [conversationIds],
      );

      await client.query(
        `
        DELETE FROM "FloFlo".user_contact_conversation
        WHERE id = ANY($1::int[])
          AND user_id = $2
        `,
        [conversationIds, ownerId],
      );
    }

    const deleted =
      await client.query(
        `
        DELETE FROM "FloFlo".user_contact
        WHERE id = $1
          AND user_id = $2
        RETURNING *
        `,
        [id, ownerId],
      );

    await client.query("COMMIT");

    return res.json({
      message:
        "Persona del niño/a eliminada correctamente",
      managedByParent: true,
      managedByAdult: true,
      canManageTeam: true,
      contact: deleted.rows[0],
    });
  } catch (error) {
    await client
      .query("ROLLBACK")
      .catch(() => {});

    console.error(
      "Error eliminando contacto:",
      error,
    );

    return res
      .status(error.statusCode || 500)
      .json({
        message:
          error.message ||
          "Error eliminando contacto",
      });
  } finally {
    client.release();
  }
};

module.exports = {
  getContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
};
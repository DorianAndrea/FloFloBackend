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

const assertParentCanAccessChild = async (parentId, childId, client = pool) => {
  const result = await client.query(
    `
    SELECT pc.child_id
    FROM "FloFlo".parent_child pc
    INNER JOIN "FloFlo"."user" u
      ON u.id = pc.child_id
    WHERE pc.parent_id = $1
    AND pc.child_id = $2
    AND u.role = 'child'
    LIMIT 1
    `,
    [parentId, childId],
  );

  if (result.rows.length === 0) {
    throw createHttpError("No tienes permiso para acceder a este niño/a", 403);
  }

  return true;
};

const resolveContactOwnerId = async (req, client = pool) => {
  const loggedUserId = validatePositiveInteger(req.user.id, "Usuario");
  const childIdParam = req.params.childId;

  if (!childIdParam) {
    if (req.user.role !== "child") {
      throw createHttpError(
        "Esta ruta es solo para cuentas de niño/a. Los cuidadores deben usar /children/:childId",
        403,
      );
    }

    return {
      ownerId: loggedUserId,
      isParentManagingChild: false,
    };
  }

  const childId = validatePositiveInteger(childIdParam, "Niño/a");

  if (req.user.role !== "parent") {
    throw createHttpError("Solo un padre/cuidador puede usar esta ruta", 403);
  }

  await assertParentCanAccessChild(loggedUserId, childId, client);

  return {
    ownerId: childId,
    loggedUserId,
    isParentManagingChild: true,
  };
};

const getContacts = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } = await resolveContactOwnerId(req);
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
        uc.created_at,
        uc.updated_at,
        rt.relationship_name
      FROM "FloFlo".user_contact uc
      INNER JOIN "FloFlo".relationship_type rt
        ON uc.relationship_type_id = rt.id
      WHERE uc.user_id = $1
      AND (
        $2 = ''
        OR translate(LOWER(uc.name), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $2 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
        OR translate(LOWER(rt.relationship_name), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $2 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
        OR translate(LOWER(uc.where_met), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $2 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
        OR translate(LOWER(COALESCE(uc.memory_note, '')), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $2 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
      )
      ORDER BY ${orderBy}
      `,
      [ownerId, search],
    );

    res.json(
      result.rows.map((contact) => ({
        ...contact,
        managed_by_parent: isParentManagingChild,
      })),
    );
  } catch (error) {
    console.error("Error obteniendo contactos:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const getContactById = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } = await resolveContactOwnerId(req);
    const id = validatePositiveInteger(req.params.id, "Contacto");

    const result = await pool.query(
      `
      SELECT
        uc.*,
        rt.relationship_name
      FROM "FloFlo".user_contact uc
      INNER JOIN "FloFlo".relationship_type rt
        ON uc.relationship_type_id = rt.id
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

    res.json({
      ...result.rows[0],
      managed_by_parent: isParentManagingChild,
    });
  } catch (error) {
    console.error("Error obteniendo contacto:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const createContact = async (req, res) => {
  try {
    const { name, relationship_type_id, where_met, memory_note } = req.body;

    const relationshipTypeId = validatePositiveInteger(
      relationship_type_id,
      "Tipo de relación",
    );

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: "El nombre del contacto es obligatorio",
      });
    }

    const image = req.file ? req.file.path : null;

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".user_contact
      (
        user_id,
        name,
        relationshipTypeId,
        where_met,
        image,
        memory_note,
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
        NOW(),
        NOW()
      )
      RETURNING *
      `,
      [
        ownerId,
        String(name).trim(),
        relationship_type_id,
        where_met || "",
        image,
        memory_note || "",
      ],
    );

    res.status(201).json({
      ...result.rows[0],
      managed_by_parent: isParentManagingChild,
    });
  } catch (error) {
    console.error("Error creando contacto:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const updateContact = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } = await resolveContactOwnerId(req);
    const id = validatePositiveInteger(req.params.id, "Contacto");

    const { name, relationship_type_id, where_met, memory_note } = req.body;

    const relationshipTypeId = validatePositiveInteger(
      relationship_type_id,
      "Tipo de relación",
    );

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: "El nombre del contacto es obligatorio",
      });
    }

    const currentContact = await pool.query(
      `
      SELECT image
      FROM "FloFlo".user_contact
      WHERE id = $1
      AND user_id = $2
      LIMIT 1
      `,
      [id, ownerId],
    );

    if (currentContact.rows.length === 0) {
      return res.status(404).json({
        message: "Contacto no encontrado",
      });
    }

    const currentImage = currentContact.rows[0].image;
    const image = req.file ? req.file.path : currentImage;

    const result = await pool.query(
      `
      UPDATE "FloFlo".user_contact
      SET
        name = $1,
        relationship_type_id = $2,
        where_met = $3,
        image = $4,
        memory_note = $5,
        updated_at = NOW()
      WHERE id = $6
      AND user_id = $7
      RETURNING *
      `,
      [
        String(name).trim(),
        relationshipTypeId,
        where_met || "",
        image,
        memory_note || "",
        id,
        ownerId,
      ],
    );

    res.json({
      ...result.rows[0],
      managed_by_parent: isParentManagingChild,
    });
  } catch (error) {
    console.error("Error actualizando contacto:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const deleteContact = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { ownerId, isParentManagingChild } = await resolveContactOwnerId(
      req,
      client,
    );

    const id = validatePositiveInteger(req.params.id, "Contacto");

    const contactExists = await client.query(
      `
      SELECT id
      FROM "FloFlo".user_contact
      WHERE id = $1
      AND user_id = $2
      LIMIT 1
      `,
      [id, ownerId],
    );

    if (contactExists.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Persona no encontrada",
      });
    }

    const conversations = await client.query(
      `
      SELECT id
      FROM "FloFlo".user_contact_conversation
      WHERE user_contact_id = $1
      AND user_id = $2
      `,
      [id, ownerId],
    );

    const conversationIds = conversations.rows.map((row) => Number(row.id));

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

    const deleted = await client.query(
      `
      DELETE FROM "FloFlo".user_contact
      WHERE id = $1
      AND user_id = $2
      RETURNING *
      `,
      [id, ownerId],
    );

    await client.query("COMMIT");

    res.json({
      message: isParentManagingChild
        ? "Persona del niño/a eliminada correctamente"
        : "Persona eliminada correctamente",
      managedByParent: isParentManagingChild,
      contact: deleted.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error eliminando contacto:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
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

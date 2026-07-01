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

const calculateLevel = (points) => {
  if (points >= 100) return 5;
  if (points >= 50) return 4;
  if (points >= 25) return 3;
  if (points >= 10) return 2;
  return 1;
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

const resolveConversationOwnerId = async (req, client = pool) => {
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

const validateContactOwnership = async (contactId, ownerId, client = pool) => {
  const result = await client.query(
    `
    SELECT id
    FROM "FloFlo".user_contact
    WHERE id = $1
    AND user_id = $2
    LIMIT 1
    `,
    [contactId, ownerId],
  );

  return result.rows.length > 0;
};

const validateConversationOwnership = async (
  conversationId,
  ownerId,
  client = pool,
) => {
  const result = await client.query(
    `
    SELECT id
    FROM "FloFlo".user_contact_conversation
    WHERE id = $1
    AND user_id = $2
    LIMIT 1
    `,
    [conversationId, ownerId],
  );

  return result.rows.length > 0;
};

const getAllContactConversations = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } =
      await resolveConversationOwnerId(req);

    const result = await pool.query(
      `
      SELECT *
      FROM "FloFlo".user_contact_conversation
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [ownerId],
    );

    res.json(
      result.rows.map((conversation) => ({
        ...conversation,
        managed_by_parent: isParentManagingChild,
      })),
    );
  } catch (error) {
    console.error("Error obteniendo conversaciones:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo conversaciones",
    });
  }
};

const createContactConversation = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } =
      await resolveConversationOwnerId(req);

    const {
      contact_id,
      contactId,
      user_contact_id,
      userContactId,
      title,
      situation,
      what_to_say,
      whatToSay,
      correct_answer,
      wrong_answer_1,
      wrong_answer_2,
      reminder,
    } = req.body;

    if (
      !title ||
      !String(title).trim() ||
      !situation ||
      !String(situation).trim() ||
      !finalWhatToSay ||
      !String(finalWhatToSay).trim()
    ) {
      return res.status(400).json({
        message: "contact_id, title, situation y what_to_say son obligatorios",
      });
    }

    const finalWhatToSay = what_to_say || whatToSay;

    if (!finalContactId || !title || !situation || !finalWhatToSay) {
      return res.status(400).json({
        message: "contact_id, title, situation y what_to_say son obligatorios",
      });
    }

    const ownsContact = await validateContactOwnership(finalContactId, ownerId);

    if (!ownsContact) {
      return res.status(404).json({
        message: "Contacto no encontrado para este usuario",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".user_contact_conversation (
        user_id,
        user_contact_id,
        title,
        situation,
        what_to_say,
        correct_answer,
        wrong_answer_1,
        wrong_answer_2,
        reminder,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING *
      `,
      [
        ownerId,
        finalContactId,
        title,
        situation,
        finalWhatToSay,
        correct_answer || null,
        wrong_answer_1 || null,
        wrong_answer_2 || null,
        reminder || null,
      ],
    );

    res.status(201).json({
      message: isParentManagingChild
        ? "Conversación creada correctamente para el niño/a"
        : "Conversación creada correctamente",
      managedByParent: isParentManagingChild,
      conversation: {
        ...result.rows[0],
        managed_by_parent: isParentManagingChild,
      },
    });
  } catch (error) {
    console.error("Error creando conversación:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const getContactConversationsByContactId = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } =
      await resolveConversationOwnerId(req);

    const contactId = validatePositiveInteger(req.params.contactId, "Contacto");

    const ownsContact = await validateContactOwnership(contactId, ownerId);

    if (!ownsContact) {
      return res.status(404).json({
        message: "Contacto no encontrado para este usuario",
      });
    }

    const result = await pool.query(
      `
      SELECT *
      FROM "FloFlo".user_contact_conversation
      WHERE user_id = $1
      AND user_contact_id = $2
      ORDER BY created_at DESC
      `,
      [ownerId, contactId],
    );

    res.json(
      result.rows.map((conversation) => ({
        ...conversation,
        managed_by_parent: isParentManagingChild,
      })),
    );
  } catch (error) {
    console.error("Error obteniendo conversaciones del contacto:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const getContactConversationProgress = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } =
      await resolveConversationOwnerId(req);

    const result = await pool.query(
      `
      SELECT
        p.contact_conversation_id,
        p.completed_at
    FROM "FloFlo".user_contact_conversation_progress p
    INNER JOIN "FloFlo".user_contact_conversation c
      ON c.id = p.contact_conversation_id
      AND c.user_id = p.user_id
    WHERE p.user_id = $1
    ORDER BY p.completed_at DESC
      `,
      [ownerId],
    );

    res.json(
      result.rows.map((progress) => ({
        ...progress,
        managed_by_parent: isParentManagingChild,
      })),
    );
  } catch (error) {
    console.error(
      "Error obteniendo progreso de conversaciones de contacto:",
      error,
    );

    res.status(error.statusCode || 500).json({
      message:
        error.message ||
        "Error obteniendo progreso de conversaciones de contacto",
    });
  }
};

const completeContactConversation = async (req, res) => {
  const client = await pool.connect();

  try {
    const { ownerId, isParentManagingChild } = await resolveConversationOwnerId(
      req,
      client,
    );

    const conversationId = validatePositiveInteger(
      req.params.id,
      "Conversación",
    );

    await client.query("BEGIN");

    const ownsConversation = await validateConversationOwnership(
      conversationId,
      ownerId,
      client,
    );

    if (!ownsConversation) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Conversación no encontrada para este usuario",
      });
    }

    const progressInsert = await client.query(
      `
      INSERT INTO "FloFlo".user_contact_conversation_progress
      (
        user_id,
        contact_conversation_id,
        completed_at
      )
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id, contact_conversation_id)
      DO NOTHING
      RETURNING *
      `,
      [ownerId, conversationId],
    );

    const alreadyCompleted = progressInsert.rows.length === 0;

    let progressResult;

    if (!alreadyCompleted) {
      const currentProgress = await client.query(
        `
        SELECT *
        FROM "FloFlo".user_progress
        WHERE user_id = $1
        LIMIT 1
        `,
        [ownerId],
      );

      if (currentProgress.rows.length > 0) {
        const newPoints = Number(currentProgress.rows[0].points || 0) + 10;

        progressResult = await client.query(
          `
          UPDATE "FloFlo".user_progress
          SET
            completed_conversations = COALESCE(completed_conversations, 0) + 1,
            points = $1,
            level = $2,
            updated_at = NOW()
          WHERE user_id = $3
          RETURNING *
          `,
          [newPoints, calculateLevel(newPoints), ownerId],
        );
      } else {
        progressResult = await client.query(
          `
          INSERT INTO "FloFlo".user_progress
          (
            user_id,
            points,
            level,
            completed_conversations,
            completed_places,
            completed_routines,
            completed_moods,
            created_at,
            updated_at
          )
          VALUES
          (
            $1,
            10,
            $2,
            1,
            0,
            0,
            0,
            NOW(),
            NOW()
          )
          RETURNING *
          `,
          [ownerId, calculateLevel(10)],
        );
      }
    } else {
      progressResult = await client.query(
        `
        SELECT *
        FROM "FloFlo".user_progress
        WHERE user_id = $1
        LIMIT 1
        `,
        [ownerId],
      );
    }

    await client.query("COMMIT");

    res.json({
      message: alreadyCompleted
        ? "Conversación ya estaba completada"
        : isParentManagingChild
          ? "Conversación del niño/a completada correctamente"
          : "Conversación completada correctamente",
      conversationId,
      alreadyCompleted,
      managedByParent: isParentManagingChild,
      progress: progressResult.rows[0] || null,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error completando conversación:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error completando conversación",
    });
  } finally {
    client.release();
  }
};

const toggleFavoriteContactConversation = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } =
      await resolveConversationOwnerId(req);

    const conversationId = validatePositiveInteger(
      req.params.id,
      "Conversación",
    );

    const result = await pool.query(
      `
      UPDATE "FloFlo".user_contact_conversation
      SET
        is_favorite = NOT COALESCE(is_favorite, false),
        updated_at = NOW()
      WHERE id = $1
      AND user_id = $2
      RETURNING *
      `,
      [conversationId, ownerId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Conversación no encontrada para este usuario",
      });
    }

    res.json({
      message: result.rows[0].is_favorite
        ? "Conversación marcada como favorita"
        : "Conversación quitada de favoritas",
      managedByParent: isParentManagingChild,
      conversation: {
        ...result.rows[0],
        managed_by_parent: isParentManagingChild,
      },
    });
  } catch (error) {
    console.error(
      "Error cambiando favorito de conversación de contacto:",
      error,
    );

    res.status(error.statusCode || 500).json({
      message: error.message || "Error actualizando favorito",
    });
  }
};

const updateContactConversation = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } =
      await resolveConversationOwnerId(req);

    const id = validatePositiveInteger(req.params.id, "Conversación");

    const {
      contact_id,
      contactId,
      user_contact_id,
      userContactId,
      title,
      situation,
      what_to_say,
      whatToSay,
      reminder,
      correct_answer,
      wrong_answer_1,
      wrong_answer_2,
    } = req.body;

    const finalContactId = validatePositiveInteger(
      contact_id || contactId || user_contact_id || userContactId,
      "Contacto",
    );

    const finalWhatToSay = what_to_say || whatToSay;

    if (!finalContactId || !title || !situation || !finalWhatToSay) {
      return res.status(400).json({
        message: "contact_id, title, situation y what_to_say son obligatorios",
      });
    }

    const ownsConversation = await validateConversationOwnership(id, ownerId);

    if (!ownsConversation) {
      return res.status(404).json({
        message: "Conversación no encontrada para este usuario",
      });
    }

    const ownsContact = await validateContactOwnership(finalContactId, ownerId);

    if (!ownsContact) {
      return res.status(404).json({
        message: "Contacto no encontrado para este usuario",
      });
    }

    const result = await pool.query(
      `
      UPDATE "FloFlo".user_contact_conversation
      SET
        user_contact_id = $1,
        title = $2,
        situation = $3,
        what_to_say = $4,
        reminder = $5,
        correct_answer = $6,
        wrong_answer_1 = $7,
        wrong_answer_2 = $8,
        updated_at = NOW()
      WHERE id = $9
      AND user_id = $10
      RETURNING *
      `,
      [
        finalContactId,
        title,
        situation,
        finalWhatToSay,
        reminder || null,
        correct_answer || null,
        wrong_answer_1 || null,
        wrong_answer_2 || null,
        id,
        ownerId,
      ],
    );

    res.json({
      ...result.rows[0],
      managed_by_parent: isParentManagingChild,
    });
  } catch (error) {
    console.error("Error actualizando conversación de contacto:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const deleteContactConversation = async (req, res) => {
  const client = await pool.connect();

  try {
    const { ownerId, isParentManagingChild } = await resolveConversationOwnerId(
      req,
      client,
    );

    const id = validatePositiveInteger(req.params.id, "Conversación");

    await client.query("BEGIN");

    const ownsConversation = await validateConversationOwnership(
      id,
      ownerId,
      client,
    );

    if (!ownsConversation) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Conversación no encontrada para este usuario",
      });
    }

    await client.query(
      `
      DELETE FROM "FloFlo".user_contact_conversation_progress
      WHERE contact_conversation_id = $1
      AND user_id = $2
      `,
      [id, ownerId],
    );

    const deleted = await client.query(
      `
      DELETE FROM "FloFlo".user_contact_conversation
      WHERE id = $1
      AND user_id = $2
      RETURNING *
      `,
      [id, ownerId],
    );

    await client.query("COMMIT");

    res.json({
      message: isParentManagingChild
        ? "Conversación del niño/a eliminada correctamente"
        : "Conversación eliminada correctamente",
      managedByParent: isParentManagingChild,
      conversation: deleted.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error eliminando conversación de contacto:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getAllContactConversations,
  getContactConversationsByContactId,
  createContactConversation,
  updateContactConversation,
  deleteContactConversation,
  completeContactConversation,
  getContactConversationProgress,
  toggleFavoriteContactConversation,
};

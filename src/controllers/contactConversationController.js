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

/*
 * Obtiene la relación activa entre una cuenta adulta y el niño/a.
 *
 * Todos los perfiles asociados pueden crear y editar.
 * can_manage_team se utiliza solamente para restringir la eliminación.
 */
const getAdultChildAccess = async (adultId, childId, client = pool) => {
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
    throw createHttpError("No tienes permiso para acceder a este niño/a", 403);
  }

  return result.rows[0];
};

/*
 * Determina:
 *
 * ownerId: niño/a propietario de la conversación.
 * actorId: usuario que está realizando la acción.
 * accessProfile: perfil general del autor.
 * relationshipKey: perfil específico del autor.
 * canManageTeam: indica si administra el grupo.
 */
const resolveConversationOwnerId = async (req, client = pool) => {
  const loggedUserId = validatePositiveInteger(req.user.id, "Usuario");

  const childIdParam = req.params.childId;

  /*
   * Ruta usada directamente por una cuenta de niño/a.
   */
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
      loggedUserId,
      isParentManagingChild: false,
      accessProfile: "child",
      relationshipKey: "child",
      canManageTeam: false,
    };
  }

  /*
   * Ruta usada por una cuenta adulta asociada al niño/a.
   */
  const childId = validatePositiveInteger(childIdParam, "Niño/a");

  if (req.user.role !== "parent") {
    throw createHttpError("Solo una cuenta adulta puede usar esta ruta", 403);
  }

  const access = await getAdultChildAccess(loggedUserId, childId, client);

  return {
    ownerId: childId,
    actorId: loggedUserId,
    loggedUserId,
    isParentManagingChild: true,
    accessProfile: access.access_profile,
    relationshipKey: access.relationship_key,
    canManageTeam: Boolean(access.can_manage_team),
  };
};

/*
 * Información adicional utilizada por el frontend.
 */
const addAccessMetadata = (
  conversation,
  isParentManagingChild,
  canManageTeam,
) => ({
  ...conversation,

  managed_by_parent: Boolean(conversation.managed_by_parent),

  managed_by_adult: Boolean(conversation.managed_by_parent),

  opened_by_adult: Boolean(isParentManagingChild),

  can_manage_team: Boolean(canManageTeam),
});

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

/*
 * Lista todas las conversaciones asociadas a contactos.
 */
const getAllContactConversations = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild, canManageTeam } =
      await resolveConversationOwnerId(req);

    const result = await pool.query(
      `
      SELECT
        ucc.*,
        uc.name AS contact_name,
        uc.image AS contact_image

      FROM "FloFlo".user_contact_conversation ucc

      LEFT JOIN "FloFlo".user_contact uc
        ON uc.id = ucc.user_contact_id
        AND uc.user_id = ucc.user_id

      WHERE ucc.user_id = $1
        AND ucc.user_contact_id IS NOT NULL

      ORDER BY COALESCE(
        ucc.updated_at,
        ucc.created_at
      ) DESC
      `,
      [ownerId],
    );

    return res.json(
      result.rows.map((conversation) =>
        addAccessMetadata(conversation, isParentManagingChild, canManageTeam),
      ),
    );
  } catch (error) {
    console.error("Error obteniendo conversaciones:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo conversaciones",
    });
  }
};

/*
 * Crea una conversación asociada a un contacto.
 *
 * Todos los perfiles asociados pueden crear.
 */
const createContactConversation = async (req, res) => {
  try {
    const {
      ownerId,
      actorId,
      isParentManagingChild,
      accessProfile,
      relationshipKey,
      canManageTeam,
    } = await resolveConversationOwnerId(req);

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

    const finalContactId = validatePositiveInteger(
      contact_id || contactId || user_contact_id || userContactId,
      "Contacto",
    );

    const finalWhatToSay = what_to_say || whatToSay;

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

    const ownsContact = await validateContactOwnership(finalContactId, ownerId);

    if (!ownsContact) {
      return res.status(404).json({
        message: "Contacto no encontrado para este usuario",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".user_contact_conversation
      (
        user_id,
        user_contact_id,
        title,
        situation,
        what_to_say,
        correct_answer,
        wrong_answer_1,
        wrong_answer_2,
        reminder,
        managed_by_parent,

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
        $10,

        $11,
        $12,
        $13,

        $11,
        $12,
        $13,

        NOW(),
        NOW()
      )
      RETURNING *
      `,
      [
        ownerId,
        finalContactId,
        String(title).trim(),
        String(situation).trim(),
        String(finalWhatToSay).trim(),
        correct_answer || null,
        wrong_answer_1 || null,
        wrong_answer_2 || null,
        reminder || null,
        Boolean(isParentManagingChild),

        actorId,
        accessProfile,
        relationshipKey,
      ],
    );

    return res.status(201).json({
      message: isParentManagingChild
        ? "Conversación creada correctamente para el niño/a"
        : "Conversación creada correctamente",

      managedByParent: Boolean(result.rows[0].managed_by_parent),

      conversation: addAccessMetadata(
        result.rows[0],
        isParentManagingChild,
        canManageTeam,
      ),
    });
  } catch (error) {
    console.error("Error creando conversación:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error creando conversación",
    });
  }
};

/*
 * Lista las conversaciones de un contacto específico.
 */
const getContactConversationsByContactId = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild, canManageTeam } =
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
  SELECT
    ucc.*,

    creator."firstName" AS creator_first_name,
    creator."lastName" AS creator_last_name,

    updater."firstName" AS updater_first_name,
    updater."lastName" AS updater_last_name

  FROM "FloFlo".user_contact_conversation ucc

  LEFT JOIN "FloFlo"."user" creator
    ON creator.id = ucc.created_by

  LEFT JOIN "FloFlo"."user" updater
    ON updater.id = ucc.updated_by

  WHERE ucc.user_id = $1
    AND ucc.user_contact_id = $2

  ORDER BY COALESCE(
    ucc.updated_at,
    ucc.created_at
  ) DESC
  `,
      [ownerId, contactId],
    );

    return res.json(
      result.rows.map((conversation) =>
        addAccessMetadata(conversation, isParentManagingChild, canManageTeam),
      ),
    );
  } catch (error) {
    console.error("Error obteniendo conversaciones del contacto:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo conversaciones del contacto",
    });
  }
};

const getContactConversationProgress = async (req, res) => {
  try {
    const { ownerId } = await resolveConversationOwnerId(req);

    const result = await pool.query(
      `
      SELECT
        p.contact_conversation_id,
        p.completed_at,
        c.managed_by_parent

      FROM "FloFlo".user_contact_conversation_progress p

      INNER JOIN "FloFlo".user_contact_conversation c
        ON c.id = p.contact_conversation_id
        AND c.user_id = p.user_id

      WHERE p.user_id = $1

      ORDER BY p.completed_at DESC
      `,
      [ownerId],
    );

    return res.json(
      result.rows.map((progress) => ({
        ...progress,
        managed_by_parent: Boolean(progress.managed_by_parent),
      })),
    );
  } catch (error) {
    console.error(
      "Error obteniendo progreso de conversaciones de contacto:",
      error,
    );

    return res.status(error.statusCode || 500).json({
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

        ON CONFLICT (
          user_id,
          contact_conversation_id
        )
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
              completed_conversations =
                COALESCE(
                  completed_conversations,
                  0
                ) + 1,

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

    return res.json({
      message: alreadyCompleted
        ? "Conversación ya estaba completada"
        : isParentManagingChild
          ? "Conversación del niño/a completada correctamente"
          : "Conversación completada correctamente",

      conversationId,
      alreadyCompleted,

      progress: progressResult.rows[0] || null,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error completando conversación:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error completando conversación",
    });
  } finally {
    client.release();
  }
};

const toggleFavoriteContactConversation = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild, canManageTeam } =
      await resolveConversationOwnerId(req);

    const conversationId = validatePositiveInteger(
      req.params.id,
      "Conversación",
    );

    const result = await pool.query(
      `
      UPDATE "FloFlo".user_contact_conversation

      SET
        is_favorite =
          NOT COALESCE(is_favorite, false),

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

    return res.json({
      message: result.rows[0].is_favorite
        ? "Conversación marcada como favorita"
        : "Conversación quitada de favoritas",

      managedByParent: Boolean(result.rows[0].managed_by_parent),

      conversation: addAccessMetadata(
        result.rows[0],
        isParentManagingChild,
        canManageTeam,
      ),
    });
  } catch (error) {
    console.error(
      "Error cambiando favorito de conversación de contacto:",
      error,
    );

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error actualizando favorito",
    });
  }
};

/*
 * Actualiza una conversación.
 *
 * Todos los perfiles asociados pueden editar.
 */
const updateContactConversation = async (req, res) => {
  try {
    const {
      ownerId,
      actorId,
      isParentManagingChild,
      accessProfile,
      relationshipKey,
      canManageTeam,
    } = await resolveConversationOwnerId(req);

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

        updated_by = $9,
        updater_access_profile = $10,
        updater_relationship_key = $11,

        updated_at = NOW()

      WHERE id = $12
        AND user_id = $13

      RETURNING *
      `,
      [
        finalContactId,
        String(title).trim(),
        String(situation).trim(),
        String(finalWhatToSay).trim(),
        reminder || null,
        correct_answer || null,
        wrong_answer_1 || null,
        wrong_answer_2 || null,

        actorId,
        accessProfile,
        relationshipKey,

        id,
        ownerId,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Conversación no encontrada para este usuario",
      });
    }

    return res.json(
      addAccessMetadata(result.rows[0], isParentManagingChild, canManageTeam),
    );
  } catch (error) {
    console.error("Error actualizando conversación de contacto:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error actualizando conversación de contacto",
    });
  }
};

/*
 * Elimina una conversación.
 *
 * Solo el administrador del grupo puede eliminar.
 * El niño/a, familiares y profesionales no administradores
 * reciben un error 403.
 */
const deleteContactConversation = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { ownerId, isParentManagingChild, canManageTeam } =
      await resolveConversationOwnerId(req, client);

    if (!isParentManagingChild || !canManageTeam) {
      throw createHttpError(
        "Solo el administrador del grupo puede eliminar conversaciones",
        403,
      );
    }

    const id = validatePositiveInteger(req.params.id, "Conversación");

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

    await client.query(
      `
      DELETE FROM "FloFlo".conversation_progress
      WHERE conversation_id = $1
        AND user_id = $2
      `,
      [id, ownerId],
    );

    await client.query(
      `
      DELETE FROM "FloFlo".conversation_option

      WHERE exercise_id IN (
        SELECT id
        FROM "FloFlo".conversation_exercise
        WHERE conversation_id = $1
      )
      `,
      [id],
    );

    await client.query(
      `
      DELETE FROM "FloFlo".conversation_exercise
      WHERE conversation_id = $1
      `,
      [id],
    );

    await client.query(
      `
      DELETE FROM "FloFlo".conversation_message
      WHERE conversation_id = $1
      `,
      [id],
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

    return res.json({
      message: "Conversación del niño/a eliminada correctamente",

      managedByParent: true,
      managedByAdult: true,
      canManageTeam: true,

      conversation: deleted.rows[0] || null,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error eliminando conversación de contacto:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error eliminando conversación de contacto",
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

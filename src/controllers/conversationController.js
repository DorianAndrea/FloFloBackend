const pool = require("../database/db");

const {
  unlockAchievement,
} = require("../services/achievementService");

const calculateLevel = (points) => {
  if (points >= 100) return 5;
  if (points >= 50) return 4;
  if (points >= 25) return 3;
  if (points >= 10) return 2;
  return 1;
};

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

const resolveConversationOwnerId = async (req, client = pool) => {
  const loggedUserId = validatePositiveInteger(req.user.id, "Usuario");
  const childIdParam = req.params.childId;

  if (!childIdParam) {
    return {
      ownerId: loggedUserId,
      loggedUserId,
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

const getConversationFullData = async (
  conversation,
  isParentManagingChild = false,
) => {
  const messagesResult = await pool.query(
    `
    SELECT *
    FROM "FloFlo".conversation_message
    WHERE conversation_id = $1
    ORDER BY order_number
    `,
    [conversation.id],
  );

  const exerciseResult = await pool.query(
    `
    SELECT *
    FROM "FloFlo".conversation_exercise
    WHERE conversation_id = $1
    LIMIT 1
    `,
    [conversation.id],
  );

  let exercise = null;

  if (exerciseResult.rows.length > 0) {
    const exerciseRow = exerciseResult.rows[0];

    const optionsResult = await pool.query(
      `
      SELECT *
      FROM "FloFlo".conversation_option
      WHERE exercise_id = $1
      ORDER BY id
      `,
      [exerciseRow.id],
    );

    exercise = {
      id: exerciseRow.id,
      question: exerciseRow.question,
      options: optionsResult.rows.map((option) => ({
        id: option.id,
        text: option.option_text,
        isCorrect: option.is_correct,
      })),
    };
  }

  const isContact = conversation.user_contact_id !== null;

  return {
    id: conversation.id,
    tipo: isContact ? "contacto" : "normal",
    user_id: conversation.user_id,
    user_contact_id: conversation.user_contact_id,
    is_favorite: Boolean(conversation.is_favorite),
    contact_name: conversation.contact_name || null,
    contact_image: conversation.contact_image || null,
    title: conversation.title,
    situation: conversation.situation,
    what_to_say: conversation.what_to_say,
    reminder: conversation.reminder,
    correct_answer: conversation.correct_answer,
    wrong_answer_1: conversation.wrong_answer_1,
    wrong_answer_2: conversation.wrong_answer_2,
    messages: messagesResult.rows.map((message) => ({
      id: message.id,
      speaker: message.speaker,
      text: message.message,
      orderNumber: message.order_number,
    })),
    exercise,
    managed_by_parent: isParentManagingChild,
  };
};

const createConversation = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { ownerId, isParentManagingChild } =
      await resolveConversationOwnerId(req, client);

    const { title, situation, what_to_say, reminder, messages, exercise } =
      req.body;

    if (!title || !situation) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "title y situation son obligatorios",
      });
    }

    const conversationResult = await client.query(
      `
      INSERT INTO "FloFlo".user_contact_conversation
      (
        user_id,
        user_contact_id,
        title,
        situation,
        what_to_say,
        reminder,
        created_at,
        updated_at
      )
      VALUES ($1,NULL,$2,$3,$4,$5,NOW(),NOW())
      RETURNING *
      `,
      [ownerId, title, situation, what_to_say || null, reminder || null],
    );

    const conversation = conversationResult.rows[0];

    if (Array.isArray(messages)) {
      for (let i = 0; i < messages.length; i++) {
        await client.query(
          `
          INSERT INTO "FloFlo".conversation_message
          (
            conversation_id,
            speaker,
            message,
            order_number
          )
          VALUES ($1,$2,$3,$4)
          `,
          [conversation.id, messages[i].speaker, messages[i].text, i + 1],
        );
      }
    }

    if (exercise?.question) {
      const exerciseResult = await client.query(
        `
        INSERT INTO "FloFlo".conversation_exercise
        (
          conversation_id,
          question,
          created_at
        )
        VALUES ($1,$2,NOW())
        RETURNING *
        `,
        [conversation.id, exercise.question],
      );

      const savedExercise = exerciseResult.rows[0];

      if (Array.isArray(exercise.options)) {
        for (const option of exercise.options) {
          await client.query(
            `
            INSERT INTO "FloFlo".conversation_option
            (
              exercise_id,
              option_text,
              is_correct
            )
            VALUES ($1,$2,$3)
            `,
            [savedExercise.id, option.text, option.isCorrect],
          );
        }
      }
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: isParentManagingChild
        ? "Conversación creada correctamente para el niño/a"
        : "Conversación creada correctamente",
      managedByParent: isParentManagingChild,
      conversation: {
        ...conversation,
        managed_by_parent: isParentManagingChild,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error creando conversación:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  } finally {
    client.release();
  }
};

const getConversations = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } =
      await resolveConversationOwnerId(req);

    const conversationsResult = await pool.query(
      `
      SELECT
        ucc.*,
        COALESCE(ucc.is_favorite, false) AS is_favorite,
        uc.name AS contact_name,
        uc.image AS contact_image
      FROM "FloFlo".user_contact_conversation ucc
      LEFT JOIN "FloFlo".user_contact uc
        ON ucc.user_contact_id = uc.id
      WHERE ucc.user_id = $1
      ORDER BY ucc.created_at DESC
      `,
      [ownerId],
    );

    const conversations = [];

    for (const conversation of conversationsResult.rows) {
      conversations.push(
        await getConversationFullData(conversation, isParentManagingChild),
      );
    }

    res.json(conversations);
  } catch (error) {
    console.error("Error obteniendo conversaciones:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const completeConversation = async (req, res) => {
  const client = await pool.connect();

  try {
    const { ownerId, isParentManagingChild } =
      await resolveConversationOwnerId(req, client);

    const id = validatePositiveInteger(req.params.id, "Conversación");

    await client.query("BEGIN");

    const conversationResult = await client.query(
      `
      SELECT id
      FROM "FloFlo".user_contact_conversation
      WHERE id = $1
      AND user_id = $2
      LIMIT 1
      `,
      [id, ownerId],
    );

    if (conversationResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Conversación no encontrada",
      });
    }

    const existing = await client.query(
      `
      SELECT *
      FROM "FloFlo".conversation_progress
      WHERE user_id = $1
      AND conversation_id = $2
      LIMIT 1
      `,
      [ownerId, id],
    );

    if (existing.rows.length > 0) {
      await client.query("COMMIT");

      return res.json({
        message: "Conversación ya estaba completada",
        managedByParent: isParentManagingChild,
        progress: existing.rows[0],
        unlockedAchievements: [],
      });
    }

    const result = await client.query(
      `
      INSERT INTO "FloFlo".conversation_progress
      (
        user_id,
        conversation_id,
        completed,
        points,
        completed_at
      )
      VALUES ($1,$2,true,1,NOW())
      RETURNING *
      `,
      [ownerId, id],
    );

    const currentProgress = await client.query(
      `
      SELECT *
      FROM "FloFlo".user_progress
      WHERE user_id = $1
      LIMIT 1
      `,
      [ownerId],
    );

    let newPoints = 1;
    let newLevel = 1;

    if (currentProgress.rows.length > 0) {
      newPoints = Number(currentProgress.rows[0].points || 0) + 1;
      newLevel = calculateLevel(newPoints);

      await client.query(
        `
        UPDATE "FloFlo".user_progress
        SET
          points = $1,
          level = $2,
          completed_conversations = COALESCE(completed_conversations, 0) + 1,
          updated_at = NOW()
        WHERE user_id = $3
        `,
        [newPoints, newLevel, ownerId],
      );
    } else {
      await client.query(
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
          updated_at
        )
        VALUES ($1,$2,$3,1,0,0,0,NOW())
        `,
        [ownerId, 1, 1],
      );
    }

    const completedCount = await client.query(
      `
      SELECT COUNT(*) AS count
      FROM "FloFlo".conversation_progress
      WHERE user_id = $1
      AND completed = true
      `,
      [ownerId],
    );

    const totalCompleted = Number(completedCount.rows[0].count);

    const unlockedAchievements = [];

    const tryUnlockAchievement = async (achievementId) => {
      const unlocked = await unlockAchievement(ownerId, achievementId);

      if (!unlocked) return;

      const achievementResult = await client.query(
        `
        SELECT *
        FROM "FloFlo".achievement
        WHERE id = $1
        `,
        [achievementId],
      );

      if (achievementResult.rows.length > 0) {
        unlockedAchievements.push(achievementResult.rows[0]);
      }
    };

    if (totalCompleted === 1) {
      await tryUnlockAchievement(1);
    }

    if (totalCompleted === 5) {
      await tryUnlockAchievement(2);
    }

    if (totalCompleted === 10) {
      await tryUnlockAchievement(3);
    }

    if (newPoints === 1) {
      await tryUnlockAchievement(4);
    }

    if (newPoints === 10) {
      await tryUnlockAchievement(5);
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: isParentManagingChild
        ? "Conversación del niño/a completada"
        : "Conversación completada",
      managedByParent: isParentManagingChild,
      progress: result.rows[0],
      unlockedAchievements,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error completando conversación:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  } finally {
    client.release();
  }
};

const getConversationProgress = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } =
      await resolveConversationOwnerId(req);

    const result = await pool.query(
      `
      SELECT
        conversation_id,
        points,
        completed,
        completed_at
      FROM "FloFlo".conversation_progress
      WHERE user_id = $1
      AND completed = true
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
    console.error("Error obteniendo progreso de conversaciones:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const getPaginatedConversations = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } =
      await resolveConversationOwnerId(req);

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 6;
    const search = req.query.search || "";
    const order = req.query.order || "recientes";
    const offset = (page - 1) * limit;

    let orderBy = "ucc.is_favorite DESC, ucc.created_at DESC";

    if (order === "antiguos") {
      orderBy = "ucc.is_favorite DESC, ucc.created_at ASC";
    }

    if (order === "az") {
      orderBy = "ucc.is_favorite DESC, LOWER(ucc.title) ASC";
    }

    if (order === "za") {
      orderBy = "ucc.is_favorite DESC, LOWER(ucc.title) DESC";
    }

    const totalResult = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM "FloFlo".user_contact_conversation ucc
      LEFT JOIN "FloFlo".user_contact uc
        ON ucc.user_contact_id = uc.id
      WHERE ucc.user_id = $1
      AND (
        $2 = ''
        OR translate(LOWER(ucc.title), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $2 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
        OR translate(LOWER(ucc.situation), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $2 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
        OR translate(LOWER(COALESCE(uc.name, '')), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $2 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
      )
      `,
      [ownerId, search],
    );

    const total = Number(totalResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    const result = await pool.query(
      `
      SELECT
        ucc.*,
        COALESCE(ucc.is_favorite, false) AS is_favorite,
        uc.name AS contact_name,
        uc.image AS contact_image
      FROM "FloFlo".user_contact_conversation ucc
      LEFT JOIN "FloFlo".user_contact uc
        ON ucc.user_contact_id = uc.id
      WHERE ucc.user_id = $1
      AND (
        $4 = ''
        OR translate(LOWER(ucc.title), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $4 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
        OR translate(LOWER(ucc.situation), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $4 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
        OR translate(LOWER(COALESCE(uc.name, '')), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $4 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
      )
      ORDER BY ${orderBy}
      LIMIT $2 OFFSET $3
      `,
      [ownerId, limit, offset, search],
    );

    const conversations = [];

    for (const conversation of result.rows) {
      conversations.push(
        await getConversationFullData(conversation, isParentManagingChild),
      );
    }

    res.json({
      conversations,
      page,
      limit,
      total,
      totalPages,
      managedByParent: isParentManagingChild,
      ownerId,
    });
  } catch (error) {
    console.error("Error obteniendo conversaciones paginadas:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const toggleFavoriteConversation = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } =
      await resolveConversationOwnerId(req);

    const id = validatePositiveInteger(req.params.id, "Conversación");

    await pool.query(`
      ALTER TABLE "FloFlo".user_contact_conversation
      ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false
    `);

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
      [id, ownerId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Conversación no encontrada",
      });
    }

    res.json({
      ...result.rows[0],
      managed_by_parent: isParentManagingChild,
    });
  } catch (error) {
    console.error("Error actualizando favorito de conversación:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const deleteConversation = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { ownerId, isParentManagingChild } =
      await resolveConversationOwnerId(req, client);

    const id = validatePositiveInteger(req.params.id, "Conversación");

    const exists = await client.query(
      `
      SELECT id
      FROM "FloFlo".user_contact_conversation
      WHERE id = $1
      AND user_id = $2
      `,
      [id, ownerId],
    );

    if (exists.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Conversación no encontrada",
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

    res.json({
      message: isParentManagingChild
        ? "Conversación del niño/a eliminada correctamente"
        : "Conversación eliminada correctamente",
      managedByParent: isParentManagingChild,
      conversation: deleted.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error eliminando conversación:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  } finally {
    client.release();
  }
};

const updateConversation = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { ownerId, isParentManagingChild } =
      await resolveConversationOwnerId(req, client);

    const id = validatePositiveInteger(req.params.id, "Conversación");

    const { title, situation, what_to_say, reminder, messages, exercise } =
      req.body;

    const exists = await client.query(
      `
      SELECT id
      FROM "FloFlo".user_contact_conversation
      WHERE id = $1
      AND user_id = $2
      `,
      [id, ownerId],
    );

    if (exists.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Conversación no encontrada",
      });
    }

    const updatedConversation = await client.query(
      `
      UPDATE "FloFlo".user_contact_conversation
      SET
        title = $1,
        situation = $2,
        what_to_say = $3,
        reminder = $4,
        updated_at = NOW()
      WHERE id = $5
      AND user_id = $6
      RETURNING *
      `,
      [title, situation, what_to_say || null, reminder || null, id, ownerId],
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

    if (Array.isArray(messages)) {
      for (let i = 0; i < messages.length; i++) {
        await client.query(
          `
          INSERT INTO "FloFlo".conversation_message
          (
            conversation_id,
            speaker,
            message,
            order_number
          )
          VALUES ($1,$2,$3,$4)
          `,
          [id, messages[i].speaker, messages[i].text, i + 1],
        );
      }
    }

    if (exercise?.question) {
      const exerciseResult = await client.query(
        `
        INSERT INTO "FloFlo".conversation_exercise
        (
          conversation_id,
          question,
          created_at
        )
        VALUES ($1,$2,NOW())
        RETURNING *
        `,
        [id, exercise.question],
      );

      const savedExercise = exerciseResult.rows[0];

      if (Array.isArray(exercise.options)) {
        for (const option of exercise.options) {
          await client.query(
            `
            INSERT INTO "FloFlo".conversation_option
            (
              exercise_id,
              option_text,
              is_correct
            )
            VALUES ($1,$2,$3)
            `,
            [savedExercise.id, option.text, option.isCorrect],
          );
        }
      }
    }

    await client.query("COMMIT");

    res.json({
      message: isParentManagingChild
        ? "Conversación del niño/a actualizada correctamente"
        : "Conversación actualizada correctamente",
      managedByParent: isParentManagingChild,
      conversation: {
        ...updatedConversation.rows[0],
        managed_by_parent: isParentManagingChild,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error actualizando conversación:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  createConversation,
  getConversations,
  getPaginatedConversations,
  completeConversation,
  getConversationProgress,
  toggleFavoriteConversation,
  deleteConversation,
  updateConversation,
};
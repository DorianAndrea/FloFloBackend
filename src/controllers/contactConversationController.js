const pool = require("../database/db");

const getAllContactConversations = async (req, res) => {
  try {
    const user_id = req.user.id;

    const result = await pool.query(
      `
      SELECT *
      FROM "FloFlo".user_contact_conversation
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [user_id],
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error obteniendo conversaciones:", error);
    res.status(500).json({
      message: "Error obteniendo conversaciones",
    });
  }
};

const createContactConversation = async (req, res) => {
  try {
    const user_id = req.user.id;

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

    const finalContactId = Number(
      contact_id || contactId || user_contact_id || userContactId,
    );

    const finalWhatToSay = what_to_say || whatToSay;

    if (!finalContactId || !title || !situation || !finalWhatToSay) {
      return res.status(400).json({
        message: "contact_id, title, situation y what_to_say son obligatorios",
      });
    }

    const contactResult = await pool.query(
      `
      SELECT id
      FROM "FloFlo".user_contact
      WHERE id = $1
      AND user_id = $2
      LIMIT 1
      `,
      [finalContactId, user_id],
    );

    if (contactResult.rows.length === 0) {
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
        user_id,
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
      message: "Conversación creada correctamente",
      conversation: result.rows[0],
    });
  } catch (error) {
    console.error("Error creando conversación:", error);
    res.status(500).json({
      message: error.message,
    });
  }
};
const getContactConversationsByContactId = async (req, res) => {
  try {
    const user_id = req.user.id;
    const contactId = Number(req.params.contactId);

    if (!Number.isInteger(contactId) || contactId <= 0) {
      return res.status(400).json({
        message: "ID de contacto inválido",
      });
    }

    const contactResult = await pool.query(
      `
      SELECT id
      FROM "FloFlo".user_contact
      WHERE id = $1
      AND user_id = $2
      LIMIT 1
      `,
      [contactId, user_id],
    );

    if (contactResult.rows.length === 0) {
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
      [user_id, contactId],
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error obteniendo conversaciones del contacto:", error);
    res.status(500).json({
      message: error.message,
    });
  }
};
const getContactConversationProgress = async (req, res) => {
  try {
    const user_id = req.user.id;

    const result = await pool.query(
      `
      SELECT
        contact_conversation_id,
        completed_at
      FROM "FloFlo".user_contact_conversation_progress
      WHERE user_id = $1
      ORDER BY completed_at DESC
      `,
      [user_id],
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error obteniendo progreso de conversaciones de contacto:", error);

    res.status(500).json({
      message: "Error obteniendo progreso de conversaciones de contacto",
    });
  }
};

const completeContactConversation = async (req, res) => {
  try {
    const user_id = req.user.id;
    const conversationId = Number(req.params.id);

    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({
        message: "ID de conversación inválido",
      });
    }

    const conversationResult = await pool.query(
      `
      SELECT id
      FROM "FloFlo".user_contact_conversation
      WHERE id = $1
      AND user_id = $2
      LIMIT 1
      `,
      [conversationId, user_id],
    );

    if (conversationResult.rows.length === 0) {
      return res.status(404).json({
        message: "Conversación no encontrada para este usuario",
      });
    }

    await pool.query("BEGIN");

    const progressInsert = await pool.query(
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
      [user_id, conversationId],
    );

    const alreadyCompleted = progressInsert.rows.length === 0;

    let progressResult;

    if (!alreadyCompleted) {
      progressResult = await pool.query(
        `
        UPDATE "FloFlo".user_progress
        SET
          completed_conversations = COALESCE(completed_conversations, 0) + 1,
          points = COALESCE(points, 0) + 10,
          updated_at = NOW()
        WHERE user_id = $1
        RETURNING *
        `,
        [user_id],
      );

      if (progressResult.rows.length === 0) {
        progressResult = await pool.query(
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
            1,
            1,
            0,
            0,
            0,
            NOW(),
            NOW()
          )
          RETURNING *
          `,
          [user_id],
        );
      }
    } else {
      progressResult = await pool.query(
        `
        SELECT *
        FROM "FloFlo".user_progress
        WHERE user_id = $1
        LIMIT 1
        `,
        [user_id],
      );
    }

    await pool.query("COMMIT");

    res.json({
      message: alreadyCompleted
        ? "Conversación ya estaba completada"
        : "Conversación completada correctamente",
      conversationId,
      alreadyCompleted,
      progress: progressResult.rows[0] || null,
    });
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {});

    console.error("Error completando conversación:", error);

    res.status(500).json({
      message: "Error completando conversación",
    });
  }
};
const toggleFavoriteContactConversation = async (req, res) => {
  try {
    const user_id = req.user.id;
    const conversationId = Number(req.params.id);

    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({
        message: "ID de conversación inválido",
      });
    }

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
      [conversationId, user_id],
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
      conversation: result.rows[0],
    });
  } catch (error) {
    console.error("Error cambiando favorito de conversación de contacto:", error);

    res.status(500).json({
      message: "Error actualizando favorito",
    });
  }
};

const updateContactConversation = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { id } = req.params;

    const {
      user_contact_id,
      title,
      situation,
      what_to_say,
      reminder,
      correct_answer,
      wrong_answer_1,
      wrong_answer_2,
    } = req.body;

    if (!title || !situation || !what_to_say) {
      return res.status(400).json({
        message: "title, situation y what_to_say son obligatorios",
      });
    }

    const ownership = await pool.query(
      `
      SELECT ucc.id
      FROM "FloFlo".user_contact_conversation ucc
      INNER JOIN "FloFlo".user_contact uc
      ON uc.id = ucc.user_contact_id
      WHERE ucc.id = $1
      AND uc.user_id = $2
      LIMIT 1
      `,
      [id, user_id],
    );

    if (ownership.rows.length === 0) {
      return res.status(404).json({
        message: "Conversación no encontrada para este usuario",
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
        wrong_answer_2 = $8
      WHERE id = $9
      RETURNING *
      `,
      [
        user_contact_id,
        title,
        situation,
        what_to_say,
        reminder || null,
        correct_answer || null,
        wrong_answer_1 || null,
        wrong_answer_2 || null,
        id,
      ],
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error actualizando conversación de contacto:", error);

    res.status(500).json({
      message: error.message,
    });
  }
};

const deleteContactConversation = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { id } = req.params;

    const ownership = await pool.query(
      `
      SELECT ucc.id
      FROM "FloFlo".user_contact_conversation ucc
      INNER JOIN "FloFlo".user_contact uc
      ON uc.id = ucc.user_contact_id
      WHERE ucc.id = $1
      AND uc.user_id = $2
      LIMIT 1
      `,
      [id, user_id],
    );

    if (ownership.rows.length === 0) {
      return res.status(404).json({
        message: "Conversación no encontrada para este usuario",
      });
    }

    await pool.query(
      `
      DELETE FROM "FloFlo".user_contact_conversation
      WHERE id = $1
      `,
      [id],
    );

    res.json({
      message: "Conversación eliminada correctamente",
    });
  } catch (error) {
    console.error("Error eliminando conversación de contacto:", error);

    res.status(500).json({
      message: error.message,
    });
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

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
      contact_id || contactId || user_contact_id || userContactId
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
      [finalContactId, user_id]
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
      ]
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
      [contactId, user_id]
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
      [user_id, contactId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error obteniendo conversaciones del contacto:", error);
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  getAllContactConversations,
  createContactConversation,
  getContactConversationsByContactId
};

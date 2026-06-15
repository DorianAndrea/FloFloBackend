const pool = require("../database/db");

const getAllContactConversations = async (req, res) => {
  try {
    const user_id = req.user.id;

    const debug = await pool.query(`
  SELECT current_database(), current_user;
`);

    const debugColumns = await pool.query(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'FloFlo'
  AND table_name = 'user_contact_conversation'
  ORDER BY ordinal_position;
`);

    const result = await pool.query(
      `
      SELECT
        ucc.id,
        ucc.user_id,
        ucc.user_contact_id,
        uc.name AS contact_name,
        uc.image AS contact_image,
        ucc.title,
        ucc.situation,
        ucc.what_to_say,
        ucc.reminder,
        ucc.correct_answer,
        ucc.wrong_answer_1,
        ucc.wrong_answer_2,
        ucc.created_at,
        ucc.updated_at
      FROM "FloFlo".user_contact_conversation ucc
      LEFT JOIN "FloFlo".user_contact uc
        ON ucc.user_contact_id = uc.id
      WHERE ucc.user_id = $1
      ORDER BY ucc.created_at DESC
      `,
      [user_id],
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};

const getContactConversations = async (req, res) => {
  try {
    const user_id = req.user.id;

    const result = await pool.query(
      `
      SELECT
        ucc.id,
        ucc.user_id,
        ucc.user_contact_id,
        uc.name AS contact_name,
        uc.image AS contact_image,
        ucc.title,
        ucc.situation,
        ucc.what_to_say,
        ucc.reminder,
        ucc.correct_answer,
        ucc.wrong_answer_1,
        ucc.wrong_answer_2,
        ucc.created_at,
        ucc.updated_at
      FROM "FloFlo".user_contact_conversation ucc
      LEFT JOIN "FloFlo".user_contact uc
        ON ucc.user_contact_id = uc.id
      WHERE ucc.user_id = $1
      ORDER BY ucc.created_at DESC
      `,
      [user_id],
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};

const getContactConversationsByContactId = async (req, res) => {
  try {
    const { contactId } = req.params;
    const user_id = req.user.id;

    const result = await pool.query(
      `
      SELECT
        id,
        user_id,
        user_contact_id,
        title,
        situation,
        what_to_say,
        reminder,
        correct_answer,
        wrong_answer_1,
        wrong_answer_2,
        created_at,
        updated_at
      FROM "FloFlo".user_contact_conversation
      WHERE user_contact_id = $1
      AND user_id = $2
      ORDER BY created_at DESC
      `,
      [contactId, user_id],
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};

const getContactConversationById = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    const result = await pool.query(
      `
      SELECT
        id,
        user_id,
        user_contact_id,
        title,
        situation,
        what_to_say,
        reminder,
        correct_answer,
        wrong_answer_1,
        wrong_answer_2,
        created_at,
        updated_at
      FROM "FloFlo".user_contact_conversation
      WHERE id = $1
      AND user_id = $2
      `,
      [id, user_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Conversación no encontrada",
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};

const createContactConversation = async (req, res) => {
  try {
    const user_id = req.user.id;

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

    const contactExists = await pool.query(
      `
      SELECT id
      FROM "FloFlo".user_contact
      WHERE id = $1
      AND user_id = $2
      `,
      [user_contact_id, user_id],
    );

    if (contactExists.rows.length === 0) {
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
        reminder,
        correct_answer,
        wrong_answer_1,
        wrong_answer_2,
        created_at,
        updated_at
      )
      VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING *
      `,
      [
        user_id,
        user_contact_id,
        title,
        situation,
        what_to_say,
        reminder,
        correct_answer,
        wrong_answer_1,
        wrong_answer_2,
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};

const updateContactConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    const {
      title,
      situation,
      what_to_say,
      reminder,
      correct_answer,
      wrong_answer_1,
      wrong_answer_2,
    } = req.body;

    const result = await pool.query(
      `
      UPDATE "FloFlo".user_contact_conversation
      SET
        title = $1,
        situation = $2,
        what_to_say = $3,
        reminder = $4,
        correct_answer = $5,
        wrong_answer_1 = $6,
        wrong_answer_2 = $7,
        updated_at = NOW()
      WHERE id = $8
      AND user_id = $9
      RETURNING *
      `,
      [
        title,
        situation,
        what_to_say,
        reminder,
        correct_answer,
        wrong_answer_1,
        wrong_answer_2,
        id,
        user_id,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Conversación no encontrada",
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};

const deleteContactConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    const result = await pool.query(
      `
      DELETE FROM "FloFlo".user_contact_conversation
      WHERE id = $1
      AND user_id = $2
      RETURNING *
      `,
      [id, user_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Conversación no encontrada",
      });
    }

    res.json({
      message: "Conversación eliminada",
      conversation: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};

const calculateLevel = (points) => {
  return Math.floor(points / 10) + 1;
};

const completeContactConversation = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { id } = req.params;

    const existing = await pool.query(
      `
      SELECT *
      FROM "FloFlo".contact_conversation_progress
      WHERE user_id = $1
      AND contact_conversation_id = $2
      `,
      [user_id, id],
    );

    if (existing.rows.length > 0) {
      return res.json({
        message: "Conversación personalizada ya completada",
        progress: existing.rows[0],
      });
    }

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".contact_conversation_progress
      (
        user_id,
        contact_conversation_id,
        completed,
        points,
        completed_at
      )
      VALUES ($1, $2, true, 1, NOW())
      RETURNING *
      `,
      [user_id, id],
    );

    const currentProgress = await pool.query(
      `
      SELECT *
      FROM "FloFlo".user_progress
      WHERE user_id = $1
      `,
      [user_id],
    );

    let newPoints = 1;
    let newLevel = 1;

    if (currentProgress.rows.length > 0) {
      newPoints = Number(currentProgress.rows[0].points) + 1;
      newLevel = calculateLevel(newPoints);

      await pool.query(
        `
        UPDATE "FloFlo".user_progress
        SET
          points = $1,
          level = $2,
          completed_conversations = completed_conversations + 1,
          updated_at = NOW()
        WHERE user_id = $3
        `,
        [newPoints, newLevel, user_id],
      );
    } else {
      await pool.query(
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
        VALUES ($1, 1, 1, 1, 0, 0, 0, NOW())
        `,
        [user_id],
      );
    }

    res.status(201).json({
      message: "Conversación personalizada completada",
      progress: result.rows[0],
      points: newPoints,
      level: newLevel,
      unlockedAchievements: [],
    });
  } catch (error) {
    console.error(error);
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
      SELECT *
      FROM "FloFlo".contact_conversation_progress
      WHERE user_id = $1
      AND completed = true
      `,
      [user_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAllContactConversations,
  getContactConversations,
  getContactConversationsByContactId,
  getContactConversationById,
  createContactConversation,
  updateContactConversation,
  deleteContactConversation,
  completeContactConversation,
  getContactConversationProgress,
};

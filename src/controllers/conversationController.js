const pool = require("../database/db");
const { unlockAchievement, checkAndUnlockAchievements, } = require("../services/achievementService");

const calculateLevel = (points) => {
  if (points >= 100) return 5;
  if (points >= 50) return 4;
  if (points >= 25) return 3;
  if (points >= 10) return 2;
  return 1;
};

const createConversation = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const user_id = req.user.id;

    const {
      title,
      situation,
      what_to_say,
      reminder,
      messages,
      exercise,
    } = req.body;

    if (!title || !situation) {
      return res.status(400).json({
        message: "title y situation son obligatorios",
      });
    }

    const conversationResult = await client.query(
      `
      INSERT INTO "FloFlo".user_contact_conversation
      (
        user_id,
        title,
        situation,
        what_to_say,
        reminder,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
      RETURNING *
      `,
      [user_id, title, situation, what_to_say || null, reminder || null]
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
          [conversation.id, messages[i].speaker, messages[i].text, i + 1]
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
        [conversation.id, exercise.question]
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
            [savedExercise.id, option.text, option.isCorrect]
          );
        }
      }
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: "Conversación creada correctamente",
      conversation,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    res.status(500).json({
      message: error.message,
    });
  } finally {
    client.release();
  }
};

const getConversations = async (req, res) => {
  try {
    const user_id = req.user.id;

    const conversationsResult = await pool.query(
      `
      SELECT *
      FROM "FloFlo".user_contact_conversation
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [user_id]
    );

    const conversations = [];

    for (const conversation of conversationsResult.rows) {
      const messagesResult = await pool.query(
        `
        SELECT *
        FROM "FloFlo".conversation_message
        WHERE conversation_id = $1
        ORDER BY order_number
        `,
        [conversation.id]
      );

      const exerciseResult = await pool.query(
        `
        SELECT *
        FROM "FloFlo".conversation_exercise
        WHERE conversation_id = $1
        LIMIT 1
        `,
        [conversation.id]
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
          [exerciseRow.id]
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

      conversations.push({
        id: conversation.id,
        title: conversation.title,
        situation: conversation.situation,
        what_to_say: conversation.what_to_say,
        reminder: conversation.reminder,
        messages: messagesResult.rows.map((message) => ({
          id: message.id,
          speaker: message.speaker,
          text: message.message,
          orderNumber: message.order_number,
        })),
        exercise,
      });
    }

    res.json(conversations);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: error.message,
    });
  }
};

const completeConversation = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { id } = req.params;

    const existing = await pool.query(
      `
      SELECT *
      FROM "FloFlo".conversation_progress
      WHERE user_id = $1
      AND conversation_id = $2
      `,
      [user_id, id]
    );

    if (existing.rows.length > 0) {
      return res.json({
        message: "Conversación ya estaba completada",
        progress: existing.rows[0],
        unlockedAchievements: [],
      });
    }

    const result = await pool.query(
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
      [user_id, id]
    );

    const currentProgress = await pool.query(
      `
      SELECT *
      FROM "FloFlo".user_progress
      WHERE user_id = $1
      `,
      [user_id]
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
        [newPoints, newLevel, user_id]
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
        VALUES ($1,$2,$3,1,0,0,0,NOW())
        `,
        [user_id, 1, 1]
      );
    }
    

    const completedCount = await pool.query(
      `
      SELECT COUNT(*) AS count
      FROM "FloFlo".conversation_progress
      WHERE user_id = $1
      AND completed = true
      `,
      [user_id]
    );

    const totalCompleted = Number(completedCount.rows[0].count);

    const unlockedAchievements = [];

    const tryUnlockAchievement = async (achievementId) => {
      const unlocked = await unlockAchievement(user_id, achievementId);

      if (!unlocked) return;

      const achievementResult = await pool.query(
        `
        SELECT *
        FROM "FloFlo".achievement
        WHERE id = $1
        `,
        [achievementId]
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

    res.status(201).json({
      message: "Conversación completada",
      progress: result.rows[0],
      unlockedAchievements,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: error.message,
    });
  }
};

const getConversationProgress = async (req, res) => {
  try {
    const userId = req.user.id;

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
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  createConversation,
  getConversations,
  completeConversation,
  getConversationProgress,
};
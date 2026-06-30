const pool = require("../database/db");

const {
  checkAndUnlockAchievements,
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

const resolveMoodOwnerId = async (req, client = pool) => {
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
    actorId: loggedUserId,
    isParentManagingChild: false,
    source: "child",
  };
}

  const childId = validatePositiveInteger(childIdParam, "Niño/a");

  if (req.user.role !== "parent") {
    throw createHttpError("Solo un padre/cuidador puede usar esta ruta", 403);
  }

  await assertParentCanAccessChild(loggedUserId, childId, client);

  return {
    ownerId: childId,
    actorId: loggedUserId,
    isParentManagingChild: true,
    source: "parent",
  };
};

const getMoods = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } = await resolveMoodOwnerId(req);

    const result = await pool.query(
      `
      SELECT 
        m.id,
        m.user_id,
        m.created_by,
        m.source,
        m.mood_type_id,
        mt.mood_name,
        mt.icon,
        m.comment,
        m.created_at
      FROM "FloFlo".mood m
      INNER JOIN "FloFlo".mood_type mt 
        ON m.mood_type_id = mt.id
      WHERE m.user_id = $1
      ORDER BY m.created_at DESC
      `,
      [ownerId],
    );

    res.json(
      result.rows.map((mood) => ({
        ...mood,
        managed_by_parent: isParentManagingChild,
      })),
    );
  } catch (error) {
    console.error("Error obteniendo emociones:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const createMood = async (req, res) => {
  const client = await pool.connect();
  let committed = false;

  try {
    await client.query("BEGIN");

    const { ownerId, actorId, isParentManagingChild, source } =
      await resolveMoodOwnerId(req, client);

    const { mood_type_id, comment } = req.body;

    if (!mood_type_id) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "El tipo de emoción es obligatorio",
      });
    }

    const moodTypeId = validatePositiveInteger(
      mood_type_id,
      "Tipo de emoción",
    );

    const moodTypeExists = await client.query(
      `
      SELECT id
      FROM "FloFlo".mood_type
      WHERE id = $1
      LIMIT 1
      `,
      [moodTypeId],
    );

    if (moodTypeExists.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Tipo de emoción no encontrado",
      });
    }

    const result = await client.query(
      `
      INSERT INTO "FloFlo".mood (
        user_id,
        created_by,
        source,
        mood_type_id,
        comment,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
      `,
      [ownerId, actorId, source, moodTypeId, comment || null],
    );

    const mood = result.rows[0];

    /*
      Importante:
      - Si el niño registra su emoción, suma puntos/progreso.
      - Si el padre registra una observación, queda guardada para el niño,
        pero NO suma puntos ni logros, porque no fue una acción realizada por el niño.
    */

    if (!isParentManagingChild) {
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

      if (currentProgress.rows.length > 0) {
        newPoints = Number(currentProgress.rows[0].points || 0) + 1;

        await client.query(
          `
          UPDATE "FloFlo".user_progress
          SET 
            points = $1,
            level = $2,
            completed_moods = COALESCE(completed_moods, 0) + 1,
            updated_at = NOW()
          WHERE user_id = $3
          `,
          [newPoints, calculateLevel(newPoints), ownerId],
        );
      } else {
        await client.query(
          `
          INSERT INTO "FloFlo".user_progress (
            user_id,
            points,
            level,
            completed_conversations,
            completed_places,
            completed_routines,
            completed_moods,
            updated_at
          )
          VALUES ($1, $2, $3, 0, 0, 0, 1, NOW())
          `,
          [ownerId, 1, 1],
        );
      }
    }

    await client.query("COMMIT");
    committed = true;

    const unlockedAchievements = isParentManagingChild
      ? []
      : await checkAndUnlockAchievements(ownerId);

    res.status(201).json({
      message: isParentManagingChild
        ? "Observación emocional guardada para el niño/a"
        : "Estado de ánimo guardado",
      managedByParent: isParentManagingChild,
      mood: {
        ...mood,
        managed_by_parent: isParentManagingChild,
      },
      unlockedAchievements,
    });
  } catch (error) {
    if (!committed) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Error creando emoción:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getMoods,
  createMood,
};
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

const getParentChildAccess = async (parentId, childId, client = pool) => {
  const result = await client.query(
    `
    SELECT
      pc.child_id,
      pc.relationship_key,
      pc.access_profile,
      pc.can_manage_team,
      pc.status

    FROM "FloFlo".parent_child pc

    INNER JOIN "FloFlo"."user" u
      ON u.id = pc.child_id

    WHERE pc.parent_id = $1
      AND pc.child_id = $2
      AND pc.status = 'active'
      AND u.role = 'child'

    LIMIT 1
    `,
    [parentId, childId],
  );

  if (result.rows.length === 0) {
    throw createHttpError("No tienes permiso para acceder a este niño/a", 403);
  }

  return result.rows[0];
};

const resolveMoodOwnerId = async (req, client = pool) => {
  const loggedUserId = validatePositiveInteger(req.user.id, "Usuario");

  const childIdParam = req.params.childId;

  if (!childIdParam) {
    if (req.user.role !== "child") {
      throw createHttpError(
        "Esta ruta es solo para cuentas de niño/a. Los adultos deben usar /children/:childId",
        403,
      );
    }

    return {
      ownerId: loggedUserId,
      actorId: loggedUserId,
      isAdultManagingChild: false,
      source: "child",
      creatorAccessProfile: "child",
      creatorRelationshipKey: "child",
    };
  }

  const childId = validatePositiveInteger(childIdParam, "Niño/a");

  if (req.user.role !== "parent") {
    throw createHttpError("Solo una cuenta adulta puede usar esta ruta", 403);
  }

  const access = await getParentChildAccess(loggedUserId, childId, client);

  return {
    ownerId: childId,
    actorId: loggedUserId,
    isAdultManagingChild: true,
    source: "parent",
    creatorAccessProfile: access.access_profile,
    creatorRelationshipKey: access.relationship_key,
  };
};

const getMoods = async (req, res) => {
  try {
    const { ownerId, isAdultManagingChild } = await resolveMoodOwnerId(req);

    const result = await pool.query(
      `
  SELECT
    m.id,
    m.user_id,
    m.created_by,
    m.source,
    m.creator_access_profile,
    m.creator_relationship_key,
    m.mood_type_id,
    mt.mood_name,
    mt.icon,
    m.comment,
    m.created_at,

    creator."firstName" AS creator_first_name,
    creator."lastName" AS creator_last_name,
    creator.avatar AS creator_avatar

  FROM "FloFlo".mood m

  INNER JOIN "FloFlo".mood_type mt
    ON m.mood_type_id = mt.id

  LEFT JOIN "FloFlo"."user" creator
    ON creator.id = m.created_by

  WHERE m.user_id = $1

  ORDER BY m.created_at DESC
  `,
      [ownerId],
    );

    res.json(
      result.rows.map((mood) => ({
        ...mood,
        managed_by_adult: isAdultManagingChild,
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

    const {
      ownerId,
      actorId,
      isAdultManagingChild,
      source,
      creatorAccessProfile,
      creatorRelationshipKey,
    } = await resolveMoodOwnerId(req, client);

    const { mood_type_id, comment } = req.body;

    if (!mood_type_id) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "El tipo de emoción es obligatorio",
      });
    }

    const moodTypeId = validatePositiveInteger(mood_type_id, "Tipo de emoción");

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
    creator_access_profile,
    creator_relationship_key,
    mood_type_id,
    comment,
    created_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())

  RETURNING *
  `,
      [
        ownerId,
        actorId,
        source,
        creatorAccessProfile,
        creatorRelationshipKey,
        moodTypeId,
        comment || null,
      ],
    );

    const mood = result.rows[0];

    /*
      Importante:
      - Si el niño registra su emoción, suma puntos/progreso.
      - Si el padre registra una observación, queda guardada para el niño,
        pero NO suma puntos ni logros, porque no fue una acción realizada por el niño.
    */

    if (!isAdultManagingChild) {
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

    const unlockedAchievements = isAdultManagingChild
      ? []
      : await checkAndUnlockAchievements(ownerId);

    res.status(201).json({
      message: isAdultManagingChild
        ? "Observación emocional guardada para el niño/a"
        : "Estado de ánimo guardado",

      managedByAdult: isAdultManagingChild,

      mood: {
        ...mood,
        managed_by_adult: isAdultManagingChild,
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

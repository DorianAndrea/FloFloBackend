const pool = require("../database/db");

const {
  checkAndUnlockAchievements,
} = require("../services/achievementService");

const ALL_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const APP_TIMEZONE = process.env.APP_TIMEZONE || "America/Santiago";

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeDaysOfWeek = (days) => {
  if (days === undefined || days === null || days === "") {
    return ALL_DAYS;
  }

  let parsedDays = days;

  if (typeof days === "string") {
    try {
      parsedDays = JSON.parse(days);
    } catch {
      parsedDays = days.split(",");
    }
  }

  if (!Array.isArray(parsedDays)) {
    throw createHttpError("days_of_week debe ser una lista de días");
  }

  const cleanDays = parsedDays.map((day) => String(day).trim().toLowerCase());
  const invalidDays = cleanDays.filter((day) => !ALL_DAYS.includes(day));

  if (invalidDays.length > 0) {
    throw createHttpError(`Días inválidos: ${invalidDays.join(", ")}`, 400);
  }

  const uniqueDays = [...new Set(cleanDays)];

  if (uniqueDays.length === 0) {
    return ALL_DAYS;
  }

  return uniqueDays;
};

const getTodayInfo = () => {
  const now = new Date();

  const dateString = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const dayKey = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    weekday: "long",
  })
    .format(now)
    .toLowerCase();

  return {
    dateString,
    dayKey,
  };
};

const calculateLevel = (points) => {
  if (points >= 100) return 5;
  if (points >= 50) return 4;
  if (points >= 25) return 3;
  if (points >= 10) return 2;
  return 1;
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

const resolveRoutineOwnerId = async (req, client = pool) => {
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

const getRoutines = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } = await resolveRoutineOwnerId(req);
    const { dateString } = getTodayInfo();

    const result = await pool.query(
      `
      SELECT
        r.*,
        CASE 
          WHEN rp.id IS NULL THEN false
          ELSE true
        END AS completed_today,
        rp.completed_at AS today_completed_at,
        rp.completion_date AS today_completion_date
      FROM "FloFlo".routine r
      LEFT JOIN "FloFlo".routine_progress rp
        ON rp.routine_id = r.id
        AND rp.user_id = $1
        AND rp.completion_date = $2
      WHERE r.user_id = $1
      AND COALESCE(r.is_active, true) = true
      ORDER BY r.start_time ASC, r.name ASC
      `,
      [ownerId, dateString],
    );

    res.json(result.rows.map((routine) => ({
      ...routine,
      managed_by_parent: isParentManagingChild,
    })));
  } catch (error) {
    console.error("Error obteniendo rutinas:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo rutinas",
    });
  }
};

const getTodayRoutines = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } = await resolveRoutineOwnerId(req);
    const { dateString, dayKey } = getTodayInfo();

    const result = await pool.query(
      `
      SELECT
        r.*,
        CASE 
          WHEN rp.id IS NULL THEN false
          ELSE true
        END AS completed_today,
        rp.completed_at AS today_completed_at,
        rp.completion_date AS today_completion_date
      FROM "FloFlo".routine r
      LEFT JOIN "FloFlo".routine_progress rp
        ON rp.routine_id = r.id
        AND rp.user_id = $1
        AND rp.completion_date = $2
      WHERE r.user_id = $1
      AND COALESCE(r.is_active, true) = true
      AND $3 = ANY(r.days_of_week)
      ORDER BY r.start_time ASC, r.name ASC
      `,
      [ownerId, dateString, dayKey],
    );

    res.json({
      date: dateString,
      day: dayKey,
      ownerId,
      managedByParent: isParentManagingChild,
      routines: result.rows.map((routine) => ({
        ...routine,
        managed_by_parent: isParentManagingChild,
      })),
    });
  } catch (error) {
    console.error("Error obteniendo rutinas de hoy:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo rutinas de hoy",
    });
  }
};

const getRoutineHistory = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } = await resolveRoutineOwnerId(req);
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    const result = await pool.query(
      `
      SELECT
        rp.*,
        r.name,
        r.description,
        r.start_time,
        r.end_time,
        r.days_of_week
      FROM "FloFlo".routine_progress rp
      INNER JOIN "FloFlo".routine r
        ON r.id = rp.routine_id
      WHERE rp.user_id = $1
      ORDER BY rp.completion_date DESC, rp.completed_at DESC
      LIMIT $2
      `,
      [ownerId, limit],
    );

    res.json(
      result.rows.map((item) => ({
        ...item,
        managed_by_parent: isParentManagingChild,
      })),
    );
  } catch (error) {
    console.error("Error obteniendo historial de rutinas:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo historial de rutinas",
    });
  }
};

const createRoutine = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } = await resolveRoutineOwnerId(req);

    const {
      name,
      description,
      start_time,
      end_time,
      days_of_week,
      daysOfWeek,
    } = req.body;

    if (!name || !start_time || !end_time) {
      return res.status(400).json({
        message: "name, start_time y end_time son obligatorios",
      });
    }

    const cleanName = String(name).trim();
    const cleanDescription =
      typeof description === "string" ? description.trim() : "";
    const cleanStartTime = String(start_time).trim();
    const cleanEndTime = String(end_time).trim();
    const cleanDaysOfWeek = normalizeDaysOfWeek(days_of_week || daysOfWeek);

    if (!cleanName || !cleanStartTime || !cleanEndTime) {
      return res.status(400).json({
        message: "name, start_time y end_time son obligatorios",
      });
    }

    if (cleanEndTime <= cleanStartTime) {
      return res.status(400).json({
        message: "La hora de término debe ser posterior a la hora de inicio",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".routine (
        user_id,
        name,
        description,
        start_time,
        end_time,
        days_of_week,
        is_active,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
      RETURNING *
      `,
      [
        ownerId,
        cleanName,
        cleanDescription,
        cleanStartTime,
        cleanEndTime,
        cleanDaysOfWeek,
      ],
    );

    res.status(201).json({
      message: isParentManagingChild
        ? "Rutina creada correctamente para el niño/a"
        : "Rutina creada correctamente",
      managedByParent: isParentManagingChild,
      routine: result.rows[0],
    });
  } catch (error) {
    console.error("Error creando rutina:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const updateRoutine = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } = await resolveRoutineOwnerId(req);
    const id = validatePositiveInteger(req.params.id, "Rutina");

    const {
      name,
      description,
      start_time,
      end_time,
      days_of_week,
      daysOfWeek,
    } = req.body;

    if (!name || !start_time || !end_time) {
      return res.status(400).json({
        message: "name, start_time y end_time son obligatorios",
      });
    }

    const cleanName = String(name).trim();
    const cleanDescription =
      typeof description === "string" ? description.trim() : "";
    const cleanStartTime = String(start_time).trim();
    const cleanEndTime = String(end_time).trim();

    const shouldUpdateDays =
      days_of_week !== undefined || daysOfWeek !== undefined;

    const cleanDaysOfWeek = shouldUpdateDays
      ? normalizeDaysOfWeek(days_of_week || daysOfWeek)
      : null;

    if (!cleanName || !cleanStartTime || !cleanEndTime) {
      return res.status(400).json({
        message: "name, start_time y end_time son obligatorios",
      });
    }

    if (cleanEndTime <= cleanStartTime) {
      return res.status(400).json({
        message: "La hora de término debe ser posterior a la hora de inicio",
      });
    }

    const result = await pool.query(
      `
      UPDATE "FloFlo".routine
      SET
        name = $1,
        description = $2,
        start_time = $3,
        end_time = $4,
        days_of_week = COALESCE($5::TEXT[], days_of_week),
        updated_at = NOW()
      WHERE id = $6
      AND user_id = $7
      AND COALESCE(is_active, true) = true
      RETURNING *
      `,
      [
        cleanName,
        cleanDescription,
        cleanStartTime,
        cleanEndTime,
        cleanDaysOfWeek,
        id,
        ownerId,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Rutina no encontrada",
      });
    }

    res.json({
      ...result.rows[0],
      managed_by_parent: isParentManagingChild,
    });
  } catch (error) {
    console.error("Error actualizando rutina:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const deleteRoutine = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } = await resolveRoutineOwnerId(req);
    const id = validatePositiveInteger(req.params.id, "Rutina");

    const result = await pool.query(
      `
      UPDATE "FloFlo".routine
      SET
        is_active = false,
        updated_at = NOW()
      WHERE id = $1
      AND user_id = $2
      AND COALESCE(is_active, true) = true
      RETURNING *
      `,
      [id, ownerId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Rutina no encontrada",
      });
    }

    res.json({
      message: isParentManagingChild
        ? "Rutina del niño/a eliminada correctamente"
        : "Rutina eliminada correctamente",
      managedByParent: isParentManagingChild,
      routine: result.rows[0],
    });
  } catch (error) {
    console.error("Error eliminando rutina:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const completeRoutine = async (req, res) => {
  const client = await pool.connect();

  try {
    const { ownerId, isParentManagingChild } = await resolveRoutineOwnerId(
      req,
      client,
    );

    const id = validatePositiveInteger(req.params.id, "Rutina");
    const { dateString, dayKey } = getTodayInfo();

    await client.query("BEGIN");

    const routineResult = await client.query(
      `
      SELECT *
      FROM "FloFlo".routine
      WHERE id = $1
      AND user_id = $2
      AND COALESCE(is_active, true) = true
      LIMIT 1
      `,
      [id, ownerId],
    );

    if (routineResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Rutina no encontrada",
      });
    }

    const routine = routineResult.rows[0];
    const routineDays = routine.days_of_week || ALL_DAYS;

    if (!routineDays.includes(dayKey)) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "Esta rutina no está programada para hoy",
      });
    }

    const insertedProgress = await client.query(
      `
      INSERT INTO "FloFlo".routine_progress (
        user_id,
        routine_id,
        completed,
        points,
        completed_at,
        completion_date
      )
      VALUES ($1, $2, true, 1, NOW(), $3)
      ON CONFLICT (user_id, routine_id, completion_date)
      DO NOTHING
      RETURNING *
      `,
      [ownerId, id, dateString],
    );

    let alreadyCompleted = false;
    let progressRow = insertedProgress.rows[0] || null;
    let userProgress = null;

    if (!progressRow) {
      alreadyCompleted = true;

      const existingProgress = await client.query(
        `
        SELECT *
        FROM "FloFlo".routine_progress
        WHERE user_id = $1
        AND routine_id = $2
        AND completion_date = $3
        LIMIT 1
        `,
        [ownerId, id, dateString],
      );

      progressRow = existingProgress.rows[0] || null;
    }

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
        const newPoints = Number(currentProgress.rows[0].points || 0) + 1;

        const updatedProgress = await client.query(
          `
          UPDATE "FloFlo".user_progress
          SET
            points = $1,
            level = $2,
            completed_routines = COALESCE(completed_routines, 0) + 1,
            updated_at = NOW()
          WHERE user_id = $3
          RETURNING *
          `,
          [newPoints, calculateLevel(newPoints), ownerId],
        );

        userProgress = updatedProgress.rows[0] || null;
      } else {
        const createdProgress = await client.query(
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
          VALUES ($1, 1, 1, 0, 0, 1, 0, NOW())
          RETURNING *
          `,
          [ownerId],
        );

        userProgress = createdProgress.rows[0] || null;
      }
    }

    await client.query("COMMIT");

    const unlockedAchievements = alreadyCompleted
      ? []
      : await checkAndUnlockAchievements(ownerId);

    res.status(alreadyCompleted ? 200 : 201).json({
      message: alreadyCompleted
        ? "Rutina ya estaba completada hoy"
        : isParentManagingChild
          ? "Rutina del niño/a completada correctamente"
          : "Rutina completada correctamente",
      alreadyCompleted,
      managedByParent: isParentManagingChild,
      ownerId,
      progress: progressRow,
      userProgress,
      unlockedAchievements,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error completando rutina:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getRoutines,
  getTodayRoutines,
  getRoutineHistory,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  completeRoutine,
};
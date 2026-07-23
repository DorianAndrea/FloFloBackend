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

const canCreateOrEditRoutine = (accessProfile) => {
  return [
    "primary_caregiver",
    "caregiver",
    "therapist",
    "teacher",
    "professional",
  ].includes(accessProfile);
};

const canDeleteRoutine = (accessProfile) => {
  return ["primary_caregiver", "caregiver"].includes(accessProfile);
};

const resolveRoutineOwnerId = async (req, client = pool) => {
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
      accessProfile: "child",
      relationshipKey: "child",
    };
  }

  const childId = validatePositiveInteger(childIdParam, "Niño/a");

  if (req.user.role !== "parent") {
    throw createHttpError("Solo una cuenta adulta puede usar esta ruta", 403);
  }

  const access = await getAdultChildAccess(loggedUserId, childId, client);

  return {
    ownerId: childId,
    actorId: loggedUserId,
    isAdultManagingChild: true,
    source: "parent",
    accessProfile: access.access_profile,
    relationshipKey: access.relationship_key,
    canManageTeam: Boolean(access.can_manage_team),
  };
};

const getRoutines = async (req, res) => {
  try {
    const { ownerId, isAdultManagingChild } = await resolveRoutineOwnerId(req);

    const { dateString } = getTodayInfo();

    const result = await pool.query(
      `
      SELECT
        r.*,

        creator."firstName" AS creator_first_name,
        creator."lastName" AS creator_last_name,
        creator.avatar AS creator_avatar,

        updater."firstName" AS updater_first_name,
        updater."lastName" AS updater_last_name,
        updater.avatar AS updater_avatar,

        CASE
          WHEN rp.id IS NULL THEN false
          ELSE true
        END AS completed_today,

        rp.completed_at AS today_completed_at,
        rp.completion_date AS today_completion_date,

        rp.completed_by AS today_completed_by,
        rp.completer_access_profile AS today_completer_access_profile,
        rp.completer_relationship_key AS today_completer_relationship_key,
        rp.source AS today_completion_source,

        completer."firstName" AS today_completer_first_name,
        completer."lastName" AS today_completer_last_name,
        completer.avatar AS today_completer_avatar

      FROM "FloFlo".routine r

      LEFT JOIN "FloFlo".routine_progress rp
        ON rp.routine_id = r.id
        AND rp.user_id = $1
        AND rp.completion_date = $2

      LEFT JOIN "FloFlo"."user" creator
        ON creator.id = r.created_by

      LEFT JOIN "FloFlo"."user" updater
        ON updater.id = r.updated_by

      LEFT JOIN "FloFlo"."user" completer
        ON completer.id = rp.completed_by

      WHERE r.user_id = $1
        AND COALESCE(r.is_active, true) = true

      ORDER BY r.start_time ASC, r.name ASC
      `,
      [ownerId, dateString],
    );

    return res.json(
      result.rows.map((routine) => ({
        ...routine,
        managed_by_adult: isAdultManagingChild,
      })),
    );
  } catch (error) {
    console.error("Error obteniendo rutinas:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo rutinas",
    });
  }
};

const getTodayRoutines = async (req, res) => {
  try {
    const { ownerId, isAdultManagingChild } = await resolveRoutineOwnerId(req);

    const { dateString, dayKey } = getTodayInfo();

    const result = await pool.query(
      `
      SELECT
        r.*,

        creator."firstName" AS creator_first_name,
        creator."lastName" AS creator_last_name,
        creator.avatar AS creator_avatar,

        updater."firstName" AS updater_first_name,
        updater."lastName" AS updater_last_name,
        updater.avatar AS updater_avatar,

        CASE
          WHEN rp.id IS NULL THEN false
          ELSE true
        END AS completed_today,

        rp.completed_at AS today_completed_at,
        rp.completion_date AS today_completion_date,

        rp.completed_by AS today_completed_by,
        rp.completer_access_profile AS today_completer_access_profile,
        rp.completer_relationship_key AS today_completer_relationship_key,
        rp.source AS today_completion_source,

        completer."firstName" AS today_completer_first_name,
        completer."lastName" AS today_completer_last_name,
        completer.avatar AS today_completer_avatar

      FROM "FloFlo".routine r

      LEFT JOIN "FloFlo".routine_progress rp
        ON rp.routine_id = r.id
        AND rp.user_id = $1
        AND rp.completion_date = $2

      LEFT JOIN "FloFlo"."user" creator
        ON creator.id = r.created_by

      LEFT JOIN "FloFlo"."user" updater
        ON updater.id = r.updated_by

      LEFT JOIN "FloFlo"."user" completer
        ON completer.id = rp.completed_by

      WHERE r.user_id = $1
        AND COALESCE(r.is_active, true) = true
        AND $3 = ANY(r.days_of_week)

      ORDER BY r.start_time ASC, r.name ASC
      `,
      [ownerId, dateString, dayKey],
    );

    return res.json({
      date: dateString,
      day: dayKey,
      ownerId,
      managedByAdult: isAdultManagingChild,

      routines: result.rows.map((routine) => ({
        ...routine,
        managed_by_adult: isAdultManagingChild,
      })),
    });
  } catch (error) {
    console.error("Error obteniendo rutinas de hoy:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo rutinas de hoy",
    });
  }
};

const getRoutineHistory = async (req, res) => {
  try {
    const { ownerId, isAdultManagingChild } = await resolveRoutineOwnerId(req);

    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 50;

    const result = await pool.query(
      `
      SELECT
        rp.*,

        r.name,
        r.description,
        r.start_time,
        r.end_time,
        r.days_of_week,

        completer."firstName" AS completer_first_name,
        completer."lastName" AS completer_last_name,
        completer.avatar AS completer_avatar

      FROM "FloFlo".routine_progress rp

      INNER JOIN "FloFlo".routine r
        ON r.id = rp.routine_id
        AND r.user_id = rp.user_id

      LEFT JOIN "FloFlo"."user" completer
        ON completer.id = rp.completed_by

      WHERE rp.user_id = $1

      ORDER BY
        rp.completion_date DESC,
        rp.completed_at DESC

      LIMIT $2
      `,
      [ownerId, limit],
    );

    return res.json(
      result.rows.map((item) => ({
        ...item,
        managed_by_adult: isAdultManagingChild,
      })),
    );
  } catch (error) {
    console.error("Error obteniendo historial de rutinas:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo historial de rutinas",
    });
  }
};

const createRoutine = async (req, res) => {
  try {
    const {
      ownerId,
      actorId,
      isAdultManagingChild,
      accessProfile,
      relationshipKey,
    } = await resolveRoutineOwnerId(req);

    if (isAdultManagingChild && !canCreateOrEditRoutine(accessProfile)) {
      throw createHttpError(
        "Tu perfil puede consultar las rutinas, pero no crear nuevas",
        403,
      );
    }

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

    const cleanDaysOfWeek = normalizeDaysOfWeek(days_of_week ?? daysOfWeek);

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

        created_by,
        creator_access_profile,
        creator_relationship_key,

        updated_by,
        updater_access_profile,
        updater_relationship_key,

        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        true,

        $7,
        $8,
        $9,

        $7,
        $8,
        $9,

        NOW(),
        NOW()
      )
      RETURNING *
      `,
      [
        ownerId,
        cleanName,
        cleanDescription,
        cleanStartTime,
        cleanEndTime,
        cleanDaysOfWeek,

        actorId,
        accessProfile,
        relationshipKey,
      ],
    );

    return res.status(201).json({
      message: isAdultManagingChild
        ? "Rutina creada correctamente para el niño/a"
        : "Rutina creada correctamente",

      managedByAdult: isAdultManagingChild,

      routine: {
        ...result.rows[0],
        managed_by_adult: isAdultManagingChild,
      },
    });
  } catch (error) {
    console.error("Error creando rutina:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error creando rutina",
    });
  }
};

const updateRoutine = async (req, res) => {
  try {
    const {
      ownerId,
      actorId,
      isAdultManagingChild,
      accessProfile,
      relationshipKey,
    } = await resolveRoutineOwnerId(req);

    if (isAdultManagingChild && !canCreateOrEditRoutine(accessProfile)) {
      throw createHttpError(
        "Tu perfil puede consultar las rutinas, pero no modificarlas",
        403,
      );
    }
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

    updated_by = $6,
    updater_access_profile = $7,
    updater_relationship_key = $8,

    updated_at = NOW()

  WHERE id = $9
    AND user_id = $10
    AND COALESCE(is_active, true) = true

  RETURNING *
  `,
      [
        cleanName,
        cleanDescription,
        cleanStartTime,
        cleanEndTime,
        cleanDaysOfWeek,

        actorId,
        accessProfile,
        relationshipKey,

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
      managed_by_adult: isAdultManagingChild,
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
    const {
      ownerId,
      actorId,
      isAdultManagingChild,
      accessProfile,
      relationshipKey,
    } = await resolveRoutineOwnerId(req);

    if (isAdultManagingChild && !canDeleteRoutine(accessProfile)) {
      throw createHttpError("Solo un cuidador puede eliminar rutinas", 403);
    }
    const id = validatePositiveInteger(req.params.id, "Rutina");

    const result = await pool.query(
      `
      UPDATE "FloFlo".routine
      SET
        is_active = false,
        updated_by = $1,
        updater_access_profile = $2,
        updater_relationship_key = $3,
        updated_at = NOW()

      WHERE id = $4
        AND user_id = $5
        AND COALESCE(is_active, true) = true

      RETURNING *
  `,
      [actorId, accessProfile, relationshipKey, id, ownerId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Rutina no encontrada",
      });
    }

    return res.json({
      message: isAdultManagingChild
        ? "Rutina del niño/a eliminada correctamente"
        : "Rutina eliminada correctamente",

      managedByAdult: isAdultManagingChild,
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
    await client.query("BEGIN");

    const {
      ownerId,
      actorId,
      isAdultManagingChild,
      source,
      accessProfile,
      relationshipKey,
    } = await resolveRoutineOwnerId(req, client);

    const id = validatePositiveInteger(req.params.id, "Rutina");
    const { dateString, dayKey } = getTodayInfo();

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
    completion_date,

    completed_by,
    completer_access_profile,
    completer_relationship_key,
    source
  )
  VALUES (
    $1, $2, true, 1, NOW(), $3,
    $4, $5, $6, $7
  )

  ON CONFLICT (user_id, routine_id, completion_date)
  DO NOTHING

  RETURNING *
  `,
      [
        ownerId,
        id,
        dateString,
        actorId,
        accessProfile,
        relationshipKey,
        source,
      ],
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
        : isAdultManagingChild
          ? "Rutina del niño/a completada correctamente"
          : "Rutina completada correctamente",

      alreadyCompleted,
      managedByAdult: isAdultManagingChild,
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

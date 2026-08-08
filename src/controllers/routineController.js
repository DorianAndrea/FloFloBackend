const pool = require("../database/db");

const {
  checkAndUnlockAchievements,
} = require("../services/achievementService");
const {
  publishLearningEvent,
} = require("../cognitive-engine/services/cognitiveEventPublisher");
const {
  COGNITIVE_EVENT_TYPES,
} = require("../cognitive-engine/constants/cognitiveEventTypes");

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

const validateLearningContext = async (learningContextId, client = pool) => {
  const cleanLearningContextId = validatePositiveInteger(
    learningContextId,
    "Contexto de aprendizaje",
  );

  const result = await client.query(
    `
    SELECT
      id,
      context_key,
      name,
      category,
      icon,
      color,
      description
    FROM "FloFlo".learning_context
    WHERE id=$1
      AND is_active=true
      AND context_key<>'unspecified'
    `,
    [cleanLearningContextId],
  );

  if (result.rows.length === 0) {
    throw createHttpError("Contexto de aprendizaje no encontrado", 400);
  }

  return result.rows[0];
};

const normalizeRoutineSteps = (steps) => {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw createHttpError("La experiencia debe incluir al menos un paso", 400);
  }

  return steps.map((step, index) => {
    const title = String(step?.title || "").trim();
    const description = String(step?.description || "").trim();

    const icon = String(step?.icon || "✨").trim();

    const estimatedMinutes =
      step?.estimated_minutes === null ||
      step?.estimated_minutes === undefined ||
      step?.estimated_minutes === ""
        ? null
        : Number(step.estimated_minutes);

    if (!title) {
      throw createHttpError(`El paso ${index + 1} necesita un nombre`, 400);
    }

    if (
      estimatedMinutes !== null &&
      (!Number.isInteger(estimatedMinutes) || estimatedMinutes <= 0)
    ) {
      throw createHttpError(
        `La duración del paso ${index + 1} es inválida`,
        400,
      );
    }

    return {
      title,
      description,
      icon: icon || "✨",
      position: index + 1,
      estimatedMinutes,
      isOptional: Boolean(step?.is_optional),
    };
  });
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

    source:
      access.access_profile === "primary_caregiver" ||
      access.access_profile === "caregiver"
        ? "caregiver"
        : "professional",

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

        lc.context_key AS learning_context_key,
        lc.name AS learning_context_name,
        lc.category AS learning_context_category,
        lc.icon AS learning_context_icon,
        lc.color AS learning_context_color,
        lc.description AS learning_context_description,

        COALESCE(
          steps_data.steps,
          '[]'::jsonb
        ) AS steps,

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

      LEFT JOIN "FloFlo".learning_context lc
        ON lc.id = r.learning_context_id

      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', rs.id,
            'routine_id', rs.routine_id,
            'title', rs.title,
            'description', rs.description,
            'icon', rs.icon,
            'position', rs.position,
            'estimated_minutes', rs.estimated_minutes,
            'is_optional', rs.is_optional
          )
    ORDER BY rs.position ASC
        ) AS steps
        FROM "FloFlo".routine_step rs
        WHERE rs.routine_id = r.id
          AND COALESCE(rs.is_active, true) = true
      ) steps_data ON true

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
    const { ownerId, isAdultManagingChild } =
      await resolveRoutineOwnerId(req);

    const { dateString, dayKey } = getTodayInfo();

    const result = await pool.query(
      `
      SELECT
        r.*,

        lc.context_key AS learning_context_key,
        lc.name AS learning_context_name,
        lc.category AS learning_context_category,
        lc.icon AS learning_context_icon,
        lc.color AS learning_context_color,
        lc.description AS learning_context_description,

        COALESCE(
          steps_data.steps,
          '[]'::jsonb
        ) AS steps,

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
        rp.completer_access_profile
          AS today_completer_access_profile,
        rp.completer_relationship_key
          AS today_completer_relationship_key,
        rp.source AS today_completion_source,

        completer."firstName"
          AS today_completer_first_name,
        completer."lastName"
          AS today_completer_last_name,
        completer.avatar AS today_completer_avatar

      FROM "FloFlo".routine r

      LEFT JOIN "FloFlo".learning_context lc
        ON lc.id = r.learning_context_id

      LEFT JOIN LATERAL (
        SELECT
          jsonb_agg(
            jsonb_build_object(
              'id', rs.id,
              'routine_id', rs.routine_id,
              'title', rs.title,
              'description', rs.description,
              'icon', rs.icon,
              'position', rs.position,
              'estimated_minutes',
                rs.estimated_minutes,
              'is_optional', rs.is_optional,

              'completed_today',
                CASE
                  WHEN rsp.id IS NULL THEN FALSE
                  ELSE TRUE
                END,

              'completed_at', rsp.completed_at,
              'support_level', rsp.support_level
            )
            ORDER BY rs.position ASC
          ) AS steps

        FROM "FloFlo".routine_step rs

        LEFT JOIN "FloFlo".routine_step_progress rsp
          ON rsp.routine_step_id = rs.id
          AND rsp.user_id = $1
          AND rsp.completion_date = $2
          AND rsp.completed = TRUE

        WHERE rs.routine_id = r.id
          AND COALESCE(rs.is_active, TRUE) = TRUE
      ) steps_data ON TRUE

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
    console.error(
      "Error obteniendo rutinas de hoy:",
      error,
    );

    return res.status(error.statusCode || 500).json({
      message:
        error.message ||
        "Error obteniendo rutinas de hoy",
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
        r.learning_context_id,

        lc.context_key AS learning_context_key,
        lc.name AS learning_context_name,
        lc.category AS learning_context_category,
        lc.icon AS learning_context_icon,
        lc.color AS learning_context_color,
        lc.description AS learning_context_description,

        completer."firstName" AS completer_first_name,
        completer."lastName" AS completer_last_name,
        completer.avatar AS completer_avatar

      FROM "FloFlo".routine_progress rp

      INNER JOIN "FloFlo".routine r
        ON r.id = rp.routine_id
        AND r.user_id = rp.user_id

      LEFT JOIN "FloFlo".learning_context lc
      ON lc.id = r.learning_context_id

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
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      ownerId,
      actorId,
      isAdultManagingChild,
      accessProfile,
      relationshipKey,
    } = await resolveRoutineOwnerId(req, client);

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
      learning_context_id,
      steps,
    } = req.body;

    if (!name || !start_time || !end_time || !learning_context_id) {
      throw createHttpError(
        "name, start_time, end_time y learning_context_id son obligatorios",
        400,
      );
    }

    const cleanName = String(name).trim();

    const cleanDescription =
      typeof description === "string" ? description.trim() : "";

    const cleanStartTime = String(start_time).trim();
    const cleanEndTime = String(end_time).trim();

    const cleanDaysOfWeek = normalizeDaysOfWeek(days_of_week ?? daysOfWeek);

    if (!cleanName) {
      throw createHttpError("El nombre de la rutina es obligatorio", 400);
    }

    if (cleanEndTime <= cleanStartTime) {
      throw createHttpError(
        "La hora de término debe ser posterior a la hora de inicio",
        400,
      );
    }

    const learningContext = await validateLearningContext(
      learning_context_id,
      client,
    );

    const cleanSteps = normalizeRoutineSteps(steps);

    const routineResult = await client.query(
      `
      INSERT INTO "FloFlo".routine (
        user_id,
        name,
        description,
        start_time,
        end_time,
        days_of_week,
        learning_context_id,
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
        $7,
        TRUE,

        $8,
        $9,
        $10,

        $8,
        $9,
        $10,

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
        learningContext.id,

        actorId,
        accessProfile,
        relationshipKey,
      ],
    );

    const routine = routineResult.rows[0];
    const savedSteps = [];

    for (const step of cleanSteps) {
      const stepResult = await client.query(
        `
        INSERT INTO "FloFlo".routine_step (
          routine_id,
          title,
          description,
          icon,
          position,
          estimated_minutes,
          is_optional,
          is_active,
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
          $7,
          TRUE,
          NOW(),
          NOW()
        )
        RETURNING *
        `,
        [
          routine.id,
          step.title,
          step.description,
          step.icon,
          step.position,
          step.estimatedMinutes,
          step.isOptional,
        ],
      );

      savedSteps.push(stepResult.rows[0]);
    }

    await client.query("COMMIT");

    return res.status(201).json({
      message: isAdultManagingChild
        ? "Experiencia creada correctamente para el niño/a"
        : "Experiencia creada correctamente",

      managedByAdult: isAdultManagingChild,

      routine: {
        ...routine,

        learning_context_key: learningContext.context_key,

        learning_context_name: learningContext.name,

        learning_context_category: learningContext.category,

        learning_context_icon: learningContext.icon,

        learning_context_color: learningContext.color,

        learning_context_description: learningContext.description,

        managed_by_adult: isAdultManagingChild,

        steps: savedSteps,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error creando experiencia de rutina:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error creando experiencia de rutina",
    });
  } finally {
    client.release();
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
      learning_context_id,
    } = req.body;

    if (!name || !start_time || !end_time || !learning_context_id) {
      return res.status(400).json({
        message:
          "name, start_time, end_time y learning_context_id son obligatorios",
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
      ? normalizeDaysOfWeek(days_of_week ?? daysOfWeek)
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

    const learningContext = await validateLearningContext(learning_context_id);

    const result = await pool.query(
      `
      UPDATE "FloFlo".routine
      SET
        name = $1,
        description = $2,
        start_time = $3,
        end_time = $4,
        days_of_week = COALESCE(
          $5::TEXT[],
          days_of_week
        ),
        learning_context_id = $6,

        updated_by = $7,
        updater_access_profile = $8,
        updater_relationship_key = $9,

        updated_at = NOW()

      WHERE id = $10
        AND user_id = $11
        AND COALESCE(is_active, true) = true

      RETURNING *
      `,
      [
        cleanName,
        cleanDescription,
        cleanStartTime,
        cleanEndTime,
        cleanDaysOfWeek,
        learningContext.id,

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

    return res.json({
      ...result.rows[0],
      learning_context_key: learningContext.context_key,
      learning_context_name: learningContext.name,
      learning_context_category: learningContext.category,
      learning_context_icon: learningContext.icon,
      learning_context_color: learningContext.color,
      learning_context_description: learningContext.description,
      managed_by_adult: isAdultManagingChild,
    });
  } catch (error) {
    console.error("Error actualizando rutina:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error actualizando rutina",
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

const completeRoutineStep = async (req, res) => {
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

    const routineId = validatePositiveInteger(req.params.routineId, "Rutina");

    const stepId = validatePositiveInteger(req.params.stepId, "Paso");

    const { dateString } = getTodayInfo();

    const supportLevel =
      req.body?.support_level === undefined ||
      req.body?.support_level === null ||
      req.body?.support_level === ""
        ? null
        : String(req.body.support_level).trim();

    const notes =
      typeof req.body?.notes === "string" ? req.body.notes.trim() : null;

    const validSupportLevels = [
      "independent",
      "verbal",
      "visual",
      "gestural",
      "physical_partial",
      "physical_total",
    ];

    if (supportLevel !== null && !validSupportLevels.includes(supportLevel)) {
      throw createHttpError("Nivel de apoyo inválido", 400);
    }

    /*
     * Confirma que la rutina pertenece al niño/a
     * y que el paso pertenece a esa rutina.
     */
    const stepResult = await client.query(
      `
      SELECT
        r.id AS routine_id,
        r.name AS routine_name,

        rs.id AS step_id,
        rs.title AS step_title,
        rs.position,
        rs.icon,
        rs.is_optional

      FROM "FloFlo".routine r

      INNER JOIN "FloFlo".routine_step rs
        ON rs.routine_id = r.id
        AND COALESCE(rs.is_active, true) = true

      WHERE r.id = $1
        AND r.user_id = $2
        AND rs.id = $3
        AND COALESCE(r.is_active, true) = true

      LIMIT 1
      `,
      [routineId, ownerId, stepId],
    );

    if (stepResult.rows.length === 0) {
      throw createHttpError("El paso no pertenece a esta rutina", 404);
    }

    const routineStep = stepResult.rows[0];

    /*
     * Es idempotente:
     * si ya estaba marcado hoy, actualiza el mismo registro.
     */
    const progressResult = await client.query(
      `
      INSERT INTO "FloFlo".routine_step_progress (
        user_id,
        routine_id,
        routine_step_id,

        completed,
        completed_at,
        completion_date,

        completed_by,
        completer_access_profile,
        completer_relationship_key,
        source,

        support_level,
        notes,

        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,

        TRUE,
        NOW(),
        $4,

        $5,
        $6,
        $7,
        $8,

        $9,
        $10,

        NOW(),
        NOW()
      )

      ON CONFLICT (
        user_id,
        routine_step_id,
        completion_date
      )
      DO UPDATE SET
        completed = TRUE,
        completed_at = NOW(),

        completed_by = EXCLUDED.completed_by,
        completer_access_profile =
          EXCLUDED.completer_access_profile,
        completer_relationship_key =
          EXCLUDED.completer_relationship_key,
        source = EXCLUDED.source,

        support_level = EXCLUDED.support_level,
        notes = EXCLUDED.notes,

        updated_at = NOW()

      RETURNING *
      `,
      [
        ownerId,
        routineId,
        stepId,
        dateString,

        actorId,
        accessProfile,
        relationshipKey,
        source,

        supportLevel,
        notes,
      ],
    );

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Paso marcado como completado",

      managedByAdult: isAdultManagingChild,

      step: routineStep,
      progress: progressResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error completando paso de rutina:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "No se pudo completar el paso",
    });
  } finally {
    client.release();
  }
};

const uncompleteRoutineStep = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      ownerId,
      isAdultManagingChild,
    } = await resolveRoutineOwnerId(req, client);

    const routineId = validatePositiveInteger(
      req.params.routineId,
      "Rutina",
    );

    const stepId = validatePositiveInteger(
      req.params.stepId,
      "Paso",
    );

    const { dateString } = getTodayInfo();

    const stepResult = await client.query(
      `
      SELECT
        rs.id,
        rs.title
      FROM "FloFlo".routine_step rs

      INNER JOIN "FloFlo".routine r
        ON r.id = rs.routine_id

      WHERE r.id = $1
        AND r.user_id = $2
        AND rs.id = $3
        AND COALESCE(r.is_active, TRUE) = TRUE
        AND COALESCE(rs.is_active, TRUE) = TRUE

      LIMIT 1
      `,
      [routineId, ownerId, stepId],
    );

    if (stepResult.rows.length === 0) {
      throw createHttpError(
        "El paso no pertenece a esta rutina",
        404,
      );
    }

    const deletedResult = await client.query(
      `
      DELETE FROM "FloFlo".routine_step_progress

      WHERE user_id = $1
        AND routine_id = $2
        AND routine_step_id = $3
        AND completion_date = $4

      RETURNING *
      `,
      [
        ownerId,
        routineId,
        stepId,
        dateString,
      ],
    );

    await client.query("COMMIT");

    return res.json({
      message:
        deletedResult.rows.length > 0
          ? "Paso desmarcado correctamente"
          : "El paso ya estaba pendiente",

      managedByAdult: isAdultManagingChild,

      step: stepResult.rows[0],
      removed: deletedResult.rows.length > 0,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error(
      "Error desmarcando paso de rutina:",
      error,
    );

    return res.status(error.statusCode || 500).json({
      message:
        error.message ||
        "No se pudo desmarcar el paso",
    });
  } finally {
    client.release();
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
        SELECT
          r.*,

          lc.context_key AS learning_context_key,
          lc.name AS learning_context_name,
          lc.category AS learning_context_category,
          lc.icon AS learning_context_icon,
          lc.color AS learning_context_color

        FROM "FloFlo".routine r

        LEFT JOIN "FloFlo".learning_context lc
          ON lc.id = r.learning_context_id
          AND lc.is_active = true

        WHERE r.id = $1
          AND r.user_id = $2
          AND COALESCE(r.is_active, true) = true

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
    if (!alreadyCompleted && progressRow) {
      await publishLearningEvent(
        {
          idempotencyKey: `routine_progress:${progressRow.id}:completed`,

          eventType: COGNITIVE_EVENT_TYPES.ROUTINE_COMPLETED,

          childId: ownerId,
          actorUserId: actorId,

          sourceModule: "routines",
          sourceEntityType: "routine_progress",
          sourceEntityId: progressRow.id,

          conceptCodes: ["AUTONOMY", "TRANSITIONS"],

          context: {
            routineId: id,
            routineName: routine.name,
            scheduledDay: dayKey,
            completionDate: dateString,

            learningContext: {
              id: routine.learning_context_id || null,
              key: routine.learning_context_key || "unspecified",
              name: routine.learning_context_name || "Sin especificar",
              category: routine.learning_context_category || "environment",
              icon: routine.learning_context_icon || null,
              color: routine.learning_context_color || null,
            },

            source,
            accessProfile,
            relationshipKey,
          },

          payload: {
            completed: true,
            points: Number(progressRow.points || 1),
            routineId: id,
            routineProgressId: progressRow.id,
            startTime: routine.start_time,
            endTime: routine.end_time,
          },

          metadata: {
            managedByAdult: isAdultManagingChild,
            engineVersion: "1.0.0",
          },

          occurredAt: progressRow.completed_at,
        },
        client,
      );
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
  completeRoutineStep,
  uncompleteRoutineStep,
  completeRoutine,
};

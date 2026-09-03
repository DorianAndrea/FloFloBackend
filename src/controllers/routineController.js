const pool = require("../database/db");

const {
  getConceptsForExperience,
} = require("../cognitive-engine/services/frameworkConceptService");

const {
  checkAndUnlockAchievements,
} = require("../services/achievementService");
const {
  publishLearningEvent,
} = require("../cognitive-engine/services/cognitiveEventPublisher");
const {
  COGNITIVE_EVENT_TYPES,
} = require("../cognitive-engine/constants/cognitiveEventTypes");

const { getFloCard } = require("../cognitive-engine/services/floCardService");

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

    const floCardCode =
      step?.flocard_code === null ||
      step?.flocard_code === undefined ||
      step?.flocard_code === ""
        ? null
        : String(step.flocard_code).trim();

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
      flocard_code: floCardCode,
      position: index + 1,
      estimatedMinutes,
      isOptional: Boolean(step?.is_optional),
    };
  });
};

const getAdultChildAccess = async (adultId, childId, client = pool) => {
  const cleanAdultId = validatePositiveInteger(adultId, "Adulto");
  const cleanChildId = validatePositiveInteger(childId, "Niño/a");

  const result = await client.query(
    `
    SELECT
      pc.child_id,
      pc.relationship_key,
      pc.access_profile,
      pc.can_manage_team,
      pc.status

    FROM "FloFlo".parent_child pc

    INNER JOIN "FloFlo".child_profile child
      ON child.id = pc.child_id

    WHERE pc.parent_id = $1
      AND pc.child_id = $2
      AND pc.status = 'active'
      AND child.status = 'active'

    LIMIT 1
    `,
    [cleanAdultId, cleanChildId],
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
          WHEN rp.id IS NULL THEN FALSE
          ELSE TRUE
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
        completer.avatar
          AS today_completer_avatar

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
              'flocard_code', rs.flocard_code,
              'position', rs.position,
              'estimated_minutes', rs.estimated_minutes,
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
        AND COALESCE(r.is_active, TRUE) = TRUE

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
              'flocard_code', rs.flocard_code,
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
      experience_template_id,
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

    let cleanExperienceTemplateId = null;

    if (
      experience_template_id !== undefined &&
      experience_template_id !== null
    ) {
      cleanExperienceTemplateId = validatePositiveInteger(
        experience_template_id,
        "experience_template_id",
      );

      const templateResult = await client.query(
        `
    SELECT id
    FROM "FloFlo".experience_template
    WHERE id = $1
      AND is_active = TRUE
    `,
        [cleanExperienceTemplateId],
      );

      if (templateResult.rows.length === 0) {
        throw createHttpError(
          "La experiencia seleccionada no existe o está inactiva",
          400,
        );
      }
    }
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
        experience_template_id,
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
        $8,
        TRUE,

        $9,
        $10,
        $11,

        $9,
        $10,
        $11,

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
        cleanExperienceTemplateId,

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
      flocard_code,
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
      $8,
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
          step.flocard_code || null,
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

    const shouldUpdateDays =
      days_of_week !== undefined || daysOfWeek !== undefined;

    const cleanDaysOfWeek = shouldUpdateDays
      ? normalizeDaysOfWeek(days_of_week ?? daysOfWeek)
      : null;

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

    /*
     * Verifica primero que la rutina exista
     * y pertenezca al niño/a correcto.
     */
    const currentRoutineResult = await client.query(
      `
        SELECT *
        FROM "FloFlo".routine
        WHERE id = $1
          AND user_id = $2
          AND COALESCE(is_active, TRUE) = TRUE
        LIMIT 1
        `,
      [id, ownerId],
    );

    if (currentRoutineResult.rows.length === 0) {
      throw createHttpError("Rutina no encontrada", 404);
    }

    /*
     * Actualiza información principal.
     */
    const result = await client.query(
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
        AND COALESCE(is_active, TRUE) = TRUE

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

    /*
     * Si "steps" viene en el payload,
     * sincronizamos los pasos.
     *
     * Si no viene, dejamos los actuales intactos.
     */
    let savedSteps = null;

    if (steps !== undefined) {
      if (!Array.isArray(steps)) {
        throw createHttpError("steps debe ser una lista", 400);
      }

      if (steps.length === 0) {
        throw createHttpError(
          "La experiencia debe incluir al menos un paso",
          400,
        );
      }

      /*
       * Normalizamos utilizando la validación existente,
       * pero conservamos el id original cuando exista.
       */
      const normalizedSteps = normalizeRoutineSteps(steps).map(
        (step, index) => ({
          ...step,

          id:
            steps[index]?.id !== undefined && steps[index]?.id !== null
              ? validatePositiveInteger(steps[index].id, "Paso")
              : null,
        }),
      );

      const existingIds = normalizedSteps
        .filter((step) => step.id)
        .map((step) => step.id);

      /*
       * Desactivamos los pasos que fueron eliminados
       * desde el Builder.
       *
       * No los borramos físicamente para conservar
       * historial y trazabilidad.
       */
      if (existingIds.length > 0) {
        await client.query(
          `
          UPDATE "FloFlo".routine_step
          SET
            is_active = FALSE,
            updated_at = NOW()
          WHERE routine_id = $1
            AND COALESCE(is_active, TRUE) = TRUE
            AND NOT (id = ANY($2::BIGINT[]))
          `,
          [id, existingIds],
        );
      } else {
        await client.query(
          `
          UPDATE "FloFlo".routine_step
          SET
            is_active = FALSE,
            updated_at = NOW()
          WHERE routine_id = $1
            AND COALESCE(is_active, TRUE) = TRUE
          `,
          [id],
        );
      }

      savedSteps = [];

      for (const step of normalizedSteps) {
        /*
         * PASO EXISTENTE
         */
        if (step.id) {
          const stepResult = await client.query(
            `
              UPDATE "FloFlo".routine_step
              SET
                title = $1,
                description = $2,
                icon = $3,
                flocard_code = $4,
                position = $5,
                estimated_minutes = $6,
                is_optional = $7,
                is_active = TRUE,
                updated_at = NOW()

              WHERE id = $8
                AND routine_id = $9

              RETURNING *
              `,
            [
              step.title,
              step.description,
              step.icon,
              step.flocardCode ?? step.flocard_code ?? null,
              step.position,
              step.estimatedMinutes,
              step.isOptional,

              step.id,
              id,
            ],
          );

          if (stepResult.rows.length === 0) {
            throw createHttpError(
              `El paso ${step.id} no pertenece a esta rutina`,
              400,
            );
          }

          savedSteps.push(stepResult.rows[0]);

          continue;
        }

        /*
         * PASO NUEVO
         */
        const stepInsertValues = [
          id,
          step.title,
          step.description,
          step.icon,
          step.flocard_code ?? null,
          step.position,
          step.estimatedMinutes,
          step.isOptional,
        ];

        console.log("🧩 INSERT STEP DEBUG:", {
          valuesLength: stepInsertValues.length,
          values: stepInsertValues,
          step,
        });

        const stepResult = await client.query(
          `
  INSERT INTO "FloFlo".routine_step (
    routine_id,
    title,
    description,
    icon,
    flocard_code,
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
    $8,
    TRUE,
    NOW(),
    NOW()
  )
  RETURNING *
  `,
          stepInsertValues,
        );

        savedSteps.push(stepResult.rows[0]);
      }
    }

    /*
     * Si el frontend no envió steps,
     * devolvemos los pasos activos actuales.
     */
    if (savedSteps === null) {
      const stepsResult = await client.query(
        `
          SELECT *
          FROM "FloFlo".routine_step
          WHERE routine_id = $1
            AND COALESCE(is_active, TRUE) = TRUE
          ORDER BY position ASC
          `,
        [id],
      );

      savedSteps = stepsResult.rows;
    }

    await client.query("COMMIT");

    return res.json({
      ...result.rows[0],

      learning_context_key: learningContext.context_key,

      learning_context_name: learningContext.name,

      learning_context_category: learningContext.category,

      learning_context_icon: learningContext.icon,

      learning_context_color: learningContext.color,

      learning_context_description: learningContext.description,

      managed_by_adult: isAdultManagingChild,

      steps: savedSteps,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error actualizando rutina:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error actualizando rutina",
    });
  } finally {
    client.release();
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

    const interactionResult =
      req.body?.interaction_result &&
      typeof req.body.interaction_result === "object" &&
      !Array.isArray(req.body.interaction_result)
        ? req.body.interaction_result
        : null;

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
        r.experience_template_id,

        lc.id AS learning_context_id,
        lc.context_key AS learning_context_key,
        lc.name AS learning_context_name,
        lc.category AS learning_context_category,
        lc.icon AS learning_context_icon,
        lc.color AS learning_context_color,

        rs.id AS step_id,
        rs.title AS step_title,
        rs.position,
        rs.icon,
        rs.flocard_code,
        rs.is_optional

      FROM "FloFlo".routine r

      INNER JOIN "FloFlo".routine_step rs
        ON rs.routine_id = r.id
        AND COALESCE(rs.is_active, true) = true

      LEFT JOIN "FloFlo".learning_context lc
        ON lc.id = r.learning_context_id

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

    const stepProgress = progressResult.rows[0];

    let stepConceptCodes = [];

    if (routineStep.flocard_code) {
      const floCard = getFloCard(routineStep.flocard_code);

      if (floCard) {
        stepConceptCodes = Array.isArray(floCard.concepts)
          ? floCard.concepts
          : [];
      }
    }

    if (stepConceptCodes.length === 0 && routineStep.experience_template_id) {
      const templateResult = await client.query(
        `
    SELECT code
    FROM "FloFlo".experience_template
    WHERE id = $1
      AND is_active = TRUE
    LIMIT 1
    `,
        [routineStep.experience_template_id],
      );

      const templateCode = templateResult.rows[0]?.code || null;

      if (templateCode) {
        const concepts = getConceptsForExperience(templateCode);

        stepConceptCodes = concepts.map((concept) => concept.code);
      }
    }

    if (stepConceptCodes.length > 0) {
      await publishLearningEvent(
        {
          idempotencyKey: `routine_step_progress:${stepProgress.id}:completed`,

          eventType: COGNITIVE_EVENT_TYPES.ROUTINE_STEP_COMPLETED,

          childId: ownerId,
          actorUserId: actorId,

          sourceModule: "routines",

          sourceEntityType: "routine_step_progress",
          sourceEntityId: stepProgress.id,

          conceptCodes: stepConceptCodes,

          context: {
            routineId,
            routineName: routineStep.routine_name,

            stepId: routineStep.step_id,
            stepTitle: routineStep.step_title,
            stepPosition: routineStep.position,

            floCardCode: routineStep.flocard_code || null,

            learningContext: {
              id: routineStep.learning_context_id,
              key: routineStep.learning_context_key || "unspecified",
              name: routineStep.learning_context_name || "Sin especificar",
              category: routineStep.learning_context_category || "environment",
              icon: routineStep.learning_context_icon || null,
              color: routineStep.learning_context_color || null,
            },

            source,
            accessProfile,
            relationshipKey,
          },

          payload: {
            completed: true,

            supportLevel: stepProgress.support_level || null,

            notes: stepProgress.notes || null,

            interactionResult,
          },

          metadata: {
            managedByAdult: isAdultManagingChild,
            engineVersion: "1.0.0",
          },

          occurredAt: stepProgress.completed_at,
        },
        client,
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Paso marcado como completado",

      managedByAdult: isAdultManagingChild,

      step: routineStep,
      progress: stepProgress,
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

const completeRoutineStepSequence = async (req, res) => {
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

    const triggerStepId = validatePositiveInteger(req.params.stepId, "Paso");

    const { dateString } = getTodayInfo();

    const rawStepIds = req.body?.step_ids;

    if (!Array.isArray(rawStepIds) || rawStepIds.length === 0) {
      throw createHttpError(
        "step_ids debe contener los pasos completados por la secuencia",
        400,
      );
    }

    const stepIds = [
      ...new Set(
        rawStepIds.map((stepId) =>
          validatePositiveInteger(stepId, "Paso de secuencia"),
        ),
      ),
    ];

    if (!stepIds.includes(triggerStepId)) {
      throw createHttpError(
        "El paso que inició la FloCard debe estar incluido en step_ids",
        400,
      );
    }

    const supportLevel =
      req.body?.support_level === undefined ||
      req.body?.support_level === null ||
      req.body?.support_level === ""
        ? null
        : String(req.body.support_level).trim();

    const notes =
      typeof req.body?.notes === "string" ? req.body.notes.trim() : null;

    const interactionResult =
      req.body?.interaction_result &&
      typeof req.body.interaction_result === "object" &&
      !Array.isArray(req.body.interaction_result)
        ? req.body.interaction_result
        : null;

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
     * Recupera la rutina y el paso que abrió la FloCard.
     */
    const triggerResult = await client.query(
      `
      SELECT
        r.id AS routine_id,
        r.name AS routine_name,
        r.experience_template_id,

        lc.id AS learning_context_id,
        lc.context_key AS learning_context_key,
        lc.name AS learning_context_name,
        lc.category AS learning_context_category,
        lc.icon AS learning_context_icon,
        lc.color AS learning_context_color,

        rs.id AS step_id,
        rs.title AS step_title,
        rs.position AS step_position,
        rs.flocard_code

      FROM "FloFlo".routine r

      INNER JOIN "FloFlo".routine_step rs
        ON rs.routine_id = r.id
        AND COALESCE(rs.is_active, TRUE) = TRUE

      LEFT JOIN "FloFlo".learning_context lc
        ON lc.id = r.learning_context_id

      WHERE r.id = $1
        AND r.user_id = $2
        AND rs.id = $3
        AND COALESCE(r.is_active, TRUE) = TRUE

      LIMIT 1
      `,
      [routineId, ownerId, triggerStepId],
    );

    if (triggerResult.rows.length === 0) {
      throw createHttpError("El paso no pertenece a esta rutina", 404);
    }

    const triggerStep = triggerResult.rows[0];

    if (!triggerStep.flocard_code) {
      throw createHttpError(
        "El paso que inició la secuencia no tiene una FloCard asociada",
        400,
      );
    }

    const floCard = getFloCard(triggerStep.flocard_code);

    if (!floCard) {
      throw createHttpError(
        `FloCard no encontrada: ${triggerStep.flocard_code}`,
        400,
      );
    }

    const interactionType =
      floCard.interaction_type || floCard.interactionType || null;

    if (interactionType !== "sequence") {
      throw createHttpError(
        "La FloCard asociada a este paso no es de tipo sequence",
        400,
      );
    }

    /*
     * Valida que todos los pasos enviados pertenezcan
     * realmente a esta rutina.
     */
    const sequenceStepsResult = await client.query(
      `
      SELECT
        rs.id,
        rs.title,
        rs.position,
        rs.icon,
        rs.flocard_code,
        rs.is_optional

      FROM "FloFlo".routine_step rs

      INNER JOIN "FloFlo".routine r
        ON r.id = rs.routine_id

      WHERE r.id = $1
        AND r.user_id = $2
        AND rs.id = ANY($3::BIGINT[])
        AND COALESCE(r.is_active, TRUE) = TRUE
        AND COALESCE(rs.is_active, TRUE) = TRUE

      ORDER BY rs.position ASC
      `,
      [routineId, ownerId, stepIds],
    );

    if (sequenceStepsResult.rows.length !== stepIds.length) {
      throw createHttpError(
        "Uno o más pasos de la secuencia no pertenecen a esta rutina",
        400,
      );
    }

    const sequenceSteps = sequenceStepsResult.rows;

    const savedProgress = [];

    /*
     * Marca TODOS los pasos de la secuencia.
     */
    for (const step of sequenceSteps) {
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
          step.id,
          dateString,

          actorId,
          accessProfile,
          relationshipKey,
          source,

          supportLevel,
          notes,
        ],
      );

      savedProgress.push(progressResult.rows[0]);
    }

    /*
     * Una secuencia genera UNA sola evidencia cognitiva.
     */
    const conceptCodes = Array.isArray(floCard.concepts)
      ? floCard.concepts
      : [];

    if (conceptCodes.length > 0) {
      const sourceProgress =
        savedProgress.find(
          (progress) => Number(progress.routine_step_id) === triggerStepId,
        ) || savedProgress[0];

      await publishLearningEvent(
        {
          idempotencyKey:
            `routine_step_sequence:${routineId}:` +
            `${triggerStep.flocard_code}:${dateString}`,

          eventType: COGNITIVE_EVENT_TYPES.FLOCARD_COMPLETED,

          childId: ownerId,
          actorUserId: actorId,

          sourceModule: "routines",

          sourceEntityType: "routine_step_progress",
          sourceEntityId: sourceProgress.id,

          conceptCodes,

          context: {
            routineId,
            routineName: triggerStep.routine_name,

            stepId: triggerStep.step_id,
            stepTitle: triggerStep.step_title,
            stepPosition: triggerStep.step_position,

            floCardCode: triggerStep.flocard_code,

            sequenceStepIds: sequenceSteps.map((step) => step.id),

            sequenceSteps: sequenceSteps.map((step) => ({
              id: step.id,
              title: step.title,
              position: step.position,
            })),

            learningContext: {
              id: triggerStep.learning_context_id,

              key: triggerStep.learning_context_key || "unspecified",

              name: triggerStep.learning_context_name || "Sin especificar",

              category: triggerStep.learning_context_category || "environment",

              icon: triggerStep.learning_context_icon || null,

              color: triggerStep.learning_context_color || null,
            },

            source,
            accessProfile,
            relationshipKey,
          },

          payload: {
            completed: true,

            completedStepCount: sequenceSteps.length,

            supportLevel,
            notes,

            interactionResult: {
              ...(interactionResult || {}),

              completed: true,

              totalSteps: sequenceSteps.length,

              completedStepIds: sequenceSteps.map((step) => step.id),
            },
          },

          metadata: {
            managedByAdult: isAdultManagingChild,

            completionMode: "flocard_sequence",

            engineVersion: "1.0.0",
          },

          occurredAt: sourceProgress.completed_at,
        },
        client,
      );
    }

    /*
     * Comprueba cuántos pasos obligatorios de la rutina
     * quedaron completados.
     */
    const requiredProgressResult = await client.query(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE COALESCE(rs.is_optional, FALSE) = FALSE
        )::INT AS total_required,

        COUNT(*) FILTER (
          WHERE COALESCE(rs.is_optional, FALSE) = FALSE
            AND rsp.id IS NOT NULL
            AND rsp.completed = TRUE
        )::INT AS completed_required

      FROM "FloFlo".routine_step rs

      LEFT JOIN "FloFlo".routine_step_progress rsp
        ON rsp.routine_step_id = rs.id
        AND rsp.user_id = $2
        AND rsp.completion_date = $3
        AND rsp.completed = TRUE

      WHERE rs.routine_id = $1
        AND COALESCE(rs.is_active, TRUE) = TRUE
      `,
      [routineId, ownerId, dateString],
    );

    const requiredProgress = requiredProgressResult.rows[0];

    const allRequiredStepsCompleted =
      Number(requiredProgress.total_required) > 0 &&
      Number(requiredProgress.completed_required) ===
        Number(requiredProgress.total_required);

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Secuencia FloCard completada correctamente",

      managedByAdult: isAdultManagingChild,

      floCard: {
        code: floCard.code,
        name: floCard.name,
      },

      completedSteps: sequenceSteps,

      progress: savedProgress,

      allRequiredStepsCompleted,

      requiredProgress: {
        completed: Number(requiredProgress.completed_required || 0),

        total: Number(requiredProgress.total_required || 0),
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error completando secuencia FloCard:", error);

    return res.status(error.statusCode || 500).json({
      message:
        error.message || "No se pudo completar la secuencia de la FloCard",
    });
  } finally {
    client.release();
  }
};

const startRoutineStepFloCard = async (req, res) => {
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

    /*
     * Verifica que:
     * - la rutina pertenece al niño/a;
     * - el paso pertenece a la rutina;
     * - el paso tiene una FloCard;
     * - recuperamos también el contexto de aprendizaje.
     */
    const stepResult = await client.query(
      `
      SELECT
        r.id AS routine_id,
        r.name AS routine_name,
        r.experience_template_id,

        lc.id AS learning_context_id,
        lc.context_key AS learning_context_key,
        lc.name AS learning_context_name,
        lc.category AS learning_context_category,
        lc.icon AS learning_context_icon,
        lc.color AS learning_context_color,

        rs.id AS step_id,
        rs.title AS step_title,
        rs.position,
        rs.icon,
        rs.flocard_code,
        rs.is_optional

      FROM "FloFlo".routine r

      INNER JOIN "FloFlo".routine_step rs
        ON rs.routine_id = r.id
        AND COALESCE(rs.is_active, TRUE) = TRUE

      LEFT JOIN "FloFlo".learning_context lc
        ON lc.id = r.learning_context_id

      WHERE r.id = $1
        AND r.user_id = $2
        AND rs.id = $3
        AND COALESCE(r.is_active, TRUE) = TRUE

      LIMIT 1
      `,
      [routineId, ownerId, stepId],
    );

    if (stepResult.rows.length === 0) {
      throw createHttpError("El paso no pertenece a esta rutina", 404);
    }

    const routineStep = stepResult.rows[0];

    if (!routineStep.flocard_code) {
      throw createHttpError("Este paso no tiene una FloCard asociada", 400);
    }

    /*
     * Obtiene la definición oficial de la FloCard.
     */
    const floCard = getFloCard(routineStep.flocard_code);

    if (!floCard) {
      throw createHttpError(
        `FloCard no encontrada: ${routineStep.flocard_code}`,
        400,
      );
    }

    /*
     * FLOCARD_STARTED representa interacción/exposición.
     *
     * No estamos marcando el paso como completado
     * ni creando routine_step_progress.
     */
    const startedAt = new Date();

    const { dateString } = getTodayInfo();

    const eventResult = await publishLearningEvent(
      {
        /*
         * Una FloCard puede iniciarse nuevamente otro día.
         * La fecha evita bloquear para siempre futuros inicios.
         */
        idempotencyKey: `routine_step:${stepId}:flocard_started:${dateString}`,

        eventType: COGNITIVE_EVENT_TYPES.FLOCARD_STARTED,

        childId: ownerId,
        actorUserId: actorId,

        sourceModule: "routines",

        sourceEntityType: "routine_step",
        sourceEntityId: stepId,

        conceptCodes: Array.isArray(floCard.concepts) ? floCard.concepts : [],

        context: {
          routineId,
          routineName: routineStep.routine_name,

          stepId: routineStep.step_id,
          stepTitle: routineStep.step_title,
          stepPosition: routineStep.position,

          floCardCode: routineStep.flocard_code,

          learningContext: {
            id: routineStep.learning_context_id,
            key: routineStep.learning_context_key || "unspecified",
            name: routineStep.learning_context_name || "Sin especificar",
            category: routineStep.learning_context_category || "environment",
            icon: routineStep.learning_context_icon || null,
            color: routineStep.learning_context_color || null,
          },

          source,
          accessProfile,
          relationshipKey,
        },

        payload: {
          started: true,
        },

        metadata: {
          managedByAdult: isAdultManagingChild,
          engineVersion: "1.0.0",
        },

        occurredAt: startedAt,
      },
      client,
    );

    await client.query("COMMIT");

    return res.status(eventResult.created ? 201 : 200).json({
      message: eventResult.created
        ? "FloCard iniciada correctamente"
        : "La FloCard ya había sido iniciada hoy",

      managedByAdult: isAdultManagingChild,

      floCard: {
        code: floCard.code,
        name: floCard.name,
      },

      event: eventResult.event,
      duplicate: eventResult.duplicate,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error iniciando FloCard de rutina:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "No se pudo registrar el inicio de la FloCard",
    });
  } finally {
    client.release();
  }
};

const uncompleteRoutineStep = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { ownerId, isAdultManagingChild } = await resolveRoutineOwnerId(
      req,
      client,
    );

    const routineId = validatePositiveInteger(req.params.routineId, "Rutina");

    const stepId = validatePositiveInteger(req.params.stepId, "Paso");

    const { dateString } = getTodayInfo();

    const stepResult = await client.query(
      `
      SELECT
        rs.id,
        rs.title,
        rs.icon,
        rs.flocard_code,
        rs.position,
        rs.description,
        rs.estimated_minutes,
        rs.is_optional
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
      throw createHttpError("El paso no pertenece a esta rutina", 404);
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
      [ownerId, routineId, stepId, dateString],
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

    console.error("Error desmarcando paso de rutina:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "No se pudo desmarcar el paso",
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
    let conceptCodes = [];

    if (routine.experience_template_id) {
      const templateResult = await client.query(
        `
    SELECT code
    FROM "FloFlo".experience_template
    WHERE id = $1
      AND is_active = TRUE
    LIMIT 1
    `,
        [routine.experience_template_id],
      );

      const templateCode = templateResult.rows[0]?.code || null;

      if (templateCode) {
        const concepts = getConceptsForExperience(templateCode);

        conceptCodes = concepts.map((concept) => concept.code);

        console.log(
          "[Cognitive Engine] templateCode:",
          templateCode,
          "conceptCodes:",
          conceptCodes,
        );
      }
    }
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
    if (!alreadyCompleted && progressRow && conceptCodes.length > 0) {
      await publishLearningEvent(
        {
          idempotencyKey: `routine_progress:${progressRow.id}:completed`,

          eventType: COGNITIVE_EVENT_TYPES.ROUTINE_COMPLETED,

          childId: ownerId,
          actorUserId: actorId,

          sourceModule: "routines",
          sourceEntityType: "routine_progress",
          sourceEntityId: progressRow.id,

          conceptCodes,

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
      if (!alreadyCompleted && progressRow && conceptCodes.length === 0) {
        console.warn(
          `[Cognitive Engine] Rutina ${routine.id} (${routine.name}) completada sin conceptos FCF. No se publicó evento cognitivo.`,
        );
      }
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
  completeRoutineStepSequence,
  uncompleteRoutineStep,
  startRoutineStepFloCard,
  completeRoutine,
};

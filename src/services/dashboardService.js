const pool = require("../database/db");

const APP_TIMEZONE = process.env.APP_TIMEZONE || "America/Santiago";

const SUPPORT_LEVELS = [
  "independent",
  "verbal",
  "visual",
  "gestural",
  "physical_partial",
  "physical_total",
];

/*
 * Lectura del Dashboard para cuidadores y profesionales vinculados.
 * La autorización requiere además una relación parent_child activa,
 * un perfil infantil activo y una cuenta activa.
 * No incluir "family" sin definir expresamente ese permiso.
 */
const DASHBOARD_ACCESS_PROFILES = [
  "primary_caregiver",
  "caregiver",
  "therapist",
  "teacher",
  "professional",
];

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const validatePositiveInteger = (value, label) => {
  const numberValue = Number(value);

  if (!Number.isSafeInteger(numberValue) || numberValue <= 0) {
    throw createHttpError(`${label} inválido`, 400);
  }

  return numberValue;
};

/*
 * Resumen general de todos los niños autorizados.
 *
 * Cada perfil conserva sus propios indicadores.
 * No se calculan promedios cognitivos entre niños.
 */

const getDashboardOverview = async (actorUserId) => {
  const actorId = validatePositiveInteger(actorUserId, "Usuario");

  const result = await pool.query(
    `
    WITH period AS (
      SELECT
        (NOW() AT TIME ZONE $2::TEXT)::DATE AS today
    ),

    authorized_children AS (
      SELECT DISTINCT
        cp.id AS child_id,
        cp.first_name,
        cp.last_name,
        cp.avatar_url

      FROM "FloFlo".parent_child pc

      INNER JOIN "FloFlo".child_profile cp
        ON cp.id = pc.child_id

      INNER JOIN "FloFlo"."user" u
        ON u.id = pc.parent_id

      WHERE pc.parent_id = $1
        AND u.role = 'parent'
        AND u.is_active = TRUE
        AND pc.status = 'active'
        AND cp.status = 'active'
        AND pc.access_profile = ANY($3::TEXT[])
    )

    SELECT
      ac.child_id,
      ac.first_name,
      ac.last_name,
      ac.avatar_url,

      (p.today - 6)::TEXT AS period_start,
      p.today::TEXT AS period_end,

      (
        SELECT COUNT(*)
        FROM "FloFlo".routine r
        WHERE r.user_id = ac.child_id
          AND COALESCE(r.is_active, TRUE) = TRUE
      ) AS active_routines,

      (
        SELECT COUNT(*)

        FROM "FloFlo".routine_progress rp

        INNER JOIN "FloFlo".routine r
          ON r.id = rp.routine_id
          AND r.user_id = rp.user_id

        WHERE rp.user_id = ac.child_id
          AND rp.completed = TRUE
          AND rp.completion_date BETWEEN
            p.today - 6 AND p.today
      ) AS completed_routines_7d,

      (
        SELECT COUNT(*)

        FROM "FloFlo".routine_progress rp

        INNER JOIN "FloFlo".routine r
          ON r.id = rp.routine_id
          AND r.user_id = rp.user_id

        WHERE rp.user_id = ac.child_id
          AND rp.completed = TRUE
      ) AS completed_routines_total,

      (
        SELECT COUNT(*)

        FROM "FloFlo".routine_step_progress rsp

        INNER JOIN "FloFlo".routine r
          ON r.id = rsp.routine_id
          AND r.user_id = rsp.user_id

        INNER JOIN "FloFlo".routine_step rs
          ON rs.id = rsp.routine_step_id
          AND rs.routine_id = rsp.routine_id

        WHERE rsp.user_id = ac.child_id
          AND rsp.completed = TRUE
          AND rsp.completion_date BETWEEN
            p.today - 6 AND p.today
      ) AS completed_steps_7d,

      (
        SELECT COUNT(*)
        FROM "FloFlo".cognitive_evidence ce
        WHERE ce.child_id = ac.child_id
      ) AS cognitive_evidence_count,

      (
        SELECT COUNT(DISTINCT cm.concept_id)
        FROM "FloFlo".child_concept_mastery cm
        WHERE cm.child_id = ac.child_id
      ) AS tracked_concepts,

      (
        SELECT MAX(rp.completion_date)::TEXT

        FROM "FloFlo".routine_progress rp

        INNER JOIN "FloFlo".routine r
          ON r.id = rp.routine_id
          AND r.user_id = rp.user_id

        WHERE rp.user_id = ac.child_id
          AND rp.completed = TRUE
      ) AS last_routine_completion

    FROM authorized_children ac

    CROSS JOIN period p

    ORDER BY ac.child_id
    `,
    [actorId, APP_TIMEZONE, DASHBOARD_ACCESS_PROFILES],
  );

  const children = result.rows.map((row) => ({
    child_id: row.child_id,
    first_name: row.first_name,
    last_name: row.last_name,
    avatar_url: row.avatar_url,

    period: {
      start: row.period_start,
      end: row.period_end,
      timezone: APP_TIMEZONE,
    },

    routines: {
      active: Number(row.active_routines),
      completed_7d: Number(row.completed_routines_7d),
      completed_total: Number(row.completed_routines_total),
      last_completion: row.last_routine_completion,
    },

    steps: {
      completed_7d: Number(row.completed_steps_7d),
    },

    cognitive: {
      evidence_count: Number(row.cognitive_evidence_count),
      tracked_concepts: Number(row.tracked_concepts),
    },
  }));

  return {
    generated_at: new Date().toISOString(),

    summary: {
      total_children: children.length,

      active_routines: children.reduce(
        (total, child) => total + child.routines.active,
        0,
      ),

      completed_routines_7d: children.reduce(
        (total, child) => total + child.routines.completed_7d,
        0,
      ),

      completed_steps_7d: children.reduce(
        (total, child) => total + child.steps.completed_7d,
        0,
      ),
    },

    children,
  };
};

/*
 * Distribución histórica de niveles de apoyo.
 *
 * Solo considera pasos marcados como completados.
 * Los registros sin apoyo informado se mantienen
 * separados de los registros independientes.
 */

// Una observación puede contener varios apoyos; el paso se cuenta solo una vez.
const createSupportMetrics = () => ({
  total_completed_steps: 0,
  documented_support_steps: 0,
  unspecified_support_steps: 0,
  unknown_support_steps: 0,
  support_distribution: Object.fromEntries(SUPPORT_LEVELS.map((code) => [code, 0])),
});

const accumulateSupportMetrics = (target, observationId, codes) => {
  target.total_completed_steps += 1;
  if (observationId == null) {
    target.unspecified_support_steps += 1;
    return;
  }

  const unique = [...new Set(Array.isArray(codes) ? codes : [])];
  const recognized = unique.filter((code) => SUPPORT_LEVELS.includes(code));
  const valid = recognized.length > 0 && recognized.length === unique.length &&
    !(recognized.includes("independent") && recognized.length > 1);

  if (!valid) {
    target.unknown_support_steps += 1;
    return;
  }

  target.documented_support_steps += 1;
  for (const code of recognized) target.support_distribution[code] += 1;
};

const withSupportPercentage = (metrics) => ({
  ...metrics,
  independent_steps_percentage: metrics.documented_support_steps > 0
    ? Number((metrics.support_distribution.independent /
      metrics.documented_support_steps * 100).toFixed(1))
    : null,
});

const getChildSupportOverview = async (actorUserId, childId) => {
  const actorId = validatePositiveInteger(actorUserId, "Usuario");
  const cleanChildId = validatePositiveInteger(childId, "Niño/a");

  const result = await pool.query(`
    WITH authorized_child AS (
      SELECT DISTINCT cp.id AS child_id
      FROM "FloFlo".parent_child pc
      JOIN "FloFlo".child_profile cp ON cp.id = pc.child_id
      JOIN "FloFlo"."user" u ON u.id = pc.parent_id
      WHERE pc.parent_id = $1 AND pc.child_id = $2
        AND pc.status = 'active' AND cp.status = 'active'
        AND u.is_active = TRUE AND u.role = 'parent'
        AND pc.access_profile = ANY($3::TEXT[])
    )
    SELECT ac.child_id, rsp.id AS progress_id,
           obs.observation_id,
           obs.support_codes
    FROM authorized_child ac
    LEFT JOIN "FloFlo".routine_step_progress rsp
      ON rsp.user_id = ac.child_id AND rsp.completed = TRUE
      AND EXISTS (
        SELECT 1 FROM "FloFlo".routine r
        JOIN "FloFlo".routine_step rs
          ON rs.routine_id = r.id
        WHERE r.id = rsp.routine_id
          AND r.user_id = rsp.user_id
          AND rs.id = rsp.routine_step_id
      )
    LEFT JOIN LATERAL (
      SELECT so.id AS observation_id,
             ARRAY(
               SELECT DISTINCT st.code
               FROM "FloFlo".support_observation_type sot
               JOIN "FloFlo".support_type st ON st.id = sot.support_type_id
               WHERE sot.observation_id = so.id
             ) AS support_codes
      FROM "FloFlo".support_observation so
      WHERE so.person_id = ac.child_id
        AND so.source_module = 'routines'
        AND so.source_entity_type = 'routine_step_progress'
        AND so.source_entity_id = rsp.id
      ORDER BY so.id DESC
      LIMIT 1
    ) obs ON TRUE
    ORDER BY rsp.id
  `, [actorId, cleanChildId, DASHBOARD_ACCESS_PROFILES]);

  if (!result.rows.length) {
    throw createHttpError("No tienes permiso para consultar este perfil", 403);
  }

  const metrics = createSupportMetrics();
  for (const row of result.rows) {
    if (row.progress_id === null) continue;
    accumulateSupportMetrics(metrics, row.observation_id, row.support_codes);
  }

  return {
    child_id: cleanChildId,
    period: "all_time",
    ...withSupportPercentage(metrics),
    has_data: metrics.total_completed_steps > 0,
  };
};

/*
 * Resumen individual de un perfil infantil.
 *
 * Reutiliza los indicadores del Dashboard general
 * y mantiene las restricciones de acceso.
 */

const getChildDashboardOverview = async (actorUserId, childId) => {
  const actorId = validatePositiveInteger(actorUserId, "Usuario");

  const cleanChildId = validatePositiveInteger(childId, "Niño/a");

  const dashboard = await getDashboardOverview(actorId);

  const child = dashboard.children.find(
    (item) => Number(item.child_id) === cleanChildId,
  );

  if (!child) {
    throw createHttpError("No tienes permiso para consultar este perfil", 403);
  }

  return {
    generated_at: dashboard.generated_at,
    ...child,
  };
};

/*
 * Dashboard detallado de autonomía.
 *
 * Recupera las rutinas, sus acciones y los
 * registros históricos de niveles de apoyo.
 *
 * No calcula estados de dominio cognitivo.
 */

const getChildRoutineAnalytics = async (actorUserId, childId) => {
  const actorId = validatePositiveInteger(actorUserId, "Usuario");

  const cleanChildId = validatePositiveInteger(childId, "Niño/a");

  const result = await pool.query(
    `
    WITH authorized_child AS (
      SELECT DISTINCT
        cp.id AS child_id

      FROM "FloFlo".parent_child pc

      INNER JOIN "FloFlo".child_profile cp
        ON cp.id = pc.child_id

      INNER JOIN "FloFlo"."user" u
        ON u.id = pc.parent_id

      WHERE pc.parent_id = $1
        AND pc.child_id = $2
        AND pc.status = 'active'
        AND cp.status = 'active'
        AND u.is_active = TRUE
        AND u.role = 'parent'
        AND pc.access_profile = ANY($3::TEXT[])
    ),

        child_routines AS (
        SELECT
          r.id AS routine_id,
          r.user_id AS child_id,
          r.name AS routine_name,
          r.experience_template_id,
          r.start_time,
          r.end_time,
          r.days_of_week,
          r.created_at,
          COALESCE(r.is_active, TRUE) AS is_active

      FROM "FloFlo".routine r

      INNER JOIN authorized_child ac
        ON ac.child_id = r.user_id
    ),

    routine_completions AS (
      SELECT
        rp.routine_id,
        COUNT(*) AS completed_total

      FROM "FloFlo".routine_progress rp

      INNER JOIN child_routines cr
        ON cr.routine_id = rp.routine_id
        AND cr.child_id = rp.user_id

      WHERE rp.completed = TRUE

      GROUP BY rp.routine_id
    ),

    step_records AS (
      SELECT rsp.routine_id, rsp.routine_step_id,
             rsp.completion_date,
             obs.observation_id, obs.support_codes
      FROM "FloFlo".routine_step_progress rsp
      JOIN child_routines cr
        ON cr.routine_id = rsp.routine_id AND cr.child_id = rsp.user_id
      JOIN "FloFlo".routine_step rs
        ON rs.id = rsp.routine_step_id AND rs.routine_id = rsp.routine_id
      LEFT JOIN LATERAL (
        SELECT so.id AS observation_id,
               ARRAY(
                 SELECT DISTINCT st.code
                 FROM "FloFlo".support_observation_type sot
                 JOIN "FloFlo".support_type st ON st.id = sot.support_type_id
                 WHERE sot.observation_id = so.id
               ) AS support_codes
        FROM "FloFlo".support_observation so
        WHERE so.person_id = cr.child_id
          AND so.source_module = 'routines'
          AND so.source_entity_type = 'routine_step_progress'
          AND so.source_entity_id = rsp.id
        ORDER BY so.id DESC LIMIT 1
      ) obs ON TRUE
      WHERE rsp.completed = TRUE
    )

    SELECT
      ac.child_id,

      cr.routine_id,
      cr.routine_name,
      cr.experience_template_id,
      cr.start_time,
      cr.end_time,
      cr.days_of_week,
      cr.created_at AS routine_created_at,
      cr.is_active AS routine_is_active,

      COALESCE(
        rc.completed_total,
        0
      ) AS completed_total,

      rs.id AS step_id,
      rs.title AS step_title,
      rs.position AS step_position,
      COALESCE(
        rs.is_active,
        TRUE
      ) AS step_is_active,

      sr.completion_date::TEXT AS completion_date,
      sr.observation_id,
      sr.support_codes,
      CASE WHEN sr.routine_step_id IS NULL THEN 0 ELSE 1 END AS record_count

    FROM authorized_child ac

    LEFT JOIN child_routines cr
      ON cr.child_id = ac.child_id

    LEFT JOIN routine_completions rc
      ON rc.routine_id = cr.routine_id

    LEFT JOIN "FloFlo".routine_step rs
      ON rs.routine_id = cr.routine_id

    LEFT JOIN step_records sr
      ON sr.routine_id = cr.routine_id
      AND sr.routine_step_id = rs.id

    ORDER BY
      cr.routine_name,
      cr.routine_id,
      rs.position,
      rs.id,
      sr.completion_date,
      sr.observation_id
    `,
    [actorId, cleanChildId, DASHBOARD_ACCESS_PROFILES],
  );

  if (result.rows.length === 0) {
    throw createHttpError("No tienes permiso para consultar este perfil", 403);
  }

  const createMetrics = createSupportMetrics;
  const addPercentage = withSupportPercentage;

  const routinesMap = new Map();

  for (const row of result.rows) {
    if (row.routine_id === null) {
      continue;
    }

    const routineId = String(row.routine_id);

    if (!routinesMap.has(routineId)) {
      routinesMap.set(routineId, {
        routine_id: routineId,

        routine_name: row.routine_name,

        experience_template_id:
          row.experience_template_id === null
            ? null
            : String(row.experience_template_id),

        experience_group_key:
          row.experience_template_id === null
            ? `routine:${routineId}`
            : `template:${row.experience_template_id}`,

        start_time: row.start_time,

        end_time: row.end_time,

        days_of_week: row.days_of_week,

        created_at: row.routine_created_at,

        is_active: row.routine_is_active,

        completed_total: Number(row.completed_total),

        ...createMetrics(),

        stepsMap: new Map(),
      });
    }

    const routine = routinesMap.get(routineId);

    if (row.step_id === null) {
      continue;
    }

    const stepId = String(row.step_id);

    if (!routine.stepsMap.has(stepId)) {
      routine.stepsMap.set(stepId, {
        step_id: stepId,

        title: row.step_title,

        position: row.step_position,

        is_active: row.step_is_active,

        ...createMetrics(),

        datesMap: new Map(),
      });
    }

    const step = routine.stepsMap.get(stepId);

    const count = Number(row.record_count);

    /*
     * Una acción sin registros debe permanecer
     * visible, pero no genera evidencia ni apoyo.
     */

    if (count === 0) {
      continue;
    }

    accumulateSupportMetrics(routine, row.observation_id, row.support_codes);

    accumulateSupportMetrics(step, row.observation_id, row.support_codes);

    /*
     * Conservamos la distribución completa
     * por fecha, sin convertirla arbitrariamente
     * en un único nivel de apoyo diario.
     */

    if (row.completion_date) {
      const date = row.completion_date;

      if (!step.datesMap.has(date)) {
        step.datesMap.set(date, {
          date,
          ...createMetrics(),
        });
      }

      accumulateSupportMetrics(step.datesMap.get(date), row.observation_id, row.support_codes);
    }
  }

  const routines = Array.from(routinesMap.values()).map(
    ({ stepsMap, ...routine }) => ({
      ...addPercentage(routine),

      configured_steps: stepsMap.size,

      active_steps: Array.from(stepsMap.values()).filter(
        (step) => step.is_active,
      ).length,

      steps: Array.from(stepsMap.values()).map(({ datesMap, ...step }) => ({
        ...addPercentage(step),

        history: Array.from(datesMap.values())
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(addPercentage),
      })),
    }),
  );

  return {
    child_id: cleanChildId,

    generated_at: new Date().toISOString(),

    period: "all_time",

    timezone: APP_TIMEZONE,

    summary: {
      total_routines: routines.length,

      active_routines: routines.filter((routine) => routine.is_active).length,

      routines_with_records: routines.filter(
        (routine) =>
          routine.total_completed_steps > 0 || routine.completed_total > 0,
      ).length,

      total_completed_routines: routines.reduce(
        (total, routine) => total + routine.completed_total,
        0,
      ),

      total_completed_steps: routines.reduce(
        (total, routine) => total + routine.total_completed_steps,
        0,
      ),
    },

    routines,
  };
};

module.exports = {
  getDashboardOverview,
  getChildSupportOverview,
  getChildDashboardOverview,
  getChildRoutineAnalytics,
};
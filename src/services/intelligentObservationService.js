const OpenAI = require("openai");
const pool = require("../database/db");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

const normalizePeriodDays = (value) => {
  const days = Number(value);
  const allowedDays = [7, 30, 60, 90];

  if (!allowedDays.includes(days)) {
    return 30;
  }

  return days;
};

const assertParentCanAccessChild = async (parentId, childId, client = pool) => {
  const result = await client.query(
    `
    SELECT pc.child_id
    FROM "FloFlo".parent_child pc
    INNER JOIN "FloFlo"."user" u ON u.id = pc.child_id
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

const getChildBasicInfo = async (childId) => {
  const result = await pool.query(
    `
    SELECT 
      id,
      "firstName",
      "lastName",
      CONCAT_WS(' ', "firstName", "lastName") AS full_name,
      role,
      created_at
    FROM "FloFlo"."user"
    WHERE id = $1
      AND role = 'child'
    LIMIT 1
    `,
    [childId],
  );

  return result.rows[0] || null;
};

const getSensoryProfile = async (childId) => {
  const result = await pool.query(
    `
    SELECT *
    FROM "FloFlo".sensory_profile
    WHERE user_id = $1
    LIMIT 1
    `,
    [childId],
  );

  return result.rows[0] || null;
};

const getSensoryHistory = async (childId, periodDays) => {
  const result = await pool.query(
    `
    SELECT *
    FROM "FloFlo".sensory_profile_history
    WHERE user_id = $1
      AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
    ORDER BY created_at DESC
    LIMIT 20
    `,
    [childId, periodDays],
  );

  return result.rows;
};

const getMoods = async (childId, periodDays) => {
  const result = await pool.query(
    `
    SELECT
      m.id,
      m.user_id,
      m.created_by,
      m.source,
      m.comment,
      m.created_at,
      mt.mood_name,
      mt.icon
    FROM "FloFlo".mood m
    INNER JOIN "FloFlo".mood_type mt ON mt.id = m.mood_type_id
    WHERE m.user_id = $1
      AND m.created_at >= NOW() - ($2::int * INTERVAL '1 day')
    ORDER BY m.created_at DESC
    LIMIT 80
    `,
    [childId, periodDays],
  );

  return result.rows;
};

const getRoutines = async (childId, periodDays) => {
  const result = await pool.query(
    `
    SELECT
      r.id,
      r.name,
      r.description,
      r.start_time,
      r.end_time,
      r.days_of_week,
      r.is_active,
      r.created_at,
      r.updated_at,
      COUNT(rp.id)::int AS completions_in_period,
      MAX(rp.completed_at) AS last_completed_at
    FROM "FloFlo".routine r
    LEFT JOIN "FloFlo".routine_progress rp
      ON rp.routine_id = r.id
      AND rp.user_id = r.user_id
      AND rp.completed_at >= NOW() - ($2::int * INTERVAL '1 day')
    WHERE r.user_id = $1
      AND COALESCE(r.is_active, true) = true
    GROUP BY r.id
    ORDER BY r.start_time ASC, r.name ASC
    LIMIT 80
    `,
    [childId, periodDays],
  );

  return result.rows;
};

const getRoutineHistory = async (childId, periodDays) => {
  const result = await pool.query(
    `
    SELECT
      rp.id,
      rp.user_id,
      rp.routine_id,
      rp.completed,
      rp.points,
      rp.completed_at,
      rp.completion_date,
      r.name,
      r.description,
      r.start_time,
      r.end_time,
      r.days_of_week
    FROM "FloFlo".routine_progress rp
    INNER JOIN "FloFlo".routine r ON r.id = rp.routine_id
    WHERE rp.user_id = $1
      AND rp.completed_at >= NOW() - ($2::int * INTERVAL '1 day')
    ORDER BY rp.completed_at DESC
    LIMIT 80
    `,
    [childId, periodDays],
  );

  return result.rows;
};

const getPlaces = async (childId) => {
  const result = await pool.query(
    `
    SELECT
      id,
      name,
      address,
      description,
      activity,
      people_present,
      transport,
      estimated_duration,
      tips,
      created_at
    FROM "FloFlo".place
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 40
    `,
    [childId],
  );

  return result.rows;
};

const getContacts = async (childId) => {
  const result = await pool.query(
    `
    SELECT
      uc.id,
      uc.name,
      uc.where_met,
      uc.memory_note,
      uc.created_at,
      uc.updated_at,
      rt.relationship_name
    FROM "FloFlo".user_contact uc
    INNER JOIN "FloFlo".relationship_type rt ON rt.id = uc.relationship_type_id
    WHERE uc.user_id = $1
    ORDER BY uc.created_at DESC
    LIMIT 40
    `,
    [childId],
  );

  return result.rows;
};

const getContactConversations = async (childId, periodDays) => {
  const result = await pool.query(
    `
    SELECT
      ucc.id,
      ucc.title,
      ucc.situation,
      ucc.what_to_say,
      ucc.reminder,
      ucc.created_at,
      ucc.updated_at,
      uc.name AS contact_name,
      rt.relationship_name
    FROM "FloFlo".user_contact_conversation ucc
    LEFT JOIN "FloFlo".user_contact uc
      ON uc.id = ucc.user_contact_id
      AND uc.user_id = ucc.user_id
    LEFT JOIN "FloFlo".relationship_type rt ON rt.id = uc.relationship_type_id
    WHERE ucc.user_id = $1
      AND ucc.created_at >= NOW() - ($2::int * INTERVAL '1 day')
    ORDER BY ucc.created_at DESC
    LIMIT 50
    `,
    [childId, periodDays],
  );

  return result.rows;
};

const getUserProgress = async (childId) => {
  const result = await pool.query(
    `
    SELECT *
    FROM "FloFlo".user_progress
    WHERE user_id = $1
    LIMIT 1
    `,
    [childId],
  );

  return result.rows[0] || null;
};

const getAchievements = async (childId) => {
  const result = await pool.query(
    `
    SELECT
      ua.id,
      ua.user_id,
      ua.achievement_id,
      ua.unlocked_at,
      a.name,
      a.description,
      a.icon
    FROM "FloFlo".user_achievement ua
    INNER JOIN "FloFlo".achievement a ON a.id = ua.achievement_id
    WHERE ua.user_id = $1
    ORDER BY ua.unlocked_at DESC
    LIMIT 30
    `,
    [childId],
  );

  return result.rows;
};

const getWeeklySupportPlans = async (childId, periodDays) => {
  const result = await pool.query(
    `
    SELECT
      id,
      child_id,
      week_start,
      title,
      focus,
      plan,
      created_at,
      updated_at
    FROM "FloFlo".weekly_support_plan_history
    WHERE child_id = $1
      AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
    ORDER BY created_at DESC
    LIMIT 10
    `,
    [childId, periodDays],
  );

  return result.rows;
};

const buildDataSummary = (data) => {
  return {
    hasSensoryProfile: Boolean(data.sensoryProfile),
    sensoryHistoryCount: data.sensoryHistory.length,
    moodsCount: data.moods.length,
    routinesCount: data.routines.length,
    routineCompletionsCount: data.routineHistory.length,
    placesCount: data.places.length,
    contactsCount: data.contacts.length,
    contactConversationsCount: data.contactConversations.length,
    achievementsCount: data.achievements.length,
    weeklySupportPlansCount: data.weeklySupportPlans.length,
  };
};

const buildPrompt = (data) => {
  const context = JSON.stringify(data, null, 2).slice(0, 26000);

  return `
Analiza la siguiente información registrada en FloFlo y genera un Informe Inteligente de Observaciones.

IMPORTANTE:
- No diagnostiques.
- No reemplaces a profesionales de salud.
- No inventes información.
- No afirmes causalidades definitivas.
- No uses lenguaje alarmista.
- No etiquetes al niño.
- Si falta información, dilo explícitamente.
- Basa cada observación únicamente en los datos entregados.
- Usa tono cálido, respetuoso y profesional.
- El informe va dirigido a padres, cuidadores y profesionales.
- No uses términos clínicos como "trastorno", "enfermedad" o "riesgo clínico".
- No uses la palabra "diagnóstico" salvo en el mensaje final obligatorio.

Periodo analizado:
Últimos ${data.periodDays} días, considerando también datos generales registrados en la plataforma.

Información disponible:
${context}

La respuesta debe contener exactamente estas secciones:

# Resumen general

Explica en pocas palabras cómo parece haber sido el período analizado.

---

# Patrones observados

Describe únicamente patrones que puedan inferirse de la información disponible.

Si no existe suficiente información para identificar un patrón, indícalo claramente.

---

# Perfil sensorial

Analiza explícitamente el perfil sensorial registrado.

Debes revisar, si existen datos disponibles, los siguientes aspectos:

* Sensibilidad al ruido: noise_sensitivity.
* Sensibilidad a la luz: light_sensitivity.
* Sensibilidad a texturas: texture_sensitivity.
* Sensibilidad a multitudes o espacios concurridos: crowd_sensitivity.
* Sensibilidad al contacto físico: touch_sensitivity.
* Sensibilidad a olores: smell_sensitivity.
* Alimentación y texturas de comida: food_sensitivity.
* Cambios inesperados: unexpected_changes.
* Esperas prolongadas: waiting_sensitivity.
* Objetos que ayudan a calmar: calming_items.
* Actividades que ayudan a calmar: calming_activities.
* Señales de sobrecarga o estrés: stress_signals.
* Estrategias de apoyo: support_strategies.
* Notas generales: notes.

Si alguno de estos aspectos tiene información registrada, debe ser considerado explícitamente en esta sección.

Relaciona estas sensibilidades con las emociones, rutinas, lugares, personas, conversaciones o eventos registrados.

Si algún aspecto no tiene información registrada, indícalo de forma breve, por ejemplo:
"No hay información suficiente sobre alimentación" o "No hay registros específicos sobre olores".

No inventes sensibilidades que no estén registradas.

Usa expresiones cuidadosas como:
- "Podría influir en..."
- "Se observa una posible relación con..."
- "Sería útil seguir observando..."

---

# Fortalezas

Destaca aspectos positivos observados en los registros disponibles.

---

# Situaciones que podrían requerir atención

Menciona únicamente observaciones respaldadas por los datos.

Usa expresiones como:
- "Sería útil observar..."
- "Podría ser beneficioso revisar..."
- "Se aprecia un posible patrón..."
- "Conviene acompañar con mayor anticipación..."

---

# Recomendaciones prácticas

Entrega recomendaciones simples, concretas y aplicables para padres y cuidadores.

Las recomendaciones deben basarse únicamente en la información disponible.

Si existen datos sensoriales registrados, considera recomendaciones relacionadas con:

* Ruido.
* Luz.
* Texturas.
* Multitudes.
* Contacto físico.
* Olores.
* Alimentación.
* Cambios inesperados.
* Esperas prolongadas.
* Objetos calmantes.
* Actividades calmantes.
* Estrategias de apoyo.

No entregues recomendaciones sobre aspectos que no tienen datos registrados.

---

# Evolución

Si existen registros históricos, compara el período actual con períodos anteriores.

Si no hay suficientes datos históricos, indícalo claramente.

---

# Conclusión

Resume en un párrafo los principales hallazgos.

Finaliza siempre con este mensaje exacto:

"Este informe corresponde a observaciones generadas automáticamente a partir de la información registrada en FloFlo. No constituye un diagnóstico clínico ni reemplaza la evaluación realizada por profesionales de la salud."
`;
};

const collectObservationData = async (childId, periodDays) => {
  const [
    child,
    sensoryProfile,
    sensoryHistory,
    moods,
    routines,
    routineHistory,
    places,
    contacts,
    contactConversations,
    userProgress,
    achievements,
    weeklySupportPlans,
  ] = await Promise.all([
    getChildBasicInfo(childId),
    getSensoryProfile(childId),
    getSensoryHistory(childId, periodDays),
    getMoods(childId, periodDays),
    getRoutines(childId, periodDays),
    getRoutineHistory(childId, periodDays),
    getPlaces(childId),
    getContacts(childId),
    getContactConversations(childId, periodDays),
    getUserProgress(childId),
    getAchievements(childId),
    getWeeklySupportPlans(childId, periodDays),
  ]);

  if (!child) {
    throw createHttpError("Niño/a no encontrado", 404);
  }

  const data = {
    child: {
      id: child.id,
      firstName: child.firstName,
      lastName: child.lastName,
      fullName: child.full_name,
      created_at: child.created_at,
    },
    periodDays,
    generatedAt: new Date().toISOString(),
    sensoryProfile,
    sensoryHistory,
    moods,
    routines,
    routineHistory,
    places,
    contacts,
    contactConversations,
    userProgress,
    achievements,
    weeklySupportPlans,
  };

  return {
    ...data,
    dataSummary: buildDataSummary(data),
  };
};

const generateIntelligentObservation = async (childId, periodDays = 30) => {
  const cleanChildId = validatePositiveInteger(childId, "Niño/a");
  const cleanPeriodDays = normalizePeriodDays(periodDays);

  const data = await collectObservationData(cleanChildId, cleanPeriodDays);
  const prompt = buildPrompt(data);

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "Eres un asistente de observaciones de FloFlo especializado en apoyo infantil, autismo, integración sensorial y acompañamiento familiar. No diagnosticas ni reemplazas a profesionales de salud.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.25,
  });

  const report = response.choices[0]?.message?.content;

  if (!report) {
    throw createHttpError("La IA no generó un informe válido", 502);
  }

  return {
    childId: cleanChildId,
    periodDays: cleanPeriodDays,
    generatedAt: data.generatedAt,
    dataSummary: data.dataSummary,
    report,
  };
};

const saveIntelligentObservationReport = async ({
  childId,
  generatedBy,
  periodDays,
  dataSummary,
  report,
}) => {
  const result = await pool.query(
    `
    INSERT INTO "FloFlo".intelligent_observation_report (
      child_id,
      generated_by,
      period_days,
      data_summary,
      report,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING
      id,
      child_id AS "childId",
      generated_by AS "generatedBy",
      period_days AS "periodDays",
      data_summary AS "dataSummary",
      report,
      created_at AS "createdAt"
    `,
    [childId, generatedBy, periodDays, JSON.stringify(dataSummary), report],
  );

  return result.rows[0];
};

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const getRecentIntelligentObservationWithin24Hours = async (childId) => {
  const cleanChildId = validatePositiveInteger(childId, "Niño/a");

  const result = await pool.query(
    `
    SELECT
      id,
      child_id AS "childId",
      period_days AS "periodDays",
      created_at AS "createdAt"
    FROM "FloFlo".intelligent_observation_report
    WHERE child_id = $1
      AND created_at >= NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [cleanChildId],
  );

  if (!result.rows[0]) return null;

  const latestReport = result.rows[0];
  const nextAvailableAt = new Date(
    new Date(latestReport.createdAt).getTime() + TWENTY_FOUR_HOURS_MS,
  );

  return {
    ...latestReport,
    nextAvailableAt,
  };
};

const generateAndSaveIntelligentObservation = async ({
  childId,
  periodDays = 30,
  generatedBy,
}) => {
  const cleanChildId = validatePositiveInteger(childId, "Niño/a");
  const cleanGeneratedBy = validatePositiveInteger(
    generatedBy,
    "Padre/cuidador",
  );

  const recentReport =
    await getRecentIntelligentObservationWithin24Hours(cleanChildId);

  if (recentReport) {
    const error = new Error(
      "Ya existe un informe inteligente generado durante las últimas 24 horas para este niño/a. Podrás generar uno nuevo cuando se cumpla el plazo.",
    );

    error.statusCode = 429;
    error.latestReportId = recentReport.id;
    error.latestCreatedAt = recentReport.createdAt;
    error.nextAvailableAt = recentReport.nextAvailableAt;

    throw error;
  }

  const generated = await generateIntelligentObservation(
    cleanChildId,
    periodDays,
  );

  const saved = await saveIntelligentObservationReport({
    childId: generated.childId,
    generatedBy: cleanGeneratedBy,
    periodDays: generated.periodDays,
    dataSummary: generated.dataSummary,
    report: generated.report,
  });

  return {
    ...generated,
    id: saved.id,
    createdAt: saved.createdAt,
    saved: true,
  };
};

const getLatestIntelligentObservation = async (childId) => {
  const cleanChildId = validatePositiveInteger(childId, "Niño/a");

  const result = await pool.query(
    `
    SELECT
      r.id,
      r.child_id AS "childId",
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', child."firstName", child."lastName")), ''),
        child.email,
        'Niño/a sin nombre'
      ) AS "childName",
      r.generated_by AS "generatedBy",
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', creator."firstName", creator."lastName")), ''),
        creator.email,
        'Usuario no registrado'
      ) AS "generatedByName",
      r.period_days AS "periodDays",
      r.data_summary AS "dataSummary",
      r.report,
      r.created_at AS "createdAt"
    FROM "FloFlo".intelligent_observation_report r
    INNER JOIN "FloFlo"."user" child ON child.id = r.child_id
    LEFT JOIN "FloFlo"."user" creator ON creator.id = r.generated_by
    WHERE r.child_id = $1
    ORDER BY r.created_at DESC
    LIMIT 1
    `,
    [cleanChildId],
  );

  return result.rows[0] || null;
};

const getIntelligentObservationHistory = async (childId) => {
  const cleanChildId = validatePositiveInteger(childId, "Niño/a");

  const result = await pool.query(
    `
    SELECT
      r.id,
      r.child_id AS "childId",
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', child."firstName", child."lastName")), ''),
        child.email,
        'Niño/a sin nombre'
      ) AS "childName",
      r.generated_by AS "generatedBy",
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', creator."firstName", creator."lastName")), ''),
        creator.email,
        'Usuario no registrado'
      ) AS "generatedByName",
      r.period_days AS "periodDays",
      r.data_summary AS "dataSummary",
      r.report,
      r.created_at AS "createdAt"
    FROM "FloFlo".intelligent_observation_report r
    INNER JOIN "FloFlo"."user" child ON child.id = r.child_id
    LEFT JOIN "FloFlo"."user" creator ON creator.id = r.generated_by
    WHERE r.child_id = $1
    ORDER BY r.created_at DESC
    LIMIT 20
    `,
    [cleanChildId],
  );

  return result.rows;
};

const getIntelligentObservationById = async ({ childId, reportId }) => {
  const cleanChildId = validatePositiveInteger(childId, "Niño/a");
  const cleanReportId = validatePositiveInteger(reportId, "Informe");

  const result = await pool.query(
    `
    SELECT
      r.id,
      r.child_id AS "childId",
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', child."firstName", child."lastName")), ''),
        child.email,
        'Niño/a sin nombre'
      ) AS "childName",
      r.generated_by AS "generatedBy",
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', creator."firstName", creator."lastName")), ''),
        creator.email,
        'Usuario no registrado'
      ) AS "generatedByName",
      r.period_days AS "periodDays",
      r.data_summary AS "dataSummary",
      r.report,
      r.created_at AS "createdAt"
    FROM "FloFlo".intelligent_observation_report r
    INNER JOIN "FloFlo"."user" child ON child.id = r.child_id
    LEFT JOIN "FloFlo"."user" creator ON creator.id = r.generated_by
    WHERE r.child_id = $1
      AND r.id = $2
    LIMIT 1
    `,
    [cleanChildId, cleanReportId],
  );

  return result.rows[0] || null;
};

module.exports = {
  validatePositiveInteger,
  assertParentCanAccessChild,
  generateIntelligentObservation,
  generateAndSaveIntelligentObservation,
  getLatestIntelligentObservation,
  getIntelligentObservationHistory,
  getIntelligentObservationById,
};

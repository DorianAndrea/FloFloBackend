const pool = require("../database/db");
const {
  generateParentRecommendations,
} = require("./parentRecommendationService");

const validateUserId = (userId) => {
  const userIdNumber = Number(userId);

  if (!Number.isInteger(userIdNumber) || userIdNumber <= 0) {
    const error = new Error("ID de usuario inválido");
    error.statusCode = 400;
    throw error;
  }

  return userIdNumber;
};

const getCount = (result) => {
  return Number(result?.rows?.[0]?.count || 0);
};

const getFirstRow = (result) => {
  return result?.rows?.[0] || null;
};

const hasText = (value) => {
  return typeof value === "string" && value.trim().length > 0;
};

const cleanText = (value) => {
  return typeof value === "string" ? value.trim() : "";
};

const buildSensoryRecommendations = (sensoryProfile, dashboardData) => {
  if (!sensoryProfile) return [];

  const recommendations = [];
  const sensitivities = [];

  if (hasText(sensoryProfile.noise_sensitivity)) {
    sensitivities.push(`ruido: ${cleanText(sensoryProfile.noise_sensitivity)}`);
  }

  if (hasText(sensoryProfile.light_sensitivity)) {
    sensitivities.push(`luz: ${cleanText(sensoryProfile.light_sensitivity)}`);
  }

  if (hasText(sensoryProfile.texture_sensitivity)) {
    sensitivities.push(
      `texturas: ${cleanText(sensoryProfile.texture_sensitivity)}`,
    );
  }

  if (hasText(sensoryProfile.crowd_sensitivity)) {
    sensitivities.push(
      `multitudes: ${cleanText(sensoryProfile.crowd_sensitivity)}`,
    );
  }

  if (sensitivities.length > 0) {
    recommendations.push({
      title: "Considerar su perfil sensorial",
      message: `Antes de planificar rutinas, salidas o conversaciones, recuerda sus sensibilidades principales: ${sensitivities.join(
        "; ",
      )}. Esto puede ayudar a prevenir sobrecargas.`,
      icon: "🧩",
    });
  }

  const calmingSupports = [];

  if (hasText(sensoryProfile.calming_items)) {
    calmingSupports.push(
      `objetos que ayudan: ${cleanText(sensoryProfile.calming_items)}`,
    );
  }

  if (hasText(sensoryProfile.calming_activities)) {
    calmingSupports.push(
      `actividades que ayudan: ${cleanText(sensoryProfile.calming_activities)}`,
    );
  }

  if (calmingSupports.length > 0) {
    recommendations.push({
      title: "Preparar apoyos calmantes",
      message: `Cuando notes cansancio, ansiedad o incomodidad, puedes apoyarte en ${calmingSupports.join(
        "; ",
      )}. Tenerlos disponibles antes de una situación difícil puede facilitar la regulación.`,
      icon: "🧸",
    });
  }

  if (
    hasText(sensoryProfile.stress_signals) ||
    hasText(sensoryProfile.support_strategies)
  ) {
    recommendations.push({
      title: "Observar señales de sobrecarga",
      message: `Señales a observar: ${
        cleanText(sensoryProfile.stress_signals) ||
        "cambios en conducta, cansancio o evitación"
      }. Estrategias sugeridas: ${
        cleanText(sensoryProfile.support_strategies) ||
        "hablar con calma, anticipar cambios y ofrecer pausas"
      }.`,
      icon: "🚦",
    });
  }

  const latestMoodName = dashboardData.latestMood?.mood_name;

  if (
    ["Ansioso", "Asustado", "Triste", "Enojado"].includes(latestMoodName) &&
    hasText(sensoryProfile.support_strategies)
  ) {
    recommendations.push({
      title: `Apoyo ante emoción reciente: ${latestMoodName}`,
      message: `Como la última emoción registrada fue "${latestMoodName}", puede ser útil aplicar una estrategia conocida para este niño: ${cleanText(
        sensoryProfile.support_strategies,
      )}.`,
      icon: "💜",
    });
  }

  return recommendations;
};
const buildSensoryAlerts = (sensoryProfile, dashboardData) => {
  if (!sensoryProfile) return [];

  const alerts = [];

  const latestMoodName = dashboardData.latestMood?.mood_name;

  const difficultMoods = ["Ansioso", "Asustado", "Enojado", "Triste"];

  const hasSensorySensitivity =
    hasText(sensoryProfile.noise_sensitivity) ||
    hasText(sensoryProfile.light_sensitivity) ||
    hasText(sensoryProfile.texture_sensitivity) ||
    hasText(sensoryProfile.crowd_sensitivity);

  const hasStressInfo =
    hasText(sensoryProfile.stress_signals) ||
    hasText(sensoryProfile.support_strategies);

  if (difficultMoods.includes(latestMoodName) && hasSensorySensitivity) {
    alerts.push({
      type: "warning",
      title: "Posible sobrecarga sensorial",
      message: `La última emoción registrada fue "${latestMoodName}". Como existe información de sensibilidad sensorial, conviene observar si hay estímulos como ruido, luz, texturas o multitudes que puedan estar influyendo.`,
      icon: "🚦",
    });
  }

  if (difficultMoods.includes(latestMoodName) && hasStressInfo) {
    alerts.push({
      type: "warning",
      title: "Observar señales de estrés",
      message: `Hay señales o estrategias registradas en el perfil sensorial. Señales a observar: ${
        cleanText(sensoryProfile.stress_signals) ||
        "cambios de conducta, evitación, llanto o cansancio"
      }. Estrategias sugeridas: ${
        cleanText(sensoryProfile.support_strategies) ||
        "hablar con calma, anticipar cambios y ofrecer una pausa"
      }.`,
      icon: "💜",
    });
  }

  if (hasText(sensoryProfile.crowd_sensitivity) && dashboardData.latestPlace) {
    alerts.push({
      type: "info",
      title: "Considerar ambiente del lugar",
      message: `El último lugar registrado fue "${dashboardData.latestPlace.name}". Como existe sensibilidad a multitudes, puede ser útil anticipar la visita, elegir horarios tranquilos o preparar una pausa.`,
      icon: "📍",
    });
  }

  return alerts;
};
const buildWellnessStatus = ({
  dashboardData,
  sensoryProfile,
  sensoryAlerts = [],
  emotionalTrendRows = [],
}) => {
  const difficultMoods = ["Ansioso", "Asustado", "Enojado", "Triste"];

  const latestMoodName = dashboardData.latestMood?.mood_name;
  const reasons = [];
  let score = 0;

  const hasSensoryProfile =
    sensoryProfile &&
    [
      sensoryProfile.noise_sensitivity,
      sensoryProfile.light_sensitivity,
      sensoryProfile.texture_sensitivity,
      sensoryProfile.crowd_sensitivity,
      sensoryProfile.calming_items,
      sensoryProfile.calming_activities,
      sensoryProfile.stress_signals,
      sensoryProfile.support_strategies,
      sensoryProfile.notes,
    ].some(hasText);

  if (difficultMoods.includes(latestMoodName)) {
    score += 2;
    reasons.push(`La última emoción registrada fue "${latestMoodName}".`);
  }

  const warningSensoryAlerts = sensoryAlerts.filter(
    (alert) => alert.type === "warning",
  );

  if (warningSensoryAlerts.length > 0) {
    score += warningSensoryAlerts.length * 2;
    reasons.push(
      "Existen alertas sensoriales o señales que conviene observar.",
    );
  }

  const increasedDifficultMoods = emotionalTrendRows.filter((item) => {
    const currentWeek = Number(item.current_week || 0);
    const previousWeek = Number(item.previous_week || 0);

    return (
      difficultMoods.includes(item.mood_name) && currentWeek > previousWeek
    );
  });

  if (increasedDifficultMoods.length > 0) {
    score += increasedDifficultMoods.length * 2;

    const moodNames = increasedDifficultMoods
      .map((item) => item.mood_name)
      .join(", ");

    reasons.push(
      `Aumentaron emociones que requieren observación: ${moodNames}.`,
    );
  }

  if (dashboardData.emotions === 0) {
    score += 1;
    reasons.push("Todavía no hay emociones registradas esta semana.");
  }

  if (dashboardData.routines === 0) {
    score += 1;
    reasons.push("No hay rutinas registradas para apoyar anticipación.");
  }

  if (!hasSensoryProfile) {
    score += 1;
    reasons.push(
      "No hay perfil sensorial completo para orientar mejor los apoyos.",
    );
  }

  let level = "green";
  let title = "Bienestar estable";
  let message =
    "Los registros actuales no muestran señales importantes de alerta.";
  let icon = "🟢";
  let suggestedAction =
    "Mantener rutinas simples, reforzar avances y seguir registrando emociones.";

  if (score >= 5) {
    level = "red";
    title = "Necesita apoyo cercano";
    message =
      "Hay varias señales que conviene acompañar con más atención durante estos días.";
    icon = "🔴";
    suggestedAction =
      "Acompañar con calma, reducir exigencias, ofrecer pausas y observar señales de sobrecarga.";
  } else if (score >= 2) {
    level = "yellow";
    title = "Requiere observación";
    message =
      "Hay algunos indicadores que sugieren observar cómo evoluciona durante la semana.";
    icon = "🟡";
    suggestedAction =
      "Usar frases cortas, anticipar cambios y tener disponibles apoyos calmantes.";
  }

  return {
    level,
    title,
    message,
    icon,
    score,
    reasons: reasons.slice(0, 4),
    suggestedAction,
  };
};

const buildWeeklySupportPlan = (dashboardData, sensoryProfile) => {
  const childName = dashboardData.childName || "el niño/la niña";

  const latestMoodName = dashboardData.latestMood?.mood_name;
  const difficultMoods = ["Ansioso", "Asustado", "Enojado", "Triste"];

  const hasSensoryData =
    sensoryProfile &&
    [
      sensoryProfile.noise_sensitivity,
      sensoryProfile.light_sensitivity,
      sensoryProfile.texture_sensitivity,
      sensoryProfile.crowd_sensitivity,
      sensoryProfile.calming_items,
      sensoryProfile.calming_activities,
      sensoryProfile.stress_signals,
      sensoryProfile.support_strategies,
      sensoryProfile.notes,
    ].some(hasText);

  const calmingSupport =
    cleanText(sensoryProfile?.calming_items) ||
    cleanText(sensoryProfile?.calming_activities) ||
    "un objeto o actividad que le ayude a calmarse";

  const supportStrategy =
    cleanText(sensoryProfile?.support_strategies) ||
    "hablar con calma, anticipar cambios y ofrecer una pausa";

  let focus =
    "Reforzar la comunicación, las rutinas y los avances pequeños durante la semana.";

  if (difficultMoods.includes(latestMoodName) && hasSensoryData) {
    focus = `Acompañar la emoción reciente "${latestMoodName}" y observar posibles señales de sobrecarga sensorial.`;
  } else if (difficultMoods.includes(latestMoodName)) {
    focus = `Acompañar la emoción reciente "${latestMoodName}" con calma y sin presión.`;
  } else if (dashboardData.routines === 0) {
    focus =
      "Crear o reforzar una rutina simple para dar más anticipación y seguridad.";
  } else if (dashboardData.conversations === 0) {
    focus =
      "Comenzar con conversaciones simples para practicar habilidades sociales.";
  } else if (hasSensoryData) {
    focus =
      "Usar el perfil sensorial para anticipar apoyos durante rutinas, lugares y conversaciones.";
  }

  return {
    title: `Plan de apoyo semanal para ${childName}`,
    focus,
    days: [
      {
        day: "Lunes",
        icon: "😊",
        title: "Revisar cómo se sintió",
        action: latestMoodName
          ? `Conversar brevemente sobre la emoción "${latestMoodName}" y preguntar qué pudo haberla provocado.`
          : "Preguntar con calma qué emoción apareció más durante el día.",
        reason: "Ayuda a reconocer patrones emocionales sin presionar.",
      },
      {
        day: "Martes",
        icon: "💬",
        title: "Practicar una conversación",
        action: dashboardData.latestContactConversation?.title
          ? `Practicar la conversación "${dashboardData.latestContactConversation.title}" con una respuesta breve y clara.`
          : "Elegir una conversación simple y practicar una respuesta corta.",
        reason: "Refuerza habilidades sociales en un contexto seguro.",
      },
      {
        day: "Miércoles",
        icon: "🧩",
        title: "Preparar apoyos sensoriales",
        action: hasSensoryData
          ? `Tener disponible ${calmingSupport} antes de una actividad que pueda ser exigente.`
          : "Observar si hay estímulos como ruido, luz o multitudes que puedan incomodar.",
        reason: "Anticipar apoyos puede facilitar la regulación.",
      },
      {
        day: "Jueves",
        icon: "🕒",
        title: "Reforzar una rutina",
        action: dashboardData.latestRoutine?.name
          ? `Repasar la rutina "${dashboardData.latestRoutine.name}" paso a paso.`
          : "Crear o repasar una rutina pequeña, con pocos pasos y lenguaje claro.",
        reason: "Las rutinas ayudan a anticipar lo que viene.",
      },
      {
        day: "Viernes",
        icon: "⭐",
        title: "Cerrar la semana con un logro",
        action:
          dashboardData.achievements > 0
            ? "Elegir un logro desbloqueado y felicitar el esfuerzo realizado."
            : "Reconocer un avance pequeño de la semana, aunque no haya logro desbloqueado.",
        reason: "Celebrar avances pequeños fortalece la motivación.",
      },
    ],
    tips: [
      "Usar frases cortas y claras.",
      "Anticipar cambios importantes antes de que ocurran.",
      `Estrategia sugerida: ${supportStrategy}.`,
    ],
  };
};

const saveWeeklySupportPlanHistory = async (childId, weeklySupportPlan) => {
  if (!weeklySupportPlan) return null;

  const result = await pool.query(
    `
    INSERT INTO "FloFlo".weekly_support_plan_history (
      child_id,
      week_start,
      title,
      focus,
      plan,
      created_at,
      updated_at
    )
    VALUES (
      $1,
      DATE_TRUNC('week', NOW())::date,
      $2,
      $3,
      $4::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (child_id, week_start)
    DO UPDATE SET
      title = EXCLUDED.title,
      focus = EXCLUDED.focus,
      plan = EXCLUDED.plan,
      updated_at = NOW()
    RETURNING *
    `,
    [
      childId,
      weeklySupportPlan.title || null,
      weeklySupportPlan.focus || null,
      JSON.stringify(weeklySupportPlan),
    ],
  );

  return result.rows[0] || null;
};

const getWeeklySupportPlanHistory = async (userId) => {
  const userIdNumber = validateUserId(userId);

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
    ORDER BY week_start DESC
    LIMIT 12
    `,
    [userIdNumber],
  );

  return result.rows;
};

const getParentDashboard = async (userId) => {
  const userIdNumber = validateUserId(userId);

  const [
    emotions,
    routines,
    places,
    contacts,
    conversations,
    achievements,
    latestMood,
    latestRoutine,
    latestPlace,
    latestContactConversation,
    moodSummary,
    recentActivity,
    favoriteConversations,
    nextAchievement,
    emotionalTrend,
    activityCalendar,
    sensoryProfile,
  ] = await Promise.all([
    pool.query(
      `
      SELECT COUNT(*) 
      FROM "FloFlo".mood 
      WHERE user_id = $1
      `,
      [userIdNumber],
    ),

    pool.query(
      `
      SELECT COUNT(*) 
      FROM "FloFlo".routine 
      WHERE user_id = $1
      `,
      [userIdNumber],
    ),

    pool.query(
      `
      SELECT COUNT(*) 
      FROM "FloFlo".place 
      WHERE user_id = $1
      `,
      [userIdNumber],
    ),

    pool.query(
      `
      SELECT COUNT(*) 
      FROM "FloFlo".user_contact 
      WHERE user_id = $1
      `,
      [userIdNumber],
    ),

    pool.query(
      `
      SELECT
        (
          SELECT COUNT(*)
          FROM "FloFlo".conversation
        )
        +
        (
          SELECT COUNT(*)
          FROM "FloFlo".user_contact_conversation
          WHERE user_id = $1
        ) AS count
      `,
      [userIdNumber],
    ),

    pool.query(
      `
      SELECT COUNT(*)
      FROM "FloFlo".user_achievement
      WHERE user_id = $1
      `,
      [userIdNumber],
    ),

    pool.query(
      `
      SELECT 
        m.id,
        mt.mood_name,
        mt.icon,
        m.comment,
        m.created_at
      FROM "FloFlo".mood m
      JOIN "FloFlo".mood_type mt
        ON mt.id = m.mood_type_id
      WHERE m.user_id = $1
      ORDER BY m.created_at DESC
      LIMIT 1
      `,
      [userIdNumber],
    ),

    pool.query(
      `
      SELECT 
        id,
        name,
        description,
        start_time,
        end_time,
        created_at
      FROM "FloFlo".routine
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [userIdNumber],
    ),

    pool.query(
      `
      SELECT 
        id,
        name,
        description,
        created_at
      FROM "FloFlo".place
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [userIdNumber],
    ),

    pool.query(
      `
      SELECT
        id,
        title,
        situation,
        what_to_say,
        created_at
      FROM "FloFlo".user_contact_conversation
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [userIdNumber],
    ),

    pool.query(
      `
      SELECT 
        mt.mood_name,
        mt.icon,
        COUNT(*) AS count
      FROM "FloFlo".mood m
      JOIN "FloFlo".mood_type mt
        ON mt.id = m.mood_type_id
      WHERE m.user_id = $1
      GROUP BY mt.mood_name, mt.icon
      ORDER BY count DESC
      `,
      [userIdNumber],
    ),

    pool.query(
      `
      SELECT *
      FROM (
        SELECT 
          'emotion' AS type,
          m.id::text AS id,
          mt.mood_name AS title,
          m.comment AS description,
          m.created_at
        FROM "FloFlo".mood m
        JOIN "FloFlo".mood_type mt
          ON mt.id = m.mood_type_id
        WHERE m.user_id = $1

        UNION ALL

        SELECT
          'routine' AS type,
          r.id::text AS id,
          r.name AS title,
          r.description AS description,
          r.created_at
        FROM "FloFlo".routine r
        WHERE r.user_id = $1

        UNION ALL

        SELECT
          'place' AS type,
          p.id::text AS id,
          p.name AS title,
          p.description AS description,
          p.created_at
        FROM "FloFlo".place p
        WHERE p.user_id = $1

        UNION ALL

        SELECT
          'conversation' AS type,
          c.id::text AS id,
          c.title AS title,
          c.situation AS description,
          c.created_at
        FROM "FloFlo".user_contact_conversation c
        WHERE c.user_id = $1
      ) activity
      ORDER BY created_at DESC
      LIMIT 6
      `,
      [userIdNumber],
    ),

    pool.query(
      `
      SELECT
        id,
        title,
        situation,
        what_to_say,
        is_favorite,
        created_at
      FROM "FloFlo".user_contact_conversation
      WHERE user_id = $1
      AND is_favorite = true
      ORDER BY updated_at DESC
      LIMIT 5
      `,
      [userIdNumber],
    ),

    pool.query(
      `
      SELECT
        a.id,
        a.name,
        a.description,
        a.icon,
        a.required_type,
        a.required_value,
        COALESCE(
          CASE
            WHEN a.required_type = 'points' THEN up.points
            WHEN a.required_type = 'completed_conversations' THEN up.completed_conversations
            WHEN a.required_type = 'completed_places' THEN up.completed_places
            WHEN a.required_type = 'completed_routines' THEN up.completed_routines
            WHEN a.required_type = 'completed_moods' THEN up.completed_moods
            WHEN a.required_type = 'level' THEN up.level
            ELSE 0
          END,
          0
        ) AS current_value
      FROM "FloFlo".achievement a
      LEFT JOIN "FloFlo".user_progress up
        ON up.user_id = $1
      LEFT JOIN "FloFlo".user_achievement ua
        ON ua.achievement_id = a.id
        AND ua.user_id = $1
      WHERE ua.id IS NULL
      ORDER BY a.required_value ASC
      LIMIT 1
      `,
      [userIdNumber],
    ),

    pool.query(
      `
      SELECT
        mt.mood_name,
        mt.icon,

        COUNT(*) FILTER (
          WHERE m.created_at >= NOW() - INTERVAL '7 days'
        ) AS current_week,

        COUNT(*) FILTER (
          WHERE m.created_at < NOW() - INTERVAL '7 days'
          AND m.created_at >= NOW() - INTERVAL '14 days'
        ) AS previous_week

      FROM "FloFlo".mood m
      JOIN "FloFlo".mood_type mt
        ON mt.id = m.mood_type_id
      WHERE m.user_id = $1
      AND m.created_at >= NOW() - INTERVAL '14 days'
      GROUP BY mt.mood_name, mt.icon
      ORDER BY current_week DESC
      `,
      [userIdNumber],
    ),

    pool.query(
      `
      SELECT 
        DATE(created_at) AS activity_date,
        COUNT(*) AS total
      FROM (
        SELECT created_at
        FROM "FloFlo".mood
        WHERE user_id = $1

        UNION ALL

        SELECT created_at
        FROM "FloFlo".routine
        WHERE user_id = $1

        UNION ALL

        SELECT created_at
        FROM "FloFlo".place
        WHERE user_id = $1

        UNION ALL

        SELECT created_at
        FROM "FloFlo".user_contact_conversation
        WHERE user_id = $1
      ) activity
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY activity_date ASC
      `,
      [userIdNumber],
    ),

    pool.query(
      `
      SELECT
        noise_sensitivity,
        light_sensitivity,
        texture_sensitivity,
        crowd_sensitivity,
        calming_items,
        calming_activities,
        stress_signals,
        support_strategies,
        notes
      FROM "FloFlo".sensory_profile
      WHERE user_id = $1
      LIMIT 1
      `,
      [userIdNumber],
    ),
  ]);
  const userInfo = await pool.query(
    `
    SELECT "firstName", "lastName", email
    FROM "FloFlo".user
    WHERE id = $1
    LIMIT 1
    `,
    [userIdNumber],
  );

  const userInfoData = getFirstRow(userInfo);

  const childName = `${userInfoData?.firstName || ""} ${
    userInfoData?.lastName || ""
  }`.trim();

  const dashboardData = {
    childName: childName || "el niño/la niña",
    emotions: getCount(emotions),
    routines: getCount(routines),
    places: getCount(places),
    contacts: getCount(contacts),
    conversations: getCount(conversations),
    achievements: getCount(achievements),
    latestMood: getFirstRow(latestMood),
    latestRoutine: getFirstRow(latestRoutine),
    latestPlace: getFirstRow(latestPlace),
    latestContactConversation: getFirstRow(latestContactConversation),
  };

  const sensoryProfileData = getFirstRow(sensoryProfile);

  const sensoryRecommendations = buildSensoryRecommendations(
    sensoryProfileData,
    dashboardData,
  );

  const sensoryAlerts = buildSensoryAlerts(sensoryProfileData, dashboardData);

  const wellnessStatus = buildWellnessStatus({
    dashboardData,
    sensoryProfile: sensoryProfileData,
    sensoryAlerts,
    emotionalTrendRows: emotionalTrend.rows,
  });

  const weeklySupportPlan = buildWeeklySupportPlan(
    dashboardData,
    sensoryProfileData,
  );

  let weeklySupportPlanRecord = null;

  try {
    weeklySupportPlanRecord = await saveWeeklySupportPlanHistory(
      userIdNumber,
      weeklySupportPlan,
    );
  } catch (error) {
    console.error("Error guardando historial del plan semanal:", error.message);
  }
  const alerts = [];
  alerts.push(...sensoryAlerts);

  if (dashboardData.emotions === 0) {
    alerts.push({
      type: "warning",
      title: "Sin emociones registradas",
      message: "Todavía no hay emociones registradas para este usuario.",
      icon: "😊",
    });
  }

  if (dashboardData.routines === 0) {
    alerts.push({
      type: "warning",
      title: "Sin rutinas creadas",
      message: "Aún no hay rutinas registradas.",
      icon: "🕒",
    });
  }

  if (dashboardData.conversations === 0) {
    alerts.push({
      type: "warning",
      title: "Sin conversaciones",
      message: "Todavía no hay conversaciones disponibles para practicar.",
      icon: "💬",
    });
  }

  if (dashboardData.achievements > 0) {
    alerts.push({
      type: "success",
      title: "Logros desbloqueados",
      message: `Ya tiene ${dashboardData.achievements} logro(s) desbloqueado(s).`,
      icon: "⭐",
    });
  }

  if (favoriteConversations.rows.length > 0) {
    alerts.push({
      type: "info",
      title: "Conversaciones favoritas",
      message: `Tiene ${favoriteConversations.rows.length} conversación(es) favorita(s) guardada(s).`,
      icon: "⭐",
    });
  }

  let aiRecommendations = [];

  try {
    const generatedRecommendations = await generateParentRecommendations(
      dashboardData,
      {
        sensoryProfile: sensoryProfileData,
        alerts: sensoryAlerts,
      },
    );

    aiRecommendations = Array.isArray(generatedRecommendations)
      ? generatedRecommendations
      : [];
  } catch (error) {
    console.error("Error generando recomendaciones IA:", error.message);

    aiRecommendations = [
      {
        title: "Revisar avances",
        message:
          "Puedes revisar las emociones, rutinas y conversaciones recientes para elegir qué practicar esta semana.",
        icon: "💡",
      },
    ];
  }

  const recommendations =
    aiRecommendations.length > 0 ? aiRecommendations : sensoryRecommendations;

  return {
    ...dashboardData,
    moodSummary: moodSummary.rows,
    recentActivity: recentActivity.rows,
    favoriteConversations: favoriteConversations.rows,
    nextAchievement: getFirstRow(nextAchievement),
    emotionalTrend: emotionalTrend.rows,
    alerts,
    wellnessStatus,
    activityCalendar: activityCalendar.rows,
    weeklySupportPlan,
    weeklySupportPlanRecord,
    recommendations,
  };
};

module.exports = {
  getParentDashboard,
  getWeeklySupportPlanHistory,
};

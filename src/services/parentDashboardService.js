const pool = require("../database/db");
const {
  generateParentRecommendations,
} = require("./parentRecommendationService");

const getParentDashboard = async (userId) => {
  const userIdNumber = Number(userId);

  const emotions = await pool.query(
    `SELECT COUNT(*) FROM "FloFlo".mood WHERE user_id = $1`,
    [userIdNumber],
  );

  const routines = await pool.query(
    `SELECT COUNT(*) FROM "FloFlo".routine WHERE user_id = $1`,
    [userIdNumber],
  );

  const places = await pool.query(
    `SELECT COUNT(*) FROM "FloFlo".place WHERE user_id = $1`,
    [userIdNumber],
  );

  const contacts = await pool.query(
    `SELECT COUNT(*) FROM "FloFlo".user_contact WHERE user_id = $1`,
    [userIdNumber],
  );

  const conversations = await pool.query(
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
  );

  const achievements = await pool.query(
    `
    SELECT COUNT(*)
    FROM "FloFlo".user_achievement
    WHERE user_id = $1
    `,
    [userIdNumber],
  );
  const latestMood = await pool.query(
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
  );

  const latestRoutine = await pool.query(
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
  );

  const latestPlace = await pool.query(
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
  );

  const latestContactConversation = await pool.query(
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
  );

  const moodSummary = await pool.query(
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
  );

  const recentActivity = await pool.query(
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
  );
  const favoriteConversations = await pool.query(
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
  );
  const nextAchievement = await pool.query(
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
  CROSS JOIN "FloFlo".user_progress up
  LEFT JOIN "FloFlo".user_achievement ua
    ON ua.achievement_id = a.id
    AND ua.user_id = $1
  WHERE up.user_id = $1
  AND ua.id IS NULL
  ORDER BY a.required_value ASC
  LIMIT 1
  `,
    [userIdNumber],
  );

  const emotionalTrend = await pool.query(
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
  ORDER BY current_week DESC;
  `,
    [userIdNumber],
  );

  const alerts = [];

  if (Number(emotions.rows[0].count) === 0) {
    alerts.push({
      type: "warning",
      title: "Sin emociones registradas",
      message: "Todavía no hay emociones registradas para este usuario.",
      icon: "😊",
    });
  }

  if (Number(routines.rows[0].count) === 0) {
    alerts.push({
      type: "warning",
      title: "Sin rutinas creadas",
      message: "Aún no hay rutinas registradas.",
      icon: "🕒",
    });
  }

  if (Number(conversations.rows[0].count) === 0) {
    alerts.push({
      type: "warning",
      title: "Sin conversaciones",
      message: "Todavía no hay conversaciones disponibles para practicar.",
      icon: "💬",
    });
  }

  if (Number(achievements.rows[0].count) > 0) {
    alerts.push({
      type: "success",
      title: "Logros desbloqueados",
      message: `Ya tiene ${Number(achievements.rows[0].count)} logro(s) desbloqueado(s).`,
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

  const activityCalendar = await pool.query(
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
  );
  const dashboardData = {
    emotions: Number(emotions.rows[0].count),
    routines: Number(routines.rows[0].count),
    places: Number(places.rows[0].count),
    contacts: Number(contacts.rows[0].count),
    conversations: Number(conversations.rows[0].count),
    achievements: Number(achievements.rows[0].count),
    latestMood: latestMood.rows[0] || null,
    latestRoutine: latestRoutine.rows[0] || null,
    latestPlace: latestPlace.rows[0] || null,
    latestContactConversation: latestContactConversation.rows[0] || null,
  };
  let recommendations = [];

  try {
    recommendations = await generateParentRecommendations(dashboardData);
  } catch (error) {
    console.error("Error generando recomendaciones IA:", error.message);

    recommendations = [
      {
        title: "Revisar avances",
        message:
          "Puedes revisar las emociones, rutinas y conversaciones recientes para elegir qué practicar esta semana.",
        icon: "💡",
      },
    ];
  }
  return {
    emotions: Number(emotions.rows[0].count),
    routines: Number(routines.rows[0].count),
    places: Number(places.rows[0].count),
    contacts: Number(contacts.rows[0].count),
    conversations: Number(conversations.rows[0].count),
    achievements: Number(achievements.rows[0].count),
    latestMood: latestMood.rows[0] || null,
    latestRoutine: latestRoutine.rows[0] || null,
    latestPlace: latestPlace.rows[0] || null,
    latestContactConversation: latestContactConversation.rows[0] || null,
    moodSummary: moodSummary.rows,
    recentActivity: recentActivity.rows,
    favoriteConversations: favoriteConversations.rows,
    nextAchievement: nextAchievement.rows[0] || null,
    emotionalTrend: emotionalTrend.rows,
    alerts,
    activityCalendar: activityCalendar.rows,
    recommendations,
  };
};

module.exports = {
  getParentDashboard,
};

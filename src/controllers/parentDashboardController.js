const pool = require("../database/db");

const {
  getParentDashboard,
  getWeeklySupportPlanHistory,
} = require("../services/parentDashboardService");

const isValidId = (id) => {
  const numberId = Number(id);
  return Number.isInteger(numberId) && numberId > 0;
};

const checkParentChildRelation = async (parentId, childId) => {
  const result = await pool.query(
    `
    SELECT 1
    FROM "FloFlo".parent_child
    WHERE parent_id = $1
    AND child_id = $2
    LIMIT 1
    `,
    [parentId, childId],
  );

  return result.rows.length > 0;
};

const safeText = (value) => {
  return typeof value === "string" ? value.trim() : "";
};

const splitTerms = (text) => {
  if (!text || typeof text !== "string") return [];

  return text
    .split(/,|;|\n|\.| y /i)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3)
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1));
};

const countRepeatedTerms = (terms) => {
  const map = new Map();

  terms.forEach((term) => {
    const key = term.toLowerCase();
    const current = map.get(key);

    if (current) {
      map.set(key, {
        label: current.label,
        count: current.count + 1,
      });
    } else {
      map.set(key, {
        label: term,
        count: 1,
      });
    }
  });

  return Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
};

const sensoryFields = [
  {
    key: "noise_sensitivity",
    label: "Sensibilidad al ruido",
  },
  {
    key: "light_sensitivity",
    label: "Sensibilidad a la luz",
  },
  {
    key: "texture_sensitivity",
    label: "Sensibilidad a texturas",
  },
  {
    key: "crowd_sensitivity",
    label: "Sensibilidad a multitudes",
  },
  {
    key: "calming_items",
    label: "Objetos que ayudan a calmar",
  },
  {
    key: "calming_activities",
    label: "Actividades que ayudan",
  },
  {
    key: "stress_signals",
    label: "Señales de sobrecarga",
  },
  {
    key: "support_strategies",
    label: "Estrategias que funcionan",
  },
  {
    key: "notes",
    label: "Notas generales",
  },
];

const buildSensoryChanges = (currentProfile, previousProfile) => {
  if (!currentProfile || !previousProfile) return [];

  return sensoryFields
    .map((field) => {
      const currentValue = safeText(currentProfile[field.key]);
      const previousValue = safeText(previousProfile[field.key]);

      if (currentValue === previousValue) return null;

      return {
        field: field.key,
        label: field.label,
        before: previousValue || "Sin información registrada",
        after: currentValue || "Sin información registrada",
      };
    })
    .filter(Boolean);
};

const parsePlan = (plan) => {
  if (!plan) return null;

  if (typeof plan === "string") {
    try {
      return JSON.parse(plan);
    } catch (error) {
      return null;
    }
  }

  return plan;
};

const getMyDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    const dashboard = await getParentDashboard(userId);

    res.json(dashboard);
  } catch (error) {
    console.error("Error obteniendo mi dashboard:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo dashboard",
    });
  }
};

const getChildDashboard = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { childId } = req.params;

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo un cuidador puede ver el dashboard de un niño",
      });
    }

    if (!isValidId(childId)) {
      return res.status(400).json({
        message: "ID de niño inválido",
      });
    }

    const childIdNumber = Number(childId);

    const hasRelation = await checkParentChildRelation(parentId, childIdNumber);

    if (!hasRelation) {
      return res.status(403).json({
        message: "No tienes permiso para ver este dashboard",
      });
    }

    const dashboard = await getParentDashboard(childIdNumber);

    res.json(dashboard);
  } catch (error) {
    console.error("Error obteniendo dashboard del niño:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo dashboard del niño",
    });
  }
};

const getChildWeeklySupportPlanHistory = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { childId } = req.params;

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo un cuidador puede ver el historial del plan semanal",
      });
    }

    if (!isValidId(childId)) {
      return res.status(400).json({
        message: "ID de niño inválido",
      });
    }

    const childIdNumber = Number(childId);

    const hasRelation = await checkParentChildRelation(parentId, childIdNumber);

    if (!hasRelation) {
      return res.status(403).json({
        message: "No tienes permiso para ver este historial",
      });
    }

    const history = await getWeeklySupportPlanHistory(childIdNumber);

    res.json(history);
  } catch (error) {
    console.error("Error obteniendo historial del plan semanal:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo historial del plan semanal",
    });
  }
};

const getChildEvolutionDashboard = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { childId } = req.params;

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo un cuidador puede ver el dashboard de evolución",
      });
    }

    if (!isValidId(childId)) {
      return res.status(400).json({
        message: "ID de niño inválido",
      });
    }

    const childIdNumber = Number(childId);

    const hasRelation = await checkParentChildRelation(parentId, childIdNumber);

    if (!hasRelation) {
      return res.status(403).json({
        message: "No tienes permiso para ver esta evolución",
      });
    }

    const [sensoryHistoryResult, emotionalTrendResult, weeklyPlansResult] =
      await Promise.all([
        pool.query(
          `
          SELECT
            id,
            user_id,
            noise_sensitivity,
            light_sensitivity,
            texture_sensitivity,
            crowd_sensitivity,
            calming_items,
            calming_activities,
            stress_signals,
            support_strategies,
            notes,
            created_at
          FROM "FloFlo".sensory_profile_history
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 12
          `,
          [childIdNumber],
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
          [childIdNumber],
        ),

        pool.query(
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
          LIMIT 8
          `,
          [childIdNumber],
        ),
      ]);

    const sensoryHistory = sensoryHistoryResult.rows;
    const latestSensoryProfile = sensoryHistory[0] || null;
    const previousSensoryProfile = sensoryHistory[1] || null;

    const latestChanges = buildSensoryChanges(
      latestSensoryProfile,
      previousSensoryProfile,
    );

    const emotionalEvolution = emotionalTrendResult.rows.map((item) => {
      const currentWeek = Number(item.current_week || 0);
      const previousWeek = Number(item.previous_week || 0);
      const difference = currentWeek - previousWeek;

      let status = "stable";
      let message = "Se mantuvo estable respecto a la semana anterior.";

      if (difference > 0) {
        status = "increased";
        message = "Aumentó respecto a la semana anterior.";
      }

      if (difference < 0) {
        status = "decreased";
        message = "Disminuyó respecto a la semana anterior.";
      }

      return {
        mood_name: item.mood_name,
        icon: item.icon,
        current_week: currentWeek,
        previous_week: previousWeek,
        difference,
        status,
        message,
      };
    });

    const supportTerms = [];
    const strategyTerms = [];

    sensoryHistory.forEach((profile) => {
      supportTerms.push(...splitTerms(profile.calming_items));
      supportTerms.push(...splitTerms(profile.calming_activities));
      strategyTerms.push(...splitTerms(profile.support_strategies));
    });

    weeklyPlansResult.rows.forEach((record) => {
      const plan = parsePlan(record.plan);

      if (Array.isArray(plan?.tips)) {
        plan.tips.forEach((tip) => {
          strategyTerms.push(...splitTerms(tip));
        });
      }

      if (Array.isArray(plan?.days)) {
        plan.days.forEach((day) => {
          supportTerms.push(...splitTerms(day.action));
        });
      }
    });

    const importantChanges = latestChanges.slice(0, 5).map((change) => ({
      title: change.label,
      before: change.before,
      after: change.after,
      type: "sensory_change",
    }));

    weeklyPlansResult.rows.slice(0, 2).forEach((record) => {
      if (record.focus) {
        importantChanges.push({
          title: `Plan semanal: ${record.title || "Plan guardado"}`,
          before: null,
          after: record.focus,
          type: "weekly_plan_focus",
        });
      }
    });

    res.json({
      sensoryEvolution: {
        totalVersions: sensoryHistory.length,
        lastUpdatedAt: latestSensoryProfile?.created_at || null,
        latestChanges,
      },
      emotionalEvolution,
      importantChanges,
      repeatedSupports: countRepeatedTerms(supportTerms),
      usefulStrategies: countRepeatedTerms(strategyTerms),
    });
  } catch (error) {
    console.error("Error obteniendo dashboard de evolución:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo dashboard de evolución",
    });
  }
};

module.exports = {
  getMyDashboard,
  getChildDashboard,
  getChildWeeklySupportPlanHistory,
  getChildEvolutionDashboard,
};
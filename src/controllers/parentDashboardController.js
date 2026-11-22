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
    SELECT pc.child_id
    FROM "FloFlo".parent_child pc
    INNER JOIN "FloFlo".child_profile cp
      ON cp.id = pc.child_id
    INNER JOIN "FloFlo"."user" u
      ON u.id = pc.parent_id
    WHERE pc.parent_id = $1
      AND pc.child_id = $2
      AND pc.status = 'active'
      AND cp.status = 'active'
      AND u.is_active = true
      AND u.role = 'parent'
      AND pc.access_profile IN (
        'primary_caregiver',
        'caregiver'
      )
    LIMIT 1
    `,
    [parentId, childId],
  );

  return result.rows.length > 0;
};

const safeText = (value) => {
  return typeof value === "string" ? value.trim() : "";
};

const normalizeText = (value) => {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};

const ignoredTerms = new Set([
  "clara",
  "claras",
  "breve",
  "breves",
  "importante",
  "importantes",
  "actividad",
  "actividades",
  "accion",
  "acciones",
  "sugerida",
  "sugeridas",
  "estrategia",
  "estrategias",
  "felix",
]);

const supportPatterns = [
  {
    label: "Conversar sobre la emoción",
    keywords: ["emocion", "emocional", "conversar", "preguntar que pudo"],
  },
  {
    label: "Practicar conversaciones sociales",
    keywords: ["practicar la conversacion", "conversacion social", "que decir"],
  },
  {
    label: "Guiar rutina paso a paso",
    keywords: ["rutina", "paso a paso", "repasar"],
  },
  {
    label: "Anticipar antes de una actividad",
    keywords: ["anticipar", "antes de una actividad", "preparar"],
  },
  {
    label: "Ofrecer pausa o espacio tranquilo",
    keywords: ["pausa", "descanso", "lugar tranquilo", "espacio tranquilo"],
  },
  {
    label: "Usar objeto calmante",
    keywords: ["objeto calmante", "manta", "peluche", "audifono", "audifonos"],
  },
  {
    label: "Reducir estímulos sensoriales",
    keywords: ["ruido", "luz", "textura", "multitud", "estimulo"],
  },
  {
    label: "Realizar actividad calmante",
    keywords: ["dibujar", "pintar", "colorear", "respirar", "musica"],
  },
  {
    label: "Reforzar avances y logros",
    keywords: ["logro", "logros", "felicitar", "esfuerzo", "avance", "avances"],
  },
];

const strategyPatterns = [
  {
    label: "Usar frases cortas y claras",
    keywords: ["frases cortas", "frase corta", "instrucciones simples"],
  },
  {
    label: "Hablar con calma",
    keywords: ["hablarle", "hablar con calma", "voz calmada", "tono calmo"],
  },
  {
    label: "Anticipar cambios importantes",
    keywords: ["anticipar cambios", "anticipar", "avisar antes", "preparar"],
  },
  {
    label: "Ofrecer pausa",
    keywords: ["pausa", "descanso", "detener", "espacio tranquilo"],
  },
  {
    label: "Validar y nombrar la emoción",
    keywords: ["validar", "nombrar la emocion", "reconocer la emocion"],
  },
  {
    label: "Guiar paso a paso",
    keywords: ["paso a paso", "guiar", "acompanar", "acompañar"],
  },
  {
    label: "Reforzar avances pequeños",
    keywords: ["reforzar", "felicitar", "logro", "avance"],
  },
  {
    label: "Mantener rutina predecible",
    keywords: ["rutina", "predecible", "estructura"],
  },
];

const splitCandidatePhrases = (text) => {
  if (!text || typeof text !== "string") return [];

  return text
    .replace(/[“”"]/g, "")
    .split(/,|;|\n|\.|\s+y\s+/gi)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4)
    .filter((item) => item.length <= 90)
    .filter((item) => !ignoredTerms.has(normalizeText(item)))
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1));
};

const extractCategorizedTerms = (text, patterns, allowFallback = true) => {
  const normalizedText = normalizeText(text);

  if (!normalizedText || ignoredTerms.has(normalizedText)) {
    return [];
  }

  const matchedLabels = patterns
    .filter((pattern) =>
      pattern.keywords.some((keyword) =>
        normalizedText.includes(normalizeText(keyword)),
      ),
    )
    .map((pattern) => pattern.label);

  const uniqueLabels = [...new Set(matchedLabels)];

  if (uniqueLabels.length > 0) {
    return uniqueLabels;
  }

  if (!allowFallback) {
    return [];
  }

  return splitCandidatePhrases(text).slice(0, 2);
};

const extractSupportTerms = (text) => {
  return extractCategorizedTerms(text, supportPatterns, true);
};

const extractStrategyTerms = (text) => {
  return extractCategorizedTerms(text, strategyPatterns, false);
};

const countRepeatedTerms = (terms) => {
  const map = new Map();

  terms.forEach((term) => {
    const cleanTerm = String(term || "").trim();

    if (!cleanTerm) return;

    const normalizedTerm = normalizeText(cleanTerm);

    if (ignoredTerms.has(normalizedTerm)) return;

    const current = map.get(normalizedTerm);

    if (current) {
      map.set(normalizedTerm, {
        label: current.label,
        count: current.count + 1,
      });
    } else {
      map.set(normalizedTerm, {
        label: cleanTerm,
        count: 1,
      });
    }
  });

  return Array.from(map.values())
    .filter((item) => item.label.length >= 4)
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
    if (req.user.role !== "child") {
      return res.status(403).json({
        message:
          "Esta ruta es solo para cuentas de niño/a. Los cuidadores deben usar /children/:childId",
      });
    }

    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT id
      FROM "FloFlo".child_profile
      WHERE legacy_user_id = $1
        AND status = 'active'
      LIMIT 2
      `,
      [userId],
    );

    if (result.rows.length !== 1) {
      return res.status(403).json({
        message:
          "No existe un perfil infantil activo asociado de forma única a esta cuenta",
      });
    }

    const childId = result.rows[0].id;

    const dashboard = await getParentDashboard(childId);

    return res.json(dashboard);
  } catch (error) {
    console.error("Error obteniendo mi dashboard:", error);

    return res.status(500).json({
      message: "Error obteniendo dashboard",
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
      supportTerms.push(...extractSupportTerms(profile.calming_items));
      supportTerms.push(...extractSupportTerms(profile.calming_activities));
      strategyTerms.push(...extractStrategyTerms(profile.support_strategies));
    });

    weeklyPlansResult.rows.forEach((record) => {
      const plan = parsePlan(record.plan);

      if (Array.isArray(plan?.tips)) {
        plan.tips.forEach((tip) => {
          strategyTerms.push(...extractStrategyTerms(tip));
        });
      }

      if (Array.isArray(plan?.days)) {
        plan.days.forEach((day) => {
          supportTerms.push(...extractSupportTerms(day.action));
          strategyTerms.push(...extractStrategyTerms(day.action));
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
      const plan = parsePlan(record.plan);
      const focus = record.focus || plan?.focus;

      if (focus) {
        importantChanges.push({
          title: `Plan semanal: ${record.title || "Plan guardado"}`,
          before: null,
          after: focus,
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

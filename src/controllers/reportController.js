const PDFDocument = require("pdfkit");
const pool = require("../database/db");
const parentDashboardService = require("../services/parentDashboardService");

const COLORS = {
  purple: "#4B367C",
  purpleLight: "#F3ECFF",
  text: "#111827",
  muted: "#4B5563",
  softGray: "#E5E7EB",
  green: "#047857",
  greenLight: "#ECFDF5",
  yellow: "#B45309",
  yellowLight: "#FFFBEB",
  red: "#B91C1C",
  redLight: "#FEF2F2",
};

const isValidId = (id) => {
  const numberId = Number(id);
  return Number.isInteger(numberId) && numberId > 0;
};

const hasText = (value) => {
  return typeof value === "string" && value.trim().length > 0;
};

const safeText = (value, fallback = "Sin información registrada") => {
  return hasText(value) ? String(value).trim() : fallback;
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

const getSensoryProfile = async (userId) => {
  const result = await pool.query(
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
      notes,
      updated_at
    FROM "FloFlo".sensory_profile
    WHERE user_id = $1
    `,
    [userId],
  );

  return result.rows[0] || null;
};

const getSensoryProfileHistory = async (userId) => {
  const result = await pool.query(
    `
    SELECT
      id,
      user_id,
      created_by,
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
    LIMIT 5
    `,
    [userId],
  );

  return result.rows;
};

const hasSensoryProfileData = (profile) => {
  if (!profile) return false;

  return [
    profile.noise_sensitivity,
    profile.light_sensitivity,
    profile.texture_sensitivity,
    profile.crowd_sensitivity,
    profile.calming_items,
    profile.calming_activities,
    profile.stress_signals,
    profile.support_strategies,
    profile.notes,
  ].some(hasText);
};

const addFooter = (doc) => {
  const bottom = doc.page.height - 45;

  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#9CA3AF")
    .text("FloFlo - Reporte de acompañamiento familiar", 50, bottom, {
      align: "center",
      width: doc.page.width - 100,
    });

  doc.fillColor(COLORS.text);
};

const addSectionTitle = (doc, title) => {
  doc.moveDown(1);

  doc.fontSize(18).font("Helvetica-Bold").fillColor(COLORS.purple).text(title);

  doc
    .moveTo(50, doc.y + 6)
    .lineTo(doc.page.width - 50, doc.y + 6)
    .strokeColor(COLORS.softGray)
    .lineWidth(1)
    .stroke();

  doc.moveDown(1);
  doc.fillColor(COLORS.text);
};

const addTextLine = (doc, label, value) => {
  if (!hasText(value)) return;

  doc
    .fontSize(11)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text(`${label}:`, {
      continued: true,
    });

  doc.font("Helvetica").fillColor(COLORS.muted).text(` ${value}`);
  doc.moveDown(0.45);
};

const addCover = (doc, user) => {
  doc.rect(0, 0, doc.page.width, 130).fill(COLORS.purpleLight);

  doc
    .fontSize(28)
    .font("Helvetica-Bold")
    .fillColor(COLORS.purple)
    .text("Reporte de Progreso FloFlo", 50, 45);

  doc
    .fontSize(12)
    .font("Helvetica")
    .fillColor(COLORS.muted)
    .text("Resumen familiar para acompañar avances, rutinas y apoyos.", 50, 82);

  doc.y = 160;

  doc
    .fontSize(12)
    .font("Helvetica")
    .fillColor(COLORS.muted)
    .text(`Fecha: ${new Date().toLocaleDateString("es-CL")}`);

  doc.text(`Nombre: ${user?.firstName || ""} ${user?.lastName || ""}`);
  doc.text(`Correo: ${user?.email || "Sin correo registrado"}`);

  doc.moveDown(1.5);
};

const addSummaryToPdf = (doc, dashboard) => {
  addSectionTitle(doc, "Resumen general");

  const items = [
    ["Emociones", dashboard.emotions],
    ["Rutinas", dashboard.routines],
    ["Lugares", dashboard.places],
    ["Contactos", dashboard.contacts],
    ["Conversaciones", dashboard.conversations],
    ["Logros", dashboard.achievements],
  ];

  items.forEach(([label, value]) => {
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .fillColor(COLORS.text)
      .text(`${label}:`, {
        continued: true,
      });

    doc
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text(` ${value ?? 0}`);

    doc.moveDown(0.35);
  });
};
const addWellnessStatusToPdf = (doc, wellnessStatus) => {
  if (!wellnessStatus) return;

  addSectionTitle(doc, "Semáforo de bienestar");

  const reasons = Array.isArray(wellnessStatus.reasons)
    ? wellnessStatus.reasons
    : [];

  const levelStyles = {
    green: {
      color: COLORS.green,
      background: COLORS.greenLight,
      label: "Bienestar estable",
    },
    yellow: {
      color: COLORS.yellow,
      background: COLORS.yellowLight,
      label: "Requiere observación",
    },
    red: {
      color: COLORS.red,
      background: COLORS.redLight,
      label: "Necesita apoyo cercano",
    },
  };

  const currentStyle = levelStyles[wellnessStatus.level] || levelStyles.yellow;

  const startY = doc.y;
  const boxHeight = reasons.length > 0 ? 165 : 125;

  doc
    .roundedRect(50, startY, doc.page.width - 100, boxHeight, 14)
    .fillAndStroke(currentStyle.background, currentStyle.color);

  doc.y = startY + 18;

  doc
    .fontSize(13)
    .font("Helvetica-Bold")
    .fillColor(COLORS.muted)
    .text("Estado general actual", 70, doc.y);

  doc.moveDown(0.45);

  const titleY = doc.y;

  doc.circle(82, titleY + 13, 8).fill(currentStyle.color);

  doc
    .fontSize(20)
    .font("Helvetica-Bold")
    .fillColor(currentStyle.color)
    .text(wellnessStatus.title || currentStyle.label, 100, titleY, {
      width: doc.page.width - 180,
    });

  doc.y = titleY + 32;

  doc
    .fontSize(11)
    .font("Helvetica")
    .fillColor(COLORS.muted)
    .text(
      safeText(
        wellnessStatus.message,
        "Resumen general del estado actual según los registros recientes.",
      ),
      70,
      doc.y,
      {
        width: doc.page.width - 140,
      },
    );

  doc.moveDown(0.4);

  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(currentStyle.color)
    .text(`Puntaje: ${wellnessStatus.score ?? 0}`, 70, doc.y);

  if (reasons.length > 0) {
    doc.moveDown(0.5);

    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor(COLORS.text)
      .text("Motivos principales:", 70, doc.y);

    doc.moveDown(0.25);

    reasons.slice(0, 4).forEach((reason) => {
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor(COLORS.muted)
        .text(`- ${reason}`, 82, doc.y, {
          width: doc.page.width - 160,
        });

      doc.moveDown(0.2);
    });
  }

  doc.y = startY + boxHeight + 18;

  if (wellnessStatus.suggestedAction) {
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .fillColor(COLORS.text)
      .text("Acción sugerida:");

    doc.moveDown(0.25);

    doc
      .fontSize(10.5)
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text(wellnessStatus.suggestedAction);

    doc.moveDown(0.7);
  }

  doc.fillColor(COLORS.text);
};

const formatDate = (date) => {
  if (!date) return null;

  return new Date(date).toLocaleString("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  });
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
      const currentValue = currentProfile[field.key]?.trim() || "";
      const previousValue = previousProfile[field.key]?.trim() || "";

      if (currentValue === previousValue) return null;

      return {
        label: field.label,
        before: previousValue || "Sin información registrada",
        after: currentValue || "Sin información registrada",
      };
    })
    .filter(Boolean);
};

const addSensoryProfileToPdf = (doc, sensoryProfile, sensoryHistory = []) => {
  addSectionTitle(doc, "Perfil sensorial");

  const lastUpdatedAt =
    sensoryProfile?.updated_at || sensoryHistory?.[0]?.created_at || null;

  const formattedLastUpdatedAt = formatDate(lastUpdatedAt);

  if (formattedLastUpdatedAt) {
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor(COLORS.text)
      .text("Última actualización:", {
        continued: true,
      });

    doc
      .font("Helvetica")
      .fillColor(COLORS.purple)
      .text(` ${formattedLastUpdatedAt}`);

    doc.moveDown(0.8);
  }

  if (!hasSensoryProfileData(sensoryProfile)) {
    doc
      .fontSize(12)
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text("No hay perfil sensorial registrado todavía.");

    doc.moveDown(1);
    return;
  }

  doc
    .fontSize(13)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text("Sensibilidades principales");

  doc.moveDown(0.5);

  addTextLine(doc, "Ruido", sensoryProfile.noise_sensitivity);
  addTextLine(doc, "Luz", sensoryProfile.light_sensitivity);
  addTextLine(doc, "Texturas", sensoryProfile.texture_sensitivity);
  addTextLine(doc, "Multitudes", sensoryProfile.crowd_sensitivity);

  doc.moveDown(0.8);

  doc
    .fontSize(13)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text("Elementos y actividades que ayudan");

  doc.moveDown(0.5);

  addTextLine(doc, "Objetos calmantes", sensoryProfile.calming_items);
  addTextLine(doc, "Actividades calmantes", sensoryProfile.calming_activities);

  doc.moveDown(0.8);

  doc
    .fontSize(13)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text("Señales y estrategias");

  doc.moveDown(0.5);

  addTextLine(doc, "Señales observables", sensoryProfile.stress_signals);
  addTextLine(doc, "Estrategias", sensoryProfile.support_strategies);
  addTextLine(doc, "Notas", sensoryProfile.notes);

  const previousProfile = sensoryHistory?.[1] || null;
  const changes = buildSensoryChanges(sensoryProfile, previousProfile);

  doc.moveDown(0.8);

  doc
    .fontSize(13)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text("Cambios recientes respecto a la versión anterior");

  doc.moveDown(0.5);

  if (!previousProfile) {
    doc
      .fontSize(11)
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text("Todavía se necesita una versión anterior para comparar cambios.");
  } else if (changes.length === 0) {
    doc
      .fontSize(11)
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text("No se detectaron cambios respecto a la versión anterior.");
  } else {
    changes.forEach((change) => {
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor(COLORS.purple)
        .text(change.label);

      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(COLORS.text)
        .text("Antes:", {
          continued: true,
        });

      doc.font("Helvetica").fillColor(COLORS.muted).text(` ${change.before}`);

      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(COLORS.text)
        .text("Ahora:", {
          continued: true,
        });

      doc.font("Helvetica").fillColor(COLORS.muted).text(` ${change.after}`);

      doc.moveDown(0.6);
    });
  }
};

const addWeeklySupportPlanToPdf = (doc, weeklySupportPlan) => {
  if (!weeklySupportPlan) return;

  addSectionTitle(doc, "Plan de apoyo semanal");

  const days = Array.isArray(weeklySupportPlan.days)
    ? weeklySupportPlan.days
    : [];

  const tips = Array.isArray(weeklySupportPlan.tips)
    ? weeklySupportPlan.tips
    : [];

  if (weeklySupportPlan.title) {
    doc
      .fontSize(13)
      .font("Helvetica-Bold")
      .fillColor(COLORS.purple)
      .text(weeklySupportPlan.title);

    doc.moveDown(0.5);
  }

  if (weeklySupportPlan.focus) {
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .fillColor(COLORS.text)
      .text("Enfoque de la semana:");

    doc
      .fontSize(11)
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text(weeklySupportPlan.focus);

    doc.moveDown(0.8);
  }

  if (days.length > 0) {
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .fillColor(COLORS.text)
      .text("Acciones sugeridas:");

    doc.moveDown(0.5);

    days.forEach((item) => {
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor(COLORS.purple)
        .text(
          `${safeText(item.day, "Día")} - ${safeText(
            item.title,
            "Actividad sugerida",
          )}`,
        );

      if (item.action) {
        doc
          .fontSize(10)
          .font("Helvetica")
          .fillColor(COLORS.muted)
          .text(`Acción: ${item.action}`);
      }

      if (item.reason) {
        doc
          .fontSize(10)
          .font("Helvetica")
          .fillColor("#6B7280")
          .text(`Por qué ayuda: ${item.reason}`);
      }

      doc.moveDown(0.55);
    });
  }

  if (tips.length > 0) {
    doc.moveDown(0.4);

    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .fillColor(COLORS.text)
      .text("Consejos rápidos:");

    doc.moveDown(0.3);

    tips.forEach((tip) => {
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor(COLORS.muted)
        .text(`- ${tip}`);
    });
  }

  doc.fillColor(COLORS.text);
};

const parseWeeklyPlan = (plan) => {
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

const addWeeklySupportPlanHistoryToPdf = (doc, weeklyPlanHistory = []) => {
  if (!Array.isArray(weeklyPlanHistory) || weeklyPlanHistory.length === 0) {
    return;
  }

  addSectionTitle(doc, "Historial de planes semanales");

  doc
    .fontSize(11)
    .font("Helvetica")
    .fillColor(COLORS.muted)
    .text(
      "Estos son los planes semanales guardados anteriormente para acompañar el progreso del niño.",
    );

  doc.moveDown(0.8);

  weeklyPlanHistory.slice(0, 4).forEach((record, index) => {
    const plan = parseWeeklyPlan(record.plan);

    const weekStart = record.week_start
      ? new Date(record.week_start).toLocaleDateString("es-CL", {
          dateStyle: "medium",
        })
      : "Semana no disponible";

    const updatedAt = record.updated_at
      ? new Date(record.updated_at).toLocaleString("es-CL", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : null;

    doc
      .fontSize(13)
      .font("Helvetica-Bold")
      .fillColor(COLORS.purple)
      .text(`Semana del ${weekStart}`);

    if (index === 0) {
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(COLORS.green)
        .text("Plan más reciente");
    }

    if (updatedAt) {
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor(COLORS.muted)
        .text(`Actualizado el ${updatedAt}`);
    }

    doc.moveDown(0.3);

    const focus = record.focus || plan?.focus;

    if (focus) {
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(COLORS.text)
        .text("Enfoque:", {
          continued: true,
        });

      doc.font("Helvetica").fillColor(COLORS.muted).text(` ${focus}`);
    }

    const days = Array.isArray(plan?.days) ? plan.days : [];

    if (days.length > 0) {
      doc.moveDown(0.3);

      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(COLORS.text)
        .text("Acciones sugeridas:");

      days.forEach((day) => {
        doc
          .fontSize(9.5)
          .font("Helvetica-Bold")
          .fillColor(COLORS.purple)
          .text(`${day.day || "Día"}:`, {
            continued: true,
          });

        doc
          .font("Helvetica")
          .fillColor(COLORS.muted)
          .text(` ${day.title || "Actividad sugerida"}`);

        if (day.action) {
          doc
            .fontSize(9)
            .font("Helvetica")
            .fillColor(COLORS.muted)
            .text(`Acción: ${day.action}`);
        }

        doc.moveDown(0.25);
      });
    }

    const tips = Array.isArray(plan?.tips) ? plan.tips : [];

    if (tips.length > 0) {
      doc.moveDown(0.2);

      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(COLORS.text)
        .text("Consejos rápidos:");

      tips.forEach((tip) => {
        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor(COLORS.muted)
          .text(`- ${tip}`);
      });
    }

    doc.moveDown(1);
  });

  doc.fillColor(COLORS.text);
};

const buildEvolutionDashboardData = async ({
  userId,
  sensoryProfile,
  sensoryHistory = [],
  weeklyPlanHistory = [],
  dashboard,
}) => {
  const sensoryCountResult = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM "FloFlo".sensory_profile_history
    WHERE user_id = $1
    `,
    [userId],
  );

  const totalSensoryVersions = Number(sensoryCountResult.rows[0]?.total || 0);

  const previousProfile = sensoryHistory?.[1] || null;
  const latestChanges = buildSensoryChanges(sensoryProfile, previousProfile);

  const emotionalEvolution = Array.isArray(dashboard?.emotionalTrend)
    ? dashboard.emotionalTrend.map((item) => {
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
          current_week: currentWeek,
          previous_week: previousWeek,
          difference,
          status,
          message,
        };
      })
    : [];

  const supportTerms = [];
  const strategyTerms = [];

  if (Array.isArray(sensoryHistory)) {
    sensoryHistory.forEach((profile) => {
      supportTerms.push(...extractSupportTerms(profile.calming_items));
      supportTerms.push(...extractSupportTerms(profile.calming_activities));
      strategyTerms.push(...extractStrategyTerms(profile.support_strategies));
    });
  }

  if (Array.isArray(weeklyPlanHistory)) {
    weeklyPlanHistory.forEach((record) => {
      const plan = parseWeeklyPlan(record.plan);

      if (Array.isArray(plan?.days)) {
        plan.days.forEach((day) => {
          supportTerms.push(...extractSupportTerms(day.action));
          strategyTerms.push(...extractStrategyTerms(day.action));
        });
      }

      if (Array.isArray(plan?.tips)) {
        plan.tips.forEach((tip) => {
          strategyTerms.push(...extractStrategyTerms(tip));
        });
      }
    });
  }

  const safeWeeklyPlanHistory = Array.isArray(weeklyPlanHistory)
    ? weeklyPlanHistory
    : [];

  const importantChanges = latestChanges.slice(0, 5).map((change) => ({
    title: change.label,
    before: change.before,
    after: change.after,
    type: "sensory_change",
  }));

  safeWeeklyPlanHistory.slice(0, 2).forEach((record) => {
    const plan = parseWeeklyPlan(record.plan);
    const focus = record.focus || plan?.focus;

    if (focus) {
      importantChanges.push({
        title: record.title || "Plan semanal",
        before: null,
        after: focus,
        type: "weekly_plan_focus",
      });
    }
  });

  return {
    sensoryEvolution: {
      totalVersions: totalSensoryVersions,
      lastUpdatedAt:
        sensoryProfile?.updated_at || sensoryHistory?.[0]?.created_at || null,
      latestChanges,
    },
    emotionalEvolution,
    importantChanges,
    repeatedSupports: countRepeatedTerms(supportTerms),
    usefulStrategies: countRepeatedTerms(strategyTerms),
  };
};

const addEvolutionDashboardToPdf = (doc, evolutionDashboard) => {
  if (!evolutionDashboard) return;

  addSectionTitle(doc, "Dashboard de evolución");

  const sensoryEvolution = evolutionDashboard.sensoryEvolution || {};

  const emotionalEvolution = Array.isArray(
    evolutionDashboard.emotionalEvolution,
  )
    ? evolutionDashboard.emotionalEvolution
    : [];

  const importantChanges = Array.isArray(evolutionDashboard.importantChanges)
    ? evolutionDashboard.importantChanges
    : [];

  const repeatedSupports = Array.isArray(evolutionDashboard.repeatedSupports)
    ? evolutionDashboard.repeatedSupports
    : [];

  const usefulStrategies = Array.isArray(evolutionDashboard.usefulStrategies)
    ? evolutionDashboard.usefulStrategies
    : [];

  doc
    .fontSize(11)
    .font("Helvetica")
    .fillColor(COLORS.muted)
    .text(
      "Resumen de cambios sensoriales, emocionales y apoyos que se repiten en el tiempo.",
    );

  doc.moveDown(0.9);

  doc
    .fontSize(13)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text("Evolución sensorial");

  doc.moveDown(0.4);

  doc
    .fontSize(11)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text("Versiones registradas:", {
      continued: true,
    });

  doc
    .font("Helvetica")
    .fillColor(COLORS.muted)
    .text(` ${sensoryEvolution.totalVersions || 0}`);

  const lastUpdatedAt = formatDate(sensoryEvolution.lastUpdatedAt);

  if (lastUpdatedAt) {
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor(COLORS.text)
      .text("Última actualización sensorial:", {
        continued: true,
      });

    doc.font("Helvetica").fillColor(COLORS.muted).text(` ${lastUpdatedAt}`);
  }

  doc.moveDown(0.8);

  doc
    .fontSize(13)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text("Evolución emocional semanal");

  doc.moveDown(0.4);

  if (emotionalEvolution.length > 0) {
    emotionalEvolution.slice(0, 6).forEach((emotion) => {
      let statusLabel = "Estable";

      if (emotion.status === "increased") {
        statusLabel = "Aumentó";
      }

      if (emotion.status === "decreased") {
        statusLabel = "Disminuyó";
      }

      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor(COLORS.purple)
        .text(`${emotion.mood_name}:`, {
          continued: true,
        });

      doc
        .font("Helvetica")
        .fillColor(COLORS.muted)
        .text(
          ` esta semana ${emotion.current_week}, semana anterior ${emotion.previous_week}. ${statusLabel}.`,
        );

      doc.moveDown(0.35);
    });
  } else {
    doc
      .fontSize(11)
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text("Todavía no hay datos emocionales suficientes para comparar.");
  }

  doc.moveDown(0.8);

  doc
    .fontSize(13)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text("Cambios recientes importantes");

  doc.moveDown(0.4);

  if (importantChanges.length > 0) {
    importantChanges.slice(0, 6).forEach((change) => {
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor(COLORS.purple)
        .text(`- ${safeText(change.title, "Cambio detectado")}`);

      if (change.before) {
        doc
          .fontSize(10)
          .font("Helvetica")
          .fillColor(COLORS.muted)
          .text(`Antes: ${change.before}`);
      }

      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor(COLORS.muted)
        .text(`Ahora: ${safeText(change.after, "")}`);

      doc.moveDown(0.45);
    });
  } else {
    doc
      .fontSize(11)
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text("No hay cambios recientes importantes detectados.");
  }

  doc.moveDown(0.8);

  doc
    .fontSize(13)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text("Apoyos que se repiten más");

  doc.moveDown(0.4);

  if (repeatedSupports.length > 0) {
    repeatedSupports.forEach((item) => {
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor(COLORS.muted)
        .text(`- ${item.label} (${item.count} vez/veces)`);
    });
  } else {
    doc
      .fontSize(11)
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text("Todavía no hay apoyos repetidos registrados.");
  }

  doc.moveDown(0.8);

  doc
    .fontSize(13)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text("Estrategias que aparecen como útiles");

  doc.moveDown(0.4);

  if (usefulStrategies.length > 0) {
    usefulStrategies.forEach((item) => {
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor(COLORS.muted)
        .text(`- ${item.label} (${item.count} vez/veces)`);
    });
  } else {
    doc
      .fontSize(11)
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text("Todavía no hay estrategias suficientes para comparar.");
  }

  doc.fillColor(COLORS.text);
};

const addEmotionalTrendToPdf = (doc, dashboard) => {
  addSectionTitle(doc, "Tendencia emocional");

  if (dashboard.emotionalTrend?.length > 0) {
    dashboard.emotionalTrend.forEach((item) => {
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor(COLORS.text)
        .text(`${item.mood_name}:`, {
          continued: true,
        });

      doc
        .font("Helvetica")
        .fillColor(COLORS.muted)
        .text(
          ` semana actual ${item.current_week}, semana anterior ${item.previous_week}`,
        );

      doc.moveDown(0.4);
    });
  } else {
    doc
      .fontSize(12)
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text("No hay tendencia emocional disponible.");
  }
};

const addRecommendationsToPdf = (doc, dashboard) => {
  addSectionTitle(doc, "Recomendaciones");

  if (dashboard.recommendations?.length > 0) {
    dashboard.recommendations.forEach((recommendation) => {
      doc
        .fontSize(12)
        .font("Helvetica-Bold")
        .fillColor(COLORS.purple)
        .text(`- ${safeText(recommendation.title, "Recomendación")}`);

      doc
        .fontSize(10.5)
        .font("Helvetica")
        .fillColor(COLORS.muted)
        .text(safeText(recommendation.message, ""));

      doc.moveDown(0.8);
    });
  } else {
    doc
      .fontSize(12)
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text("No hay recomendaciones disponibles.");
  }
};

const buildReport = async (res, userId) => {
  const dashboard = await parentDashboardService.getParentDashboard(userId);

  const weeklyPlanHistory =
    await parentDashboardService.getWeeklySupportPlanHistory(userId);

  const sensoryProfile = await getSensoryProfile(userId);
  const sensoryHistory = await getSensoryProfileHistory(userId);

  const evolutionDashboard = await buildEvolutionDashboardData({
    userId,
    sensoryProfile,
    sensoryHistory,
    weeklyPlanHistory,
    dashboard,
  });

  const userResult = await pool.query(
    `
    SELECT "firstName", "lastName", email
    FROM "FloFlo".user
    WHERE id = $1
    `,
    [userId],
  );

  const user = userResult.rows[0];

  const doc = new PDFDocument({
    margin: 50,
    size: "A4",
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=floflo-report.pdf",
  );

  doc.pipe(res);

  addCover(doc, user);
  addSummaryToPdf(doc, dashboard);
  addWellnessStatusToPdf(doc, dashboard.wellnessStatus);
  addSensoryProfileToPdf(doc, sensoryProfile, sensoryHistory);
  addWeeklySupportPlanToPdf(doc, dashboard.weeklySupportPlan);
  addWeeklySupportPlanHistoryToPdf(doc, weeklyPlanHistory);
  addEvolutionDashboardToPdf(doc, evolutionDashboard);
  addEmotionalTrendToPdf(doc, dashboard);
  addRecommendationsToPdf(doc, dashboard);
  addFooter(doc);

  doc.end();
};

const generateMyReport = async (req, res) => {
  try {
    const userId = req.user.id;

    await buildReport(res, userId);
  } catch (error) {
    console.error("Error generando mi reporte:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        message: "Error al generar reporte PDF",
      });
    }
  }
};

const generateChildReport = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { childId } = req.params;

    if (!isValidId(childId)) {
      return res.status(400).json({
        message: "ID de niño inválido",
      });
    }

    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo un cuidador puede generar reportes de un niño",
      });
    }

    const relation = await pool.query(
      `
      SELECT 1
      FROM "FloFlo".parent_child
      WHERE parent_id = $1
      AND child_id = $2
      LIMIT 1
      `,
      [parentId, Number(childId)],
    );

    if (relation.rows.length === 0) {
      return res.status(403).json({
        message: "No tienes permiso para generar el reporte de este niño",
      });
    }

    await buildReport(res, Number(childId));
  } catch (error) {
    console.error("Error generando reporte del niño:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        message: "Error al generar reporte PDF del niño",
      });
    }
  }
};

module.exports = {
  generateMyReport,
  generateChildReport,
};

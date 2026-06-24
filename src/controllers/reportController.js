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
      .text("Ultima actualizacion:", {
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
    .text("Cambios recientes respecto a la version anterior");

  doc.moveDown(0.5);

  if (!previousProfile) {
    doc
      .fontSize(11)
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text("Todavia se necesita una version anterior para comparar cambios.");
  } else if (changes.length === 0) {
    doc
      .fontSize(11)
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text("No se detectaron cambios respecto a la version anterior.");
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
          `${safeText(item.day, "Día")} - ${safeText(item.title, "Actividad sugerida")}`,
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
  const sensoryProfile = await getSensoryProfile(userId);
  const sensoryHistory = await getSensoryProfileHistory(userId);

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
  addSensoryProfileToPdf(doc, sensoryProfile, sensoryHistory);
  addWeeklySupportPlanToPdf(doc, dashboard.weeklySupportPlan);
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

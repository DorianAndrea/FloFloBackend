const PDFDocument = require("pdfkit");
const pool = require("../database/db");
const parentDashboardService = require("../services/parentDashboardService");

const isValidId = (id) => {
  const numberId = Number(id);
  return Number.isInteger(numberId) && numberId > 0;
};

const buildReport = async (res, userId) => {
  const dashboard = await parentDashboardService.getParentDashboard(userId);

  const userResult = await pool.query(
    `
    SELECT "firstName", "lastName", email
    FROM "FloFlo".user
    WHERE id = $1
    `,
    [userId]
  );

  const user = userResult.rows[0];

  const doc = new PDFDocument({ margin: 50 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=floflo-report.pdf"
  );

  doc.pipe(res);

  doc.fontSize(24).text("Reporte de Progreso FloFlo");
  doc.moveDown();

  doc.fontSize(12).text(`Fecha: ${new Date().toLocaleDateString("es-CL")}`);
  doc.text(`Nombre: ${user?.firstName || ""} ${user?.lastName || ""}`);
  doc.text(`Correo: ${user?.email || "Sin correo registrado"}`);

  doc.moveDown(2);

  doc.fontSize(18).text("Resumen General");
  doc.moveDown();

  doc.fontSize(12);
  doc.text(`Emociones: ${dashboard.emotions}`);
  doc.text(`Rutinas: ${dashboard.routines}`);
  doc.text(`Lugares: ${dashboard.places}`);
  doc.text(`Contactos: ${dashboard.contacts}`);
  doc.text(`Conversaciones: ${dashboard.conversations}`);
  doc.text(`Logros: ${dashboard.achievements}`);

  doc.moveDown(2);

  doc.fontSize(18).text("Tendencia emocional");
  doc.moveDown();

  if (dashboard.emotionalTrend?.length > 0) {
    dashboard.emotionalTrend.forEach((item) => {
      doc.fontSize(12).text(
        `${item.icon || ""} ${item.mood_name}: semana actual ${item.current_week}, semana anterior ${item.previous_week}`
      );
    });
  } else {
    doc.fontSize(12).text("No hay tendencia emocional disponible.");
  }

  doc.moveDown(2);

  doc.fontSize(18).text("Recomendaciones");
  doc.moveDown();

  if (dashboard.recommendations?.length > 0) {
    dashboard.recommendations.forEach((recommendation) => {
      doc.fontSize(12).text(`• ${recommendation.title}`);
      doc.text(recommendation.message);
      doc.moveDown();
    });
  } else {
    doc.fontSize(12).text("No hay recomendaciones disponibles.");
  }

  doc.end();
};

const generateMyReport = async (req, res) => {
  try {
    const userId = req.user.id;

    await buildReport(res, userId);
  } catch (error) {
    console.error("Error generando mi reporte:", error);
    res.status(500).json({
      message: "Error al generar reporte PDF",
    });
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
      [parentId, Number(childId)]
    );

    if (relation.rows.length === 0) {
      return res.status(403).json({
        message: "No tienes permiso para generar el reporte de este niño",
      });
    }

    await buildReport(res, Number(childId));
  } catch (error) {
    console.error("Error generando reporte del niño:", error);
    res.status(500).json({
      message: "Error al generar reporte PDF del niño",
    });
  }
};

module.exports = {
  generateMyReport,
  generateChildReport,
};
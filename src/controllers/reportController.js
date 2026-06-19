const PDFDocument = require("pdfkit");
const pool = require("../database/db");
const parentDashboardService = require("../services/parentDashboardService");

const generateReport = async (req, res) => {
  try {
    const { userId } = req.params;

    const dashboard = await parentDashboardService.getParentDashboard(userId);

    const userResult = await pool.query(
      `
  SELECT
    "firstName",
    "lastName",
    email
  FROM "FloFlo".user
  WHERE id = $1
  `,
      [userId],
    );

    const user = userResult.rows[0];

    const doc = new PDFDocument({
      margin: 50,
    });

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=floflo-report.pdf",
    );

    doc.pipe(res);

    // Título

    doc.fontSize(24).text("Reporte de Progreso FloFlo");

    doc.moveDown();

    doc.fontSize(12).text(`Fecha: ${new Date().toLocaleDateString("es-CL")}`);

    doc.text(`Nombre: ${user?.firstName || ""} ${user?.lastName || ""}`);

    doc.text(`Correo: ${user?.email || "Sin correo registrado"}`);

    doc.moveDown(2);

    // Resumen General

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

    // Últimos logros

    doc.fontSize(18).text("Últimos Logros");

    doc.moveDown();

    if (dashboard.latestAchievements?.length > 0) {
      dashboard.latestAchievements.forEach((achievement) => {
        doc.text(`• ${achievement.name}`);
        doc.text(achievement.description);
        doc.moveDown();
      });
    } else {
      doc.text("No hay logros desbloqueados.");
    }

    doc.moveDown();

    // Recomendaciones

    doc.fontSize(18).text("Recomendaciones de Félix");

    doc.moveDown();

    if (dashboard.recommendations?.length > 0) {
      dashboard.recommendations.forEach((recommendation) => {
        doc.text(`• ${recommendation.title}`);
        doc.text(recommendation.message);
        doc.moveDown();
      });
    } else {
      doc.text("No hay recomendaciones disponibles.");
    }

    doc.end();
  } catch (error) {
    console.error("Error generando PDF:", error);

    res.status(500).json({
      message: "Error al generar reporte PDF",
    });
  }
};

module.exports = {
  generateReport,
};

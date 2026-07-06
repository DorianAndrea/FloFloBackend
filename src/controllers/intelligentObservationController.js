const PDFDocument = require("pdfkit");
const {
  validatePositiveInteger,
  assertParentCanAccessChild,
  generateAndSaveIntelligentObservation,
  getLatestIntelligentObservation,
  getIntelligentObservationHistory,
  getIntelligentObservationById,
} = require("../services/intelligentObservationService");

const generateChildIntelligentObservation = async (req, res) => {
  try {
    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo un padre/cuidador puede generar informes de hijos",
      });
    }

    const parentId = validatePositiveInteger(req.user.id, "Padre/cuidador");
    const childId = validatePositiveInteger(req.params.childId, "Niño/a");
    const periodDays = req.query.periodDays || 30;

    await assertParentCanAccessChild(parentId, childId);

    const result = await generateAndSaveIntelligentObservation({
      childId,
      periodDays,
      generatedBy: parentId,
    });

    res.json(result);
  } catch (error) {
    console.error("Error generando informe inteligente del niño:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error generando informe inteligente del niño",
      latestReportId: error.latestReportId,
      latestCreatedAt: error.latestCreatedAt,
      nextAvailableAt: error.nextAvailableAt,
    });
  }
};

const getLatestChildIntelligentObservation = async (req, res) => {
  try {
    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo un padre/cuidador puede ver informes de hijos",
      });
    }

    const parentId = validatePositiveInteger(req.user.id, "Padre/cuidador");
    const childId = validatePositiveInteger(req.params.childId, "Niño/a");

    await assertParentCanAccessChild(parentId, childId);

    const report = await getLatestIntelligentObservation(childId);

    if (!report) {
      return res.status(404).json({
        message: "No hay informes inteligentes guardados para este niño/a",
      });
    }

    res.json(report);
  } catch (error) {
    console.error("Error obteniendo último informe inteligente:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo último informe inteligente",
    });
  }
};

const getChildIntelligentObservationHistory = async (req, res) => {
  try {
    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo un padre/cuidador puede ver historial de informes",
      });
    }

    const parentId = validatePositiveInteger(req.user.id, "Padre/cuidador");
    const childId = validatePositiveInteger(req.params.childId, "Niño/a");

    await assertParentCanAccessChild(parentId, childId);

    const history = await getIntelligentObservationHistory(childId);

    res.json(history);
  } catch (error) {
    console.error(
      "Error obteniendo historial de informes inteligentes:",
      error,
    );

    res.status(error.statusCode || 500).json({
      message:
        error.message || "Error obteniendo historial de informes inteligentes",
    });
  }
};

const formatDate = (dateValue) => {
  if (!dateValue) return "Sin fecha";

  return new Date(dateValue).toLocaleDateString("es-CL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const writeWrappedText = (doc, text, options = {}) => {
  doc.text(text, {
    align: options.align || "left",
    continued: false,
  });
};

const writeMarkdownReportToPdf = (doc, report) => {
  const lines = String(report || "").split("\n");

  lines.forEach((rawLine) => {
    const line = rawLine.trim();

    if (!line) {
      doc.moveDown(0.4);
      return;
    }

    if (line === "---") {
      doc.moveDown(0.3);
      doc
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke();
      doc.moveDown(0.5);
      return;
    }

    if (line.startsWith("# ")) {
      doc.moveDown(0.6);
      doc.font("Helvetica-Bold").fontSize(16).text(line.replace("# ", ""));
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(11);
      return;
    }

    if (line.startsWith("- ")) {
      doc
        .font("Helvetica")
        .fontSize(11)
        .text(`• ${line.replace("- ", "")}`, {
          indent: 12,
          continued: false,
        });
      doc.moveDown(0.2);
      return;
    }

    doc.font("Helvetica").fontSize(11);
    writeWrappedText(doc, line);
    doc.moveDown(0.25);
  });
};

const ioPdfCleanText = (value, fallback = "Sin información") => {
  if (!value) return fallback;
  return String(value).trim() || fallback;
};

const ioPdfFormatDate = (dateValue) => {
  if (!dateValue) return "Sin fecha";

  return new Date(dateValue).toLocaleDateString("es-CL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const ioPdfEnsureSpace = (doc, neededHeight = 80) => {
  const bottomLimit = doc.page.height - doc.page.margins.bottom;

  if (doc.y + neededHeight > bottomLimit) {
    doc.addPage();
  }
};

const ioPdfParseReportSections = (reportText) => {
  const lines = String(reportText || "").split("\n");
  const sections = [];
  let currentSection = null;

  lines.forEach((rawLine) => {
    const line = rawLine.trim();

    if (line.startsWith("# ")) {
      if (currentSection) {
        sections.push(currentSection);
      }

      currentSection = {
        title: line.replace("# ", "").trim(),
        lines: [],
      };

      return;
    }

    if (!currentSection) return;
    if (line === "---") return;

    currentSection.lines.push(rawLine);
  });

  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
};

const ioPdfDrawHeader = (doc) => {
  doc.rect(0, 0, doc.page.width, 165).fill("#F3ECFF");

  ioPdfDrawBrandMark(doc, 55, 38);

  doc
    .fillColor("#4B367C")
    .font("Helvetica-Bold")
    .fontSize(31)
    .text("FloFlo", 115, 38);

  doc
    .font("Helvetica-Bold")
    .fontSize(21)
    .fillColor("#4B367C")
    .text("Informe Inteligente de Observaciones", 115, 78, {
      width: doc.page.width - 170,
    });

  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#5F6272")
    .text(
      "Observaciones familiares generadas a partir de la información registrada en FloFlo.",
      115,
      112,
      {
        width: doc.page.width - 170,
        lineGap: 2,
      },
    );

  doc.roundedRect(55, 135, doc.page.width - 110, 18, 9).fill("#E8DDFF");

  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor("#6B4FC3")
    .text("APOYO FAMILIAR · PERFIL SENSORIAL · RUTINAS · EMOCIONES", 65, 140, {
      width: doc.page.width - 130,
      align: "center",
    });

  doc.y = 195;
};

const ioPdfDrawMetadata = (doc, report) => {
  const childLabel = report.childName?.trim() || `Niño/a ID: ${report.childId}`;

  const generatedByLabel =
    report.generatedByName?.trim() ||
    (report.generatedBy
      ? `Usuario ID: ${report.generatedBy}`
      : "No registrado");

  doc.font("Helvetica").fontSize(11).fillColor("#4B5563");

  doc.text(`Fecha: ${ioPdfFormatDate(report.createdAt)}`);
  doc.text(`Niño/a: ${childLabel}`);
  doc.text(`Generado por: ${generatedByLabel}`);
  doc.text(`Período analizado: últimos ${report.periodDays} días`);

  doc.moveDown(1.2);
};

const ioPdfDrawSectionTitle = (doc, title) => {
  ioPdfEnsureSpace(doc, 70);

  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor("#4B367C")
    .text(title, left, doc.y, {
      width,
      align: "left",
    });

  doc.moveDown(0.25);

  doc
    .strokeColor("#E5E7EB")
    .lineWidth(1)
    .moveTo(left, doc.y)
    .lineTo(left + width, doc.y)
    .stroke();

  doc.moveDown(0.8);
};

const ioPdfDrawDataSummary = (doc, dataSummary = {}) => {
  ioPdfDrawSectionTitle(doc, "Datos considerados");

  const items = [
    ["Emociones registradas", dataSummary.moodsCount || 0],
    ["Rutinas registradas", dataSummary.routinesCount || 0],
    ["Rutinas completadas", dataSummary.routineCompletionsCount || 0],
    ["Lugares registrados", dataSummary.placesCount || 0],
    ["Personas importantes", dataSummary.contactsCount || 0],
    ["Conversaciones registradas", dataSummary.contactConversationsCount || 0],
    ["Logros obtenidos", dataSummary.achievementsCount || 0],
    ["Historial sensorial", dataSummary.sensoryHistoryCount || 0],
  ];

  const startX = doc.page.margins.left;
  const cardWidth = 235;
  const cardHeight = 50;
  const gap = 14;

  let x = startX;
  let y = doc.y;

  items.forEach(([label, value], index) => {
    if (y + cardHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      x = startX;
      y = doc.page.margins.top;
    }

    doc
      .roundedRect(x, y, cardWidth, cardHeight, 12)
      .fillAndStroke("#FAF7FF", "#E7D8FF");

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#6B5A89")
      .text(label, x + 14, y + 10, {
        width: cardWidth - 28,
      });

    doc
      .font("Helvetica-Bold")
      .fontSize(17)
      .fillColor("#4B367C")
      .text(String(value), x + 14, y + 27, {
        width: cardWidth - 28,
      });

    if (index % 2 === 0) {
      x = startX + cardWidth + gap;
    } else {
      x = startX;
      y += cardHeight + gap;
    }
  });

  if (items.length % 2 !== 0) {
    y += cardHeight + gap;
  }

  doc.x = doc.page.margins.left;
  doc.y = y + 10;
};

const ioPdfDrawReportLine = (doc, rawLine) => {
  const line = String(rawLine || "").trim();

  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  if (!line) {
    doc.moveDown(0.35);
    return;
  }

  ioPdfEnsureSpace(doc, 36);

  if (line.startsWith("- ")) {
    doc
      .font("Helvetica")
      .fontSize(10.5)
      .fillColor("#374151")
      .text(`• ${line.replace("- ", "")}`, left + 12, doc.y, {
        width: width - 12,
        lineGap: 3,
        align: "left",
      });

    doc.moveDown(0.2);
    return;
  }

  doc
    .font("Helvetica")
    .fontSize(10.5)
    .fillColor("#374151")
    .text(line, left, doc.y, {
      width,
      lineGap: 3,
      align: "left",
    });

  doc.moveDown(0.35);
};

const ioPdfDrawReportSection = (doc, section) => {
  ioPdfEnsureSpace(doc, 100);

  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const title = ioPdfCleanText(section.title, "Sección");

  doc
    .font("Helvetica-Bold")
    .fontSize(17)
    .fillColor("#4B367C")
    .text(title, left, doc.y, {
      width,
      align: "left",
    });

  doc.moveDown(0.35);

  doc
    .strokeColor("#E9DFFF")
    .lineWidth(1)
    .moveTo(left, doc.y)
    .lineTo(left + width, doc.y)
    .stroke();

  doc.moveDown(0.6);

  section.lines.forEach((line) => {
    ioPdfDrawReportLine(doc, line);
  });

  doc.moveDown(0.9);
};

const ioPdfDrawFooter = (doc) => {
  const bottomY = doc.page.height - 35;

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#8B7AA8")
    .text(
      "FloFlo - Informe generado automáticamente a partir de registros de la plataforma.",
      doc.page.margins.left,
      bottomY,
      {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: "center",
      },
    );
};

const ioPdfSlugify = (value) => {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
};

const ioPdfBuildFileName = (report) => {
  const childName =
    report.childName?.trim() || `nino-${report.childId || "sin-id"}`;

  const date = report.createdAt
    ? new Date(report.createdAt).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  return `informe-inteligente-${ioPdfSlugify(childName)}-${date}.pdf`;
};

const ioPdfDrawBrandMark = (doc, x, y) => {
  doc.roundedRect(x, y, 48, 48, 14).fillAndStroke("#DDF8EF", "#B7E8D2");

  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor("#4B367C")
    .text("F", x, y + 12, {
      width: 48,
      align: "center",
    });
};

const streamLatestReportPdf = ({ res, report }) => {
  const fileName = ioPdfBuildFileName(report);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);

  const doc = new PDFDocument({
    size: "A4",
    bufferPages: true,
    margins: {
      top: 55,
      bottom: 60,
      left: 55,
      right: 55,
    },
    info: {
      Title: "Informe Inteligente de Observaciones - FloFlo",
      Author: "FloFlo",
      Subject: "Informe de observaciones generado automáticamente",
    },
  });

  doc.pipe(res);

  ioPdfDrawHeader(doc);
  ioPdfDrawMetadata(doc, report);

  if (report.dataSummary) {
    ioPdfDrawDataSummary(doc, report.dataSummary);
  }

  const sections = ioPdfParseReportSections(report.report);

  sections.forEach((section) => {
    ioPdfDrawReportSection(doc, section);
  });

  ioPdfDrawPageNumbers(doc);

  doc.end();
};

const downloadLatestChildIntelligentObservationPdf = async (req, res) => {
  try {
    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo un padre/cuidador puede descargar informes de hijos",
      });
    }

    const parentId = validatePositiveInteger(req.user.id, "Padre/cuidador");
    const childId = validatePositiveInteger(req.params.childId, "Niño/a");

    await assertParentCanAccessChild(parentId, childId);

    const report = await getLatestIntelligentObservation(childId);

    if (!report) {
      return res.status(404).json({
        message: "No hay informes inteligentes guardados para este niño/a",
      });
    }
    const ioPdfDrawPageNumbers = (doc) => {
      const range = doc.bufferedPageRange();

      for (let i = range.start; i < range.start + range.count; i += 1) {
        doc.switchToPage(i);

        const pageNumber = i - range.start + 1;
        const totalPages = range.count;

        const left = doc.page.margins.left;
        const width =
          doc.page.width - doc.page.margins.left - doc.page.margins.right;

        const footerY = doc.page.height - 38;

        doc
          .strokeColor("#E9DFFF")
          .lineWidth(0.7)
          .moveTo(left, footerY - 10)
          .lineTo(left + width, footerY - 10)
          .stroke();

        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#8B7AA8")
          .text(
            "FloFlo - Informe generado automáticamente a partir de registros de la plataforma.",
            left,
            footerY,
            {
              width: width - 90,
              align: "left",
            },
          );

        doc
          .font("Helvetica-Bold")
          .fontSize(8)
          .fillColor("#4B367C")
          .text(`Página ${pageNumber} de ${totalPages}`, left, footerY, {
            width,
            align: "right",
          });
      }
    };

    streamLatestReportPdf({ res, report });
  } catch (error) {
    console.error("Error generando PDF del informe inteligente:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error generando PDF del informe inteligente",
    });
  }
};

const getChildIntelligentObservationById = async (req, res) => {
  try {
    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo un padre/cuidador puede ver informes de hijos",
      });
    }

    const parentId = validatePositiveInteger(req.user.id, "Padre/cuidador");
    const childId = validatePositiveInteger(req.params.childId, "Niño/a");
    const reportId = validatePositiveInteger(req.params.reportId, "Informe");

    await assertParentCanAccessChild(parentId, childId);

    const report = await getIntelligentObservationById({
      childId,
      reportId,
    });

    if (!report) {
      return res.status(404).json({
        message: "Informe inteligente no encontrado",
      });
    }

    res.json(report);
  } catch (error) {
    console.error("Error obteniendo informe inteligente por ID:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo informe inteligente",
    });
  }
};

const downloadChildIntelligentObservationPdfById = async (req, res) => {
  try {
    if (req.user.role !== "parent") {
      return res.status(403).json({
        message: "Solo un padre/cuidador puede descargar informes de hijos",
      });
    }

    const parentId = validatePositiveInteger(req.user.id, "Padre/cuidador");
    const childId = validatePositiveInteger(req.params.childId, "Niño/a");
    const reportId = validatePositiveInteger(req.params.reportId, "Informe");

    await assertParentCanAccessChild(parentId, childId);

    const report = await getIntelligentObservationById({
      childId,
      reportId,
    });

    if (!report) {
      return res.status(404).json({
        message: "Informe inteligente no encontrado",
      });
    }

    streamLatestReportPdf({ res, report });
  } catch (error) {
    console.error("Error descargando PDF de informe histórico:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error descargando PDF de informe histórico",
    });
  }
};

module.exports = {
  generateChildIntelligentObservation,
  getLatestChildIntelligentObservation,
  getChildIntelligentObservationHistory,
  downloadLatestChildIntelligentObservationPdf,
  getChildIntelligentObservationById,
  downloadChildIntelligentObservationPdfById,
};

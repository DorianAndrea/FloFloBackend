const express = require("express");
const cors = require("cors");
const multer = require("multer");
const routineRoutes = require("./routes/routinesRoutes");
const supportRoutes = require("./routes/supportRoutes");
const moodRoutes = require("./routes/moodRoutes");
const authRoutes = require("./routes/authRoutes");
const contactRoutes = require("./routes/contactRoutes");
const relationshipTypeRoutes = require("./routes/relationshipTypeRoutes");
const contactConversationRoutes = require("./routes/contactConversationRoutes");
const placeRoutes = require("./routes/placeRoutes");
const placeStepRoutes = require("./routes/placeStepRoutes");
const aiRoutes = require("./routes/aiRoutes");
const conversationRoutes = require("./routes/conversationRoutes");
const progressRoutes = require("./routes/progressRoutes");
const achievementRoutes = require("./routes/achievementRoutes");
const profileRoutes = require("./routes/profileRoutes");
const reportRoutes = require("./routes/reportRoutes");
const parentDashboardRoutes = require("./routes/parentDashboardRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const parentChildRoutes = require("./routes/parentChildRoutes");
const sensoryProfileRoutes = require("./routes/sensoryProfileRoutes");
const intelligentObservationRoutes = require("./routes/intelligentObservationRoutes");
const learningContextRoutes = require("./routes/learningContextRoutes"); 
const experienceTemplateRoutes = require("./routes/experienceTemplateRoutes");
const experienceLibraryRoutes = require("./routes/experienceLibraryRoutes");
const experienceFavoriteRoutes = require("./routes/experienceFavoriteRoutes");
const experienceRecommendationRoutes = require("./routes/experienceRecommendationRoutes");
const experienceRecentRoutes = require("./routes/experienceRecentRoutes");

const app = express();

app.set("trust proxy", 1);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.FRONTEND_URLS
    ? process.env.FRONTEND_URLS.split(",").map((origin) => origin.trim())
    : []),
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.warn("Origen bloqueado por CORS:", origin);
      return callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());

app.use("/uploads", express.static("uploads"));

app.use("/api/routines", routineRoutes);

app.use("/api/moods", moodRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/relationship-types", relationshipTypeRoutes);
app.use("/api/contact-conversations", contactConversationRoutes);
app.use("/api/places", placeRoutes);
app.use("/api/places", placeStepRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/achievements", achievementRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/parent-dashboard", parentDashboardRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/parent-child", parentChildRoutes);
app.use("/api/sensory-profile", sensoryProfileRoutes);
app.use("/api/intelligent-observations", intelligentObservationRoutes);
app.use("/api/learning-contexts", learningContextRoutes);
app.use("/api/experience-library", experienceLibraryRoutes);
app.use("/api/experience-templates", experienceTemplateRoutes);
app.use("/api/experience-favorites", experienceFavoriteRoutes);
app.use("/api/experience-recommendations", experienceRecommendationRoutes);
app.use("/api/experience-recents", experienceRecentRoutes);
app.use("/api/support", supportRoutes);


app.get("/", (req, res) => {
  res.send("Backend FloFlo funcionando");
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        message: "La imagen supera el máximo permitido de 10 MB.",
      });
    }

    return res.status(400).json({
      message: "No se pudo procesar la imagen.",
    });
  }

  if (
    error?.message ===
    "Formato de imagen no permitido. Usa JPG, PNG o WEBP."
  ) {
    return res.status(400).json({
      message: error.message,
    });
  }

  console.error("Error no controlado:", error);

  return res.status(500).json({
    message: "Ocurrió un error interno en el servidor.",
  });
});

module.exports = app;

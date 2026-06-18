const express = require("express");
const cors = require("cors");

const routineRoutes = require("./routes/routinesRoutes");
const moodRoutes = require("./routes/moodRoutes");
const authRoutes = require("./routes/authRoutes");
const contactRoutes = require("./routes/contactRoutes");
const relationshipTypeRoutes = require("./routes/relationshipTypeRoutes");
const contactConversationRoutes = require("./routes/contactConversationRoutes");
const app = express();
const placeRoutes = require("./routes/placeRoutes");
const placeStepRoutes = require("./routes/placeStepRoutes");
const aiRoutes = require("./routes/aiRoutes");
const conversationRoutes = require("./routes/conversationRoutes");
const progressRoutes = require("./routes/progressRoutes");
const achievementRoutes = require("./routes/achievementRoutes");
const profileRoutes = require("./routes/profileRoutes");

app.use(cors());
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
const parentDashboardRoutes = require("./routes/parentDashboardRoutes");

app.use("/api/parent-dashboard", parentDashboardRoutes);

app.get("/", (req, res) => {
  res.send("Backend FloFlo funcionando");
});


module.exports = app;
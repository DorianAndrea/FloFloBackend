const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const safeText = (value, fallback = "Sin datos") => {
  if (typeof value !== "string") return fallback;
  return value.trim() || fallback;
};

const hasText = (value) => {
  return typeof value === "string" && value.trim().length > 0;
};

const normalizeChildName = (value) => {
  const name = safeText(value, "el niño/la niña");

  if (name === "Sin datos") {
    return "el niño/la niña";
  }

  return name;
};

const buildSensoryContext = (sensoryProfile) => {
  if (!sensoryProfile) {
    return "No hay perfil sensorial registrado.";
  }

  const hasAnyData = [
    sensoryProfile.noise_sensitivity,
    sensoryProfile.light_sensitivity,
    sensoryProfile.texture_sensitivity,
    sensoryProfile.crowd_sensitivity,
    sensoryProfile.calming_items,
    sensoryProfile.calming_activities,
    sensoryProfile.stress_signals,
    sensoryProfile.support_strategies,
    sensoryProfile.notes,
  ].some(hasText);

  if (!hasAnyData) {
    return "Hay perfil sensorial creado, pero todavía no tiene información útil registrada.";
  }

  const items = [
    `Sensibilidad al ruido: ${safeText(sensoryProfile.noise_sensitivity)}`,
    `Sensibilidad a la luz: ${safeText(sensoryProfile.light_sensitivity)}`,
    `Sensibilidad a texturas: ${safeText(sensoryProfile.texture_sensitivity)}`,
    `Sensibilidad a multitudes: ${safeText(sensoryProfile.crowd_sensitivity)}`,
    `Objetos calmantes: ${safeText(sensoryProfile.calming_items)}`,
    `Actividades calmantes: ${safeText(sensoryProfile.calming_activities)}`,
    `Señales de estrés: ${safeText(sensoryProfile.stress_signals)}`,
    `Estrategias de apoyo: ${safeText(sensoryProfile.support_strategies)}`,
    `Notas: ${safeText(sensoryProfile.notes)}`,
  ];

  return items.join("\n");
};

const buildAlertsContext = (alerts = []) => {
  if (!Array.isArray(alerts) || alerts.length === 0) {
    return "No hay alertas activas.";
  }

  return alerts
    .map((alert) => {
      return `- ${safeText(alert.title)}: ${safeText(alert.message)}`;
    })
    .join("\n");
};

const sanitizeRecommendationText = (text, childName) => {
  if (!hasText(text)) return text;

  let cleaned = text;

  const replacement = childName || "el niño/la niña";

  const forbiddenNames = [
    "Martin",
    "Martín",
    "Tomas",
    "Tomás",
  ];

  forbiddenNames.forEach((name) => {
    if (replacement.toLowerCase().includes(name.toLowerCase())) return;

    const regex = new RegExp(`\\b${name}\\b`, "gi");
    cleaned = cleaned.replace(regex, replacement);
  });

  return cleaned;
};

const parseRecommendations = (content, childName) => {
  if (!content || typeof content !== "string") return [];

  try {
    const cleaned = content
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");

    if (start === -1 || end === -1) return [];

    const jsonText = cleaned.slice(start, end + 1);
    const parsed = JSON.parse(jsonText);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .slice(0, 3)
      .map((item) => ({
        title: sanitizeRecommendationText(
          safeText(item.title, "Recomendación de Félix"),
          childName
        ),
        message: sanitizeRecommendationText(
          safeText(
            item.message,
            "Revisa los avances recientes y elige una actividad tranquila para practicar."
          ),
          childName
        ),
        icon: safeText(item.icon, "💡"),
      }))
      .filter((item) => hasText(item.title) && hasText(item.message));
  } catch (error) {
    console.error("Error parseando recomendaciones IA:", error.message);
    return [];
  }
};

const generateParentRecommendations = async (dashboardData, options = {}) => {
  const sensoryProfile = options.sensoryProfile || null;
  const alerts = options.alerts || [];

  const childName = normalizeChildName(dashboardData.childName);

  const hasLatestConversation = Boolean(
    dashboardData.latestContactConversation?.title
  );

  const prompt = `
Eres Félix, asistente educativo de FloFlo para apoyar a padres y cuidadores de niños autistas.

Tu tarea es redactar 3 recomendaciones breves, útiles, humanas y tranquilas para el cuidador.

IMPORTANTE:
- Usa solo los datos entregados.
- No inventes diagnósticos.
- No digas "crisis", "síntoma", "tratamiento" ni "terapia".
- No uses lenguaje médico complejo.
- No hagas afirmaciones absolutas.
- Usa frases cuidadosas como: "podría ayudar", "puede ser útil", "observa si", "considera", "prueba".
- Si hay perfil sensorial, úsalo para personalizar las recomendaciones.
- Si hay alertas, úsalas como contexto, pero no las repitas literalmente.
- Las recomendaciones deben ser prácticas para un padre o cuidador.
- Si necesitas referirte al niño/niña, usa SOLO este nombre real: ${childName}.
- No uses nombres de personajes de conversaciones, ejemplos, rutinas o lugares.
- Si aparece un nombre dentro de una conversación de práctica, trátalo como personaje ficticio, no como nombre real del niño.
- Si tienes duda, usa "tu hijo/a" o "el niño/la niña".

DATOS GENERALES:
- Nombre real del niño/niña: ${childName}
- Emociones registradas: ${dashboardData.emotions}
- Rutinas: ${dashboardData.routines}
- Lugares: ${dashboardData.places}
- Contactos: ${dashboardData.contacts}
- Conversaciones: ${dashboardData.conversations}
- Logros: ${dashboardData.achievements}
- Última emoción: ${dashboardData.latestMood?.mood_name || "Sin datos"}
- Última rutina: ${dashboardData.latestRoutine?.name || "Sin datos"}
- Último lugar: ${dashboardData.latestPlace?.name || "Sin datos"}
- Tiene una conversación reciente registrada: ${
    hasLatestConversation ? "Sí" : "No"
  }

PERFIL SENSORIAL:
${buildSensoryContext(sensoryProfile)}

ALERTAS DETECTADAS POR REGLAS:
${buildAlertsContext(alerts)}

Devuelve SOLO JSON válido con este formato:
[
  {
    "title": "Título breve",
    "message": "Recomendación clara para el padre",
    "icon": "emoji"
  }
]
`;

  const response = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "Eres un asistente educativo seguro. No diagnostiques. No inventes información. No uses nombres de personajes de conversaciones. Redacta recomendaciones prácticas, breves, positivas y cuidadosas para padres.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.2,
  });

  const content = response.choices[0]?.message?.content;

  const recommendations = parseRecommendations(content, childName);

  if (recommendations.length === 0) {
    return [
      {
        title: "Revisar avances recientes",
        message:
          "Puede ser útil revisar la última emoción, rutina o conversación registrada y elegir una actividad tranquila para practicar esta semana.",
        icon: "💡",
      },
    ];
  }

  return recommendations;
};

module.exports = {
  generateParentRecommendations,
};
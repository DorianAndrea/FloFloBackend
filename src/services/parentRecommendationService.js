const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const generateParentRecommendations = async (dashboardData) => {
  const prompt = `
Eres Félix, asistente educativo de FloFlo para apoyar a padres de niños autistas.

Analiza estos datos y entrega 3 recomendaciones breves, útiles y tranquilas para los padres.

Datos:
- Emociones registradas: ${dashboardData.emotions}
- Rutinas: ${dashboardData.routines}
- Lugares: ${dashboardData.places}
- Contactos: ${dashboardData.contacts}
- Conversaciones: ${dashboardData.conversations}
- Logros: ${dashboardData.achievements}
- Última emoción: ${dashboardData.latestMood?.mood_name || "Sin datos"}
- Última rutina: ${dashboardData.latestRoutine?.name || "Sin datos"}
- Último lugar: ${dashboardData.latestPlace?.name || "Sin datos"}
- Última conversación: ${dashboardData.latestContactConversation?.title || "Sin datos"}

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
          "Eres un asistente educativo. No diagnostiques. No uses lenguaje clínico complejo. Entrega recomendaciones prácticas, breves y positivas para padres.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.4,
  });

  const content = response.choices[0].message.content;

  return JSON.parse(content);
};

module.exports = {
  generateParentRecommendations,
};
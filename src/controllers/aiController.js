const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const generatePlaceSteps = async (req, res) => {
  try {
    const { placeName, activity, people, transport, duration } = req.body;

    if (!placeName || !activity) {
      return res.status(400).json({
        message: "placeName y activity son obligatorios",
      });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres Félix, un asistente educativo para niños neurodivergentes. Generas historias sociales simples, claras, tranquilas y positivas. No uses lenguaje médico complejo. Devuelve solo JSON válido.",
        },
        {
          role: "user",
          content: `
Genera una historia social breve para preparar a un niño antes de visitar un lugar.

Datos:
- Lugar: ${placeName}
- Actividad: ${activity}
- Personas presentes: ${people || "personas conocidas"}
- Transporte: ${transport || "no especificado"}
- Duración aproximada: ${duration || "no especificada"}

Instrucciones:
- Crea exactamente 6 pasos.
- Cada paso debe tener máximo 14 palabras.
- Usa lenguaje simple, amable y concreto.
- No uses frases largas.
- No uses numeración dentro del texto.
- Devuelve únicamente este JSON:

{
  "steps": [
    "paso 1",
    "paso 2",
    "paso 3",
    "paso 4",
    "paso 5",
    "paso 6"
  ]
}
          `,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);

    res.json(parsed);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error al generar pasos con IA",
      error: error.message,
    });
  }
};

const generateConversation = async (req, res) => {
  try {
    const { topic, situation, person, emotion } = req.body;

    if (!topic || !situation) {
      return res.status(400).json({
        message: "topic y situation son obligatorios",
      });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres Félix, un asistente educativo para niños neurodivergentes. Generas conversaciones sociales simples, claras, seguras y positivas. Devuelve solo JSON válido.",
        },
        {
          role: "user",
          content: `
Genera una conversación social guiada para un niño.

Datos:
- Tema: ${topic}
- Situación: ${situation}
- Persona con quien hablará: ${person || "una persona conocida"}
- Emoción del niño: ${emotion || "nervioso"}

Instrucciones:
- Lenguaje simple, amable y concreto.
- La conversación debe tener exactamente 6 mensajes.
- Los hablantes deben alternar entre "Félix" y la otra persona.
- Incluye un ejercicio final con 3 opciones.
- Solo una opción debe ser correcta.
- Devuelve únicamente JSON válido con este formato:

{
  "title": "título breve",
  "messages": [
    {
      "speaker": "Félix",
      "text": "mensaje"
    }
  ],
  "exercise": {
    "question": "pregunta",
    "options": [
      {
        "text": "opción",
        "isCorrect": true
      },
      {
        "text": "opción",
        "isCorrect": false
      },
      {
        "text": "opción",
        "isCorrect": false
      }
    ]
  }
}
          `,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);

    res.json(parsed);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error al generar conversación con IA",
      error: error.message,
    });
  }
};

module.exports = {
  generatePlaceSteps,
  generateConversation,
};

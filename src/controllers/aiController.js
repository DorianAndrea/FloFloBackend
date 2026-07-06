const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const cleanText = (value, maxLength = 500) => {
  if (typeof value !== "string") return "";

  return value.trim().slice(0, maxLength);
};

const parseAIJson = (content) => {
  try {
    return JSON.parse(content);
  } catch (error) {
    const customError = new Error("La IA no devolvió un JSON válido");
    customError.statusCode = 502;
    throw customError;
  }
};

const generatePlaceSteps = async (req, res) => {
  try {
    const placeName = cleanText(req.body.placeName, 120);
    const activity = cleanText(req.body.activity, 250);
    const people = cleanText(req.body.people, 180);
    const transport = cleanText(req.body.transport, 120);
    const duration = cleanText(req.body.duration, 80);

    if (!placeName || !activity) {
      return res.status(400).json({
        message: "placeName y activity son obligatorios",
      });
    }

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
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

    const content = response.choices[0]?.message?.content;
    const parsed = parseAIJson(content);

    res.json(parsed);
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({
      message: error.statusCode
        ? error.message
        : "Error al generar pasos con IA",
    });
  }
};

const generateConversation = async (req, res) => {
  try {
    const topic = cleanText(req.body.topic, 120);
    const situation = cleanText(req.body.situation, 500);
    const person = cleanText(req.body.person, 120);
    const emotion = cleanText(req.body.emotion, 80);

    if (!topic || !situation) {
      return res.status(400).json({
        message: "topic y situation son obligatorios",
      });
    }

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
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

    const content = response.choices[0]?.message?.content;
    const parsed = parseAIJson(content);

    res.json(parsed);
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({
      message: error.statusCode
        ? error.message
        : "Error al generar conversación con IA",
    });
  }
};

const generateContactConversation = async (req, res) => {
  try {
    const contactName = cleanText(req.body.contactName, 120);
    const relationshipName = cleanText(req.body.relationshipName, 120);
    const situation = cleanText(req.body.situation, 500);

    if (!contactName || !situation) {
      return res.status(400).json({
        message: "contactName y situation son obligatorios",
      });
    }

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres Félix, un asistente educativo para niños neurodivergentes. Generas conversaciones sociales simples, tranquilas y positivas. Devuelve solo JSON válido.",
        },
        {
          role: "user",
          content: `
Genera una conversación social breve para practicar con una persona.

Datos:
- Persona: ${contactName}
- Relación: ${relationshipName || "persona conocida"}
- Escenario: ${situation}

Devuelve SOLO este JSON:
{
  "title": "",
  "situation": "",
  "what_to_say": "",
  "correct_answer": "",
  "wrong_answer_1": "",
  "wrong_answer_2": "",
  "reminder": ""
}

Reglas:
- Lenguaje simple.
- Tono amable.
- La respuesta correcta debe ser adecuada y positiva.
- Las respuestas incorrectas deben ser claramente incorrectas, pero no ofensivas ni agresivas.
- Todo debe ser breve.
`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
    });

    const content = response.choices[0]?.message?.content;
    const parsed = parseAIJson(content);

    res.json(parsed);
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({
      message: error.statusCode
        ? error.message
        : "Error al generar conversación de contacto con IA",
    });
  }
};

module.exports = {
  generatePlaceSteps,
  generateConversation,
  generateContactConversation,
};

require("dotenv").config();

require("./src/cognitive-engine/cognitiveKernel");

const {
  startCognitiveWorker,
  stopCognitiveWorker,
} = require("./src/cognitive-engine/services/cognitiveWorkerService");

const app = require("./src/app");

const PORT = process.env.PORT || 5001;

const server = app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en el puerto ${PORT}`);

  startCognitiveWorker();
});

const shutdown = (signal) => {
  console.log(`${signal} recibido. Cerrando servidor...`);

  stopCognitiveWorker();

  server.close(() => {
    console.log("Servidor HTTP cerrado.");
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
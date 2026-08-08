const pool = require("../../database/db");

const {
  processEventById,
} = require("./eventProcessorService");

const DEFAULT_INTERVAL_MS = 3000;
const DEFAULT_BATCH_SIZE = 10;

let workerTimer = null;
let isBatchRunning = false;

/**
 * Convierte una variable de entorno en entero positivo.
 */
const getPositiveInteger = (value, fallback) => {
  const numberValue = Number(value);

  return Number.isInteger(numberValue) && numberValue > 0
    ? numberValue
    : fallback;
};

/**
 * Busca los eventos pendientes más antiguos.
 *
 * El Worker solamente toma eventos "pending".
 * Los eventos "failed" se reprocesarán mediante una estrategia
 * controlada que agregaremos posteriormente.
 */
const getPendingEventIds = async (
  limit = DEFAULT_BATCH_SIZE,
) => {
  const cleanLimit = getPositiveInteger(
    limit,
    DEFAULT_BATCH_SIZE,
  );

  const result = await pool.query(
    `
    SELECT id
    FROM "FloFlo".cognitive_event
    WHERE processing_status = 'pending'
    ORDER BY occurred_at ASC, id ASC
    LIMIT $1
    `,
    [cleanLimit],
  );

  return result.rows.map((row) => Number(row.id));
};

/**
 * Procesa un lote de eventos pendientes.
 *
 * Los eventos se procesan uno por uno para evitar saturar
 * PostgreSQL y facilitar la identificación de errores.
 */
const processPendingEvents = async ({
  batchSize = DEFAULT_BATCH_SIZE,
} = {}) => {
  if (isBatchRunning) {
    return {
      skipped: true,
      reason: "Ya existe un lote cognitivo en procesamiento",
      found: 0,
      processed: 0,
      failed: 0,
      results: [],
    };
  }

  isBatchRunning = true;

  try {
    const eventIds = await getPendingEventIds(batchSize);

    const results = [];
    let processed = 0;
    let failed = 0;

    for (const eventId of eventIds) {
      try {
        const result = await processEventById(eventId);

        processed += 1;

        results.push({
          eventId,
          success: true,
          result,
        });
      } catch (error) {
        failed += 1;

        console.error(
          `[Cognitive Worker] Error procesando evento ${eventId}:`,
          error,
        );

        results.push({
          eventId,
          success: false,
          error: error.message,
          errorCode:
            error.code || "COGNITIVE_PROCESSING_ERROR",
        });
      }
    }

    return {
      skipped: false,
      found: eventIds.length,
      processed,
      failed,
      results,
    };
  } finally {
    isBatchRunning = false;
  }
};

/**
 * Ejecuta una iteración del Worker.
 */
const runWorkerCycle = async (batchSize) => {
  try {
    const result = await processPendingEvents({
      batchSize,
    });

    if (
      !result.skipped &&
      (result.processed > 0 || result.failed > 0)
    ) {
      console.log(
        `[Cognitive Worker] Encontrados: ${result.found}, procesados: ${result.processed}, fallidos: ${result.failed}`,
      );
    }

    return result;
  } catch (error) {
    console.error(
      "[Cognitive Worker] Falló la búsqueda de eventos pendientes:",
      error,
    );

    return {
      skipped: false,
      found: 0,
      processed: 0,
      failed: 0,
      workerError: error.message,
      results: [],
    };
  }
};

/**
 * Inicia el Worker Cognitivo.
 */
const startCognitiveWorker = ({
  intervalMs = process.env.COGNITIVE_WORKER_INTERVAL_MS,
  batchSize = process.env.COGNITIVE_WORKER_BATCH_SIZE,
} = {}) => {
  if (workerTimer) {
    console.log(
      "[Cognitive Worker] El Worker ya estaba iniciado",
    );

    return false;
  }

  const cleanIntervalMs = getPositiveInteger(
    intervalMs,
    DEFAULT_INTERVAL_MS,
  );

  const cleanBatchSize = getPositiveInteger(
    batchSize,
    DEFAULT_BATCH_SIZE,
  );

  console.log(
    `[Cognitive Worker] Iniciado. Intervalo: ${cleanIntervalMs} ms. Lote: ${cleanBatchSize}`,
  );

  /*
   * Primera ejecución inmediata.
   */
  void runWorkerCycle(cleanBatchSize);

  workerTimer = setInterval(() => {
    void runWorkerCycle(cleanBatchSize);
  }, cleanIntervalMs);

  /*
   * Evita que el temporizador mantenga vivo el proceso
   * cuando Node.js necesita cerrarse.
   */
  if (typeof workerTimer.unref === "function") {
    workerTimer.unref();
  }

  return true;
};

/**
 * Detiene el Worker Cognitivo.
 */
const stopCognitiveWorker = () => {
  if (!workerTimer) {
    return false;
  }

  clearInterval(workerTimer);
  workerTimer = null;

  console.log("[Cognitive Worker] Detenido");

  return true;
};

const isCognitiveWorkerRunning = () => {
  return Boolean(workerTimer);
};

module.exports = {
  getPendingEventIds,
  processPendingEvents,
  startCognitiveWorker,
  stopCognitiveWorker,
  isCognitiveWorkerRunning,
};
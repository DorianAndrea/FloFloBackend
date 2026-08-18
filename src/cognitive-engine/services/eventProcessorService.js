const pool = require("../../database/db");

const { updateMasteryForEvent } = require("./masteryEngineService");

const {
  COGNITIVE_EVENT_TYPES,
  isValidCognitiveEventType,
  isImplementedCognitiveEventType,
} = require("../constants/cognitiveEventTypes");

const { aggregateEventContexts } = require("./contextAggregationService");

const PROCESSOR_VERSION = "1.0.0";

const createProcessorError = (message, code = "PROCESSING_ERROR") => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const validatePositiveInteger = (value, label = "ID") => {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw createProcessorError(`${label} inválido`, "INVALID_ID");
  }

  return numberValue;
};

/*
 * Busca el motor encargado de procesar cada tipo de evento.
 *
 * El require del Evidence Engine se hace dentro del case para que el backend
 * pueda iniciar aunque ese archivo todavía no exista. No procesaremos eventos
 * hasta crearlo en el siguiente paso.
 */
const resolveEventHandler = (eventType) => {
  switch (eventType) {
    case COGNITIVE_EVENT_TYPES.ROUTINE_COMPLETED: {
      const {
        processRoutineCompletedEvidence,
      } = require("./evidenceEngineService");x

      return processRoutineCompletedEvidence;
    }

    case COGNITIVE_EVENT_TYPES.FLOCARD_COMPLETED:
    case COGNITIVE_EVENT_TYPES.ROUTINE_STEP_COMPLETED: {
      const {
        processFloCardCompletedEvidence,
      } = require("./evidenceEngineService");

      return processFloCardCompletedEvidence;
    }

    default:
      return null;
  }
};

/*
 * Obtiene y bloquea un evento durante la transacción.
 * FOR UPDATE evita que dos procesos trabajen simultáneamente
 * sobre el mismo evento.
 */
const lockEventById = async (client, eventId) => {
  const result = await client.query(
    `
    SELECT *
    FROM "FloFlo".cognitive_event
    WHERE id = $1
    LIMIT 1
    FOR UPDATE
    `,
    [eventId],
  );

  return result.rows[0] || null;
};

/*
 * Calcula el número del próximo intento.
 */
const getNextAttemptNumber = async (client, eventId) => {
  const result = await client.query(
    `
    SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next_attempt
    FROM "FloFlo".cognitive_event_processing
    WHERE event_id = $1
    `,
    [eventId],
  );

  return Number(result.rows[0].next_attempt);
};

/*
 * Registra el comienzo de un intento de procesamiento.
 */
const createProcessingAttempt = async (client, eventId, attemptNumber) => {
  const result = await client.query(
    `
    INSERT INTO "FloFlo".cognitive_event_processing (
      event_id,
      attempt_number,
      processor_version,
      status,
      started_at,
      processing_result,
      created_at
    )
    VALUES (
      $1,
      $2,
      $3,
      'processing',
      NOW(),
      '{}'::jsonb,
      NOW()
    )
    RETURNING *
    `,
    [eventId, attemptNumber, PROCESSOR_VERSION],
  );

  return result.rows[0];
};

/*
 * Marca el intento como procesado correctamente.
 */
const markAttemptAsProcessed = async (
  client,
  processingId,
  processingResult,
) => {
  await client.query(
    `
    UPDATE "FloFlo".cognitive_event_processing
    SET
      status = 'processed',
      finished_at = NOW(),
      processing_result = $1::jsonb
    WHERE id = $2
    `,
    [JSON.stringify(processingResult || {}), processingId],
  );
};

/*
 * Marca el evento principal como procesado.
 */
const markEventAsProcessed = async (client, eventId, attemptNumber) => {
  await client.query(
    `
    UPDATE "FloFlo".cognitive_event
    SET
      processing_status = 'processed',
      processing_attempts = $1,
      processed_at = NOW(),
      last_processing_error = NULL
    WHERE id = $2
    `,
    [attemptNumber, eventId],
  );
};

/*
 * Guarda un procesamiento ignorado.
 *
 * Se utiliza cuando el evento existe en el catálogo,
 * pero todavía no posee un motor implementado.
 */
const markEventAsIgnored = async (
  client,
  eventId,
  processingId,
  attemptNumber,
  reason,
) => {
  const result = {
    ignored: true,
    reason,
  };

  await client.query(
    `
    UPDATE "FloFlo".cognitive_event_processing
    SET
      status = 'ignored',
      finished_at = NOW(),
      processing_result = $1::jsonb
    WHERE id = $2
    `,
    [JSON.stringify(result), processingId],
  );

  await client.query(
    `
    UPDATE "FloFlo".cognitive_event
    SET
      processing_status = 'ignored',
      processing_attempts = $1,
      processed_at = NOW(),
      last_processing_error = NULL
    WHERE id = $2
    `,
    [attemptNumber, eventId],
  );

  return result;
};

/*
 * Procesa un evento específico.
 */
const processEventById = async (eventId) => {
  const cleanEventId = validatePositiveInteger(eventId, "Evento");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const event = await lockEventById(client, cleanEventId);

    if (!event) {
      throw createProcessorError(
        "Evento cognitivo no encontrado",
        "EVENT_NOT_FOUND",
      );
    }

    /*
     * Si ya fue procesado o ignorado, no se vuelve a ejecutar.
     */
    if (
      event.processing_status === "processed" ||
      event.processing_status === "ignored"
    ) {
      await client.query("COMMIT");

      return {
        processed: event.processing_status === "processed",
        ignored: event.processing_status === "ignored",
        alreadyHandled: true,
        eventId: event.id,
        eventType: event.event_type,
      };
    }

    if (!isValidCognitiveEventType(event.event_type)) {
      throw createProcessorError(
        `Tipo de evento no reconocido: ${event.event_type}`,
        "INVALID_EVENT_TYPE",
      );
    }

    const attemptNumber = await getNextAttemptNumber(client, event.id);

    const processingAttempt = await createProcessingAttempt(
      client,
      event.id,
      attemptNumber,
    );

    await client.query(
      `
      UPDATE "FloFlo".cognitive_event
      SET
        processing_status = 'processing',
        processing_attempts = $1,
        last_processing_error = NULL
      WHERE id = $2
      `,
      [attemptNumber, event.id],
    );

    /*
     * Evento aprobado en el catálogo, pero todavía no implementado.
     */
    if (!isImplementedCognitiveEventType(event.event_type)) {
      const ignoredResult = await markEventAsIgnored(
        client,
        event.id,
        processingAttempt.id,
        attemptNumber,
        "El tipo de evento todavía no posee un procesador implementado",
      );

      await client.query("COMMIT");

      return {
        ...ignoredResult,
        eventId: event.id,
        eventType: event.event_type,
        attemptNumber,
      };
    }

    const handler = resolveEventHandler(event.event_type);

    if (typeof handler !== "function") {
      throw createProcessorError(
        `No existe un procesador para ${event.event_type}`,
        "HANDLER_NOT_FOUND",
      );
    }

    /*
     * El Event Processor coordina.
     * El handler será quien genere la evidencia.
     */
    const evidenceResult = await handler({
      event,
      client,
      processorVersion: PROCESSOR_VERSION,
    });

    const contextAggregationResult = await aggregateEventContexts({
      eventId: event.id,
      client,
    });

    const masteryResult = await updateMasteryForEvent({
      eventId: event.id,
      childId: event.child_id,
      client,
    });

    const processingResult = {
      eventType: event.event_type,
      evidenceResult: evidenceResult || {},
      contextAggregationResult: contextAggregationResult || {},
      masteryResult: masteryResult || {},
    };

    await markAttemptAsProcessed(
      client,
      processingAttempt.id,
      processingResult,
    );

    await markEventAsProcessed(client, event.id, attemptNumber);

    await client.query("COMMIT");

    return {
      processed: true,
      ignored: false,
      alreadyHandled: false,
      eventId: event.id,
      eventType: event.event_type,
      attemptNumber,
      result: processingResult,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    /*
     * La transacción original se revirtió. Abrimos una nueva operación
     * para registrar que el procesamiento falló.
     */
    try {
      const failureResult = await pool.query(
        `
        UPDATE "FloFlo".cognitive_event
        SET
          processing_status = 'failed',
          processing_attempts = processing_attempts + 1,
          last_processing_error = $1
        WHERE id = $2
        RETURNING processing_attempts
        `,
        [error.message, cleanEventId],
      );

      if (failureResult.rows.length > 0) {
        const attemptNumber = failureResult.rows[0].processing_attempts;

        await pool.query(
          `
          INSERT INTO "FloFlo".cognitive_event_processing (
            event_id,
            attempt_number,
            processor_version,
            status,
            started_at,
            finished_at,
            error_code,
            error_message,
            processing_result,
            created_at
          )
          VALUES (
            $1,
            $2,
            $3,
            'failed',
            NOW(),
            NOW(),
            $4,
            $5,
            '{}'::jsonb,
            NOW()
          )
          ON CONFLICT (event_id, attempt_number)
          DO UPDATE SET
            status = 'failed',
            finished_at = NOW(),
            error_code = EXCLUDED.error_code,
            error_message = EXCLUDED.error_message
          `,
          [
            cleanEventId,
            attemptNumber,
            PROCESSOR_VERSION,
            error.code || "PROCESSING_ERROR",
            error.message,
          ],
        );
      }
    } catch (loggingError) {
      console.error(
        "No se pudo registrar el error del Event Processor:",
        loggingError,
      );
    }

    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  processEventById,
};

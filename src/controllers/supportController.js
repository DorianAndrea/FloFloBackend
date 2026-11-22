const {
  getSupportTypes,
  createSupportObservation,
  resolveSupportPersonFromProgress,
} = require("../services/supportService");

const handleError = (res, error, message) => {
  console.error(message, error);
  return res.status(error.statusCode || 500).json({
    message:
      error.statusCode && error.statusCode < 500
        ? error.message
        : message,
  });
};

const listSupportTypes = async (req, res) => {
  try {
    const supportTypes = await getSupportTypes();
    return res.status(200).json({ supportTypes });
  } catch (error) {
    return handleError(res, error, "Error obteniendo tipos de apoyo");
  }
};

const registerSupportObservation = async (req, res) => {
  try {
    const {
      sourceModule,
      sourceEntityType,
      sourceEntityId,
      supportCodes,
      notes,
    } = req.body || {};

    let personId;
    if (req.params.personId === "from-progress") {
      personId = await resolveSupportPersonFromProgress({
        sourceModule,
        sourceEntityType,
        sourceEntityId,
      });
    } else {
      personId = Number(req.params.personId);
      if (!Number.isSafeInteger(personId) || personId <= 0) {
        const error = new Error("Identificador de persona inválido");
        error.statusCode = 400;
        throw error;
      }
    }

    const observation = await createSupportObservation({
      authenticatedUser: req.user,
      personId,
      sourceModule,
      sourceEntityType,
      sourceEntityId,
      supportCodes,
      notes,
    });

    return res.status(201).json({
      message: "Observación de apoyo registrada correctamente",
      observation,
    });
  } catch (error) {
    return handleError(res, error, "Error registrando observación de apoyo");
  }
};

module.exports = { listSupportTypes, registerSupportObservation };
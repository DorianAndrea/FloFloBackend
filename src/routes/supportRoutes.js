
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  listSupportTypes,
  registerSupportObservation,
} = require("../controllers/supportController");

/*
 * Todas las rutas de apoyos requieren
 * autenticación JWT.
 */
router.use(authMiddleware);

/*
 * Catálogo oficial de tipos de apoyo.
 */
router.get(
  "/types",
  listSupportTypes
);

/*
 * Registrar una observación de apoyo
 * para una persona asociada.
 *
 * El servicio valida la relación activa,
 * el perfil autorizado y el contexto.
 */
router.post(
  "/people/:personId/observations",
  registerSupportObservation
);

module.exports = router;

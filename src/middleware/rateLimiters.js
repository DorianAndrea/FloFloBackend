const { rateLimit } = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message:
      "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
  },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message:
      "Demasiados registros desde esta conexión. Intenta nuevamente más tarde.",
  },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message:
      "Has solicitado demasiados correos de recuperación. Intenta nuevamente más tarde.",
  },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message:
      "Demasiados intentos de restablecer contraseña. Espera unos minutos e intenta nuevamente.",
  },
});

const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message:
      "Demasiados intentos de cambiar contraseña. Espera unos minutos antes de volver a intentarlo.",
  },
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message:
      "Has generado demasiadas sugerencias con IA. Espera unos minutos antes de volver a intentarlo.",
  },
});

module.exports = {
  authLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  changePasswordLimiter,
  aiLimiter,
};
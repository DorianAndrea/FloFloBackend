
const jwt = require("jsonwebtoken");
const pool = require("../database/db");

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Token no enviado",
      });
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        message: "Token inválido",
      });
    }

    // Verificar firma y expiración del JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const userId = Number(decoded?.id);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({
        message: "Token inválido",
      });
    }

    // Consultar el estado y rol vigente del usuario
    const result = await pool.query(
      `
      SELECT
        id,
        email,
        role,
        is_active
      FROM "FloFlo"."user"
      WHERE id = $1
      LIMIT 1
      `,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Usuario no encontrado o sesión inválida",
      });
    }

    const user = result.rows[0];

    // Bloquear cuentas desactivadas
    if (user.is_active !== true) {
      return res.status(403).json({
        message: "Esta cuenta se encuentra desactivada",
      });
    }

    // Rechazar cuentas sin un rol válido
    if (!user.role || typeof user.role !== "string") {
      return res.status(403).json({
        message: "Usuario sin perfil de acceso válido",
      });
    }

    // Utilizar identidad y rol vigentes de PostgreSQL
    req.user = {
      ...decoded,
      id: user.id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    // Errores de autenticación JWT
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError" ||
      error.name === "NotBeforeError"
    ) {
      return res.status(401).json({
        message: "Token inválido o expirado",
      });
    }

    console.error("Error en middleware de autenticación:", error);

    return res.status(500).json({
      message: "Error verificando autenticación",
    });
  }
};

module.exports = authMiddleware;

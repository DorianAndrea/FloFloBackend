const pool = require("../database/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendPasswordResetEmail } = require("../services/emailService");

const createToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    },
  );
};

const normalizeEmail = (email) => {
  return String(email || "")
    .trim()
    .toLowerCase();
};

const normalizeText = (value) => {
  return String(value || "").trim();
};

const isStrongPassword = (password) => {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(
    String(password || ""),
  );
};

const createResetToken = () => {
  const rawToken = crypto.randomBytes(32).toString("hex");

  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  return {
    rawToken,
    tokenHash,
  };
};

const hashResetToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const register = async (req, res) => {
  try {
    const { firstName, lastName, rut, birth_date, email, password, role } =
      req.body;

    const avatar = req.file ? req.file.path : null;

    const cleanFirstName = normalizeText(firstName);
    const cleanLastName = normalizeText(lastName);
    const cleanEmail = normalizeEmail(email);
    const cleanPassword = String(password || "");

    const roleValue = String(role || "").toLowerCase();

    const userRole =
      roleValue === "parent" ||
      roleValue.includes("padre") ||
      roleValue.includes("cuidador")
        ? "parent"
        : "child";

    if (!cleanFirstName || !cleanLastName || !cleanEmail || !cleanPassword) {
      return res.status(400).json({
        message: "Todos los campos obligatorios deben ser completados",
      });
    }

    if (!isStrongPassword(cleanPassword)) {
      return res.status(400).json({
        message:
          "La contraseña debe tener al menos 8 caracteres e incluir mayúscula, minúscula y número."
      });
    }

    const userExists = await pool.query(
      `
      SELECT id
      FROM "FloFlo"."user"
      WHERE LOWER(email) = LOWER($1)
      `,
      [cleanEmail],
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({
        message: "El correo ya está registrado",
      });
    }

    const hashedPassword = await bcrypt.hash(cleanPassword, 10);

    const result = await pool.query(
      `
      INSERT INTO "FloFlo"."user"
      (
        "firstName",
        "lastName",
        rut,
        birth_date,
        email,
        password,
        avatar,
        role,
        created_at
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        NOW()
      )
      RETURNING id, "firstName", "lastName", rut, birth_date, email, avatar, role
      `,
      [
        cleanFirstName,
        cleanLastName,
        rut || null,
        birth_date || null,
        cleanEmail,
        hashedPassword,
        avatar || null,
        userRole,
      ],
    );

    const user = result.rows[0];
    const token = createToken(user);

    res.status(201).json({
      token,
      user,
    });
  } catch (error) {
    console.error("Error registrando usuario:", error);

    res.status(500).json({
      message: "Error al registrar usuario",
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    const cleanEmail = normalizeEmail(email);
    const cleanPassword = String(password || "");

    if (!cleanEmail || !cleanPassword) {
      return res.status(400).json({
        message: "Email y contraseña son obligatorios",
      });
    }

    const result = await pool.query(
      `
      SELECT *
      FROM "FloFlo"."user"
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [cleanEmail],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Correo o contraseña incorrectos",
      });
    }

    const user = result.rows[0];

    if (!user.password || typeof user.password !== "string") {
      console.warn(
        `Intento de login con usuario sin contraseña configurada: ${user.email}`,
      );

      return res.status(401).json({
        message:
          "Este usuario no tiene contraseña configurada. Debes recuperar o restablecer la clave.",
      });
    }

    const validPassword = await bcrypt.compare(cleanPassword, user.password);

    if (!validPassword) {
      return res.status(401).json({
        message: "Correo o contraseña incorrectos",
      });
    }

    const token = createToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        rut: user.rut,
        birth_date: user.birth_date,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error iniciando sesión:", error);

    res.status(500).json({
      message: "Error al iniciar sesión",
    });
  }
};

const getMe = async (req, res) => {
  try {
    const user_id = req.user.id;

    const result = await pool.query(
      `
      SELECT
        id,
        "firstName",
        "lastName",
        rut,
        birth_date,
        email,
        avatar,
        role,
        created_at
      FROM "FloFlo"."user"
      WHERE id = $1
      `,
      [user_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Usuario no encontrado",
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error obteniendo perfil:", error);

    res.status(500).json({
      message: "Error obteniendo perfil",
    });
  }
};

const updateMe = async (req, res) => {
  try {
    const user_id = req.user.id;

    const { firstName, lastName, rut, birth_date, role } = req.body;

    const cleanFirstName = normalizeText(firstName);
    const cleanLastName = normalizeText(lastName);

    const userRole = role === "parent" ? "parent" : "child";

    if (!cleanFirstName || !cleanLastName) {
      return res.status(400).json({
        message: "Nombre y apellido son obligatorios",
      });
    }

    const currentUser = await pool.query(
      `
      SELECT avatar
      FROM "FloFlo"."user"
      WHERE id = $1
      `,
      [user_id],
    );

    const currentAvatar = currentUser.rows[0]?.avatar || null;
    const avatar = req.file ? req.file.path : currentAvatar;

    const result = await pool.query(
      `
      UPDATE "FloFlo"."user"
      SET
        "firstName" = $1,
        "lastName" = $2,
        rut = $3,
        birth_date = $4,
        avatar = $5,
        role = $6,
        updated_at = NOW()
      WHERE id = $7
      RETURNING
        id,
        "firstName",
        "lastName",
        rut,
        birth_date,
        email,
        avatar,
        role,
        created_at
      `,
      [
        cleanFirstName,
        cleanLastName,
        rut || null,
        birth_date || null,
        avatar,
        userRole,
        user_id,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Usuario no encontrado",
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error actualizando perfil:", error);

    res.status(500).json({
      message: "Error actualizando perfil",
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body || {};

    const cleanCurrentPassword = String(currentPassword || "");
    const cleanNewPassword = String(newPassword || "");

    if (!cleanCurrentPassword || !cleanNewPassword) {
      return res.status(400).json({
        message: "La contraseña actual y la nueva contraseña son obligatorias.",
      });
    }

    if (!isStrongPassword(cleanNewPassword)) {
      return res.status(400).json({
        message:
          "La nueva contraseña debe tener al menos 8 caracteres e incluir letras y números.",
      });
    }

    const userResult = await pool.query(
      `
      SELECT id, password
      FROM "FloFlo"."user"
      WHERE id = $1
      LIMIT 1
      `,
      [userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        message: "Usuario no encontrado.",
      });
    }

    const user = userResult.rows[0];

    if (!user.password || typeof user.password !== "string") {
      return res.status(400).json({
        message:
          "Este usuario no tiene contraseña configurada. Debes restablecerla.",
      });
    }

    const validPassword = await bcrypt.compare(
      cleanCurrentPassword,
      user.password,
    );

    if (!validPassword) {
      return res.status(401).json({
        message: "La contraseña actual no es correcta.",
      });
    }

    const samePassword = await bcrypt.compare(cleanNewPassword, user.password);

    if (samePassword) {
      return res.status(400).json({
        message: "La nueva contraseña debe ser distinta a la actual.",
      });
    }

    const hashedPassword = await bcrypt.hash(cleanNewPassword, 10);

    await pool.query(
      `
      UPDATE "FloFlo"."user"
      SET
        password = $1,
        updated_at = NOW()
      WHERE id = $2
      `,
      [hashedPassword, userId],
    );

    res.json({
      message: "Contraseña actualizada correctamente.",
    });
  } catch (error) {
    console.error("Error cambiando contraseña:", error);

    res.status(500).json({
      message: "Error cambiando contraseña.",
    });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {};
    const cleanEmail = normalizeEmail(email);

    if (!cleanEmail) {
      return res.status(400).json({
        message: "El correo es obligatorio",
      });
    }

    const userResult = await pool.query(
      `
      SELECT id, email, "firstName", "lastName"
      FROM "FloFlo"."user"
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [cleanEmail],
    );

    const genericResponse = {
      message:
        "Si el correo está registrado, se generará una solicitud para restablecer la contraseña.",
    };

    if (userResult.rows.length === 0) {
      return res.json(genericResponse);
    }

    const user = userResult.rows[0];

    const { rawToken, tokenHash } = createResetToken();

    await pool.query(
      `
      UPDATE "FloFlo".password_reset_token
      SET used_at = NOW()
      WHERE user_id = $1
      AND used_at IS NULL
      `,
      [user.id],
    );

    await pool.query(
      `
      INSERT INTO "FloFlo".password_reset_token
      (
        user_id,
        token_hash,
        expires_at,
        created_at
      )
      VALUES
      (
        $1,
        $2,
        NOW() + INTERVAL '30 minutes',
        NOW()
      )
      `,
      [user.id, tokenHash],
    );

    const resetUrl = `${
      process.env.FRONTEND_URL || "http://localhost:5173"
    }/reset-password?token=${rawToken}`;

    await sendPasswordResetEmail({
      to: user.email,
      firstName: user.firstName,
      resetUrl,
    });

    //console.log("PASSWORD RESET URL:", resetUrl);

    const response = {
      ...genericResponse,
    };

    if (
      process.env.NODE_ENV !== "production" ||
      process.env.ALLOW_RESET_TOKEN_RESPONSE === "true"
    ) {
      response.resetToken = rawToken;
      response.resetUrl = resetUrl;
    }

    res.json(response);
  } catch (error) {
    console.error("Error solicitando recuperación de clave:", error);

    res.status(500).json({
      message: "Error solicitando recuperación de clave",
    });
  }
};
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};

    const cleanToken = String(token || "").trim();
    const cleanPassword = String(newPassword || "");

    if (!cleanToken || !cleanPassword) {
      return res.status(400).json({
        message: "Token y nueva contraseña son obligatorios",
      });
    }

    if (!isStrongPassword(cleanPassword)) {
      return res.status(400).json({
        message:
          "La nueva contraseña debe tener al menos 8 caracteres e incluir letras y números.",
      });
    }

    const tokenHash = hashResetToken(cleanToken);

    const tokenResult = await pool.query(
      `
      SELECT
        prt.id,
        prt.user_id,
        prt.expires_at,
        prt.used_at,
        u.email
      FROM "FloFlo".password_reset_token prt
      JOIN "FloFlo"."user" u
        ON u.id = prt.user_id
      WHERE prt.token_hash = $1
      LIMIT 1
      `,
      [tokenHash],
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        message: "El enlace de recuperación no es válido",
      });
    }

    const resetToken = tokenResult.rows[0];

    if (resetToken.used_at) {
      return res.status(400).json({
        message: "Este enlace de recuperación ya fue utilizado",
      });
    }

    const isExpired = new Date(resetToken.expires_at).getTime() < Date.now();

    if (isExpired) {
      return res.status(400).json({
        message: "El enlace de recuperación expiró",
      });
    }

    const hashedPassword = await bcrypt.hash(cleanPassword, 10);

    await pool.query("BEGIN");

    await pool.query(
      `
      UPDATE "FloFlo"."user"
      SET
        password = $1,
        updated_at = NOW()
      WHERE id = $2
      `,
      [hashedPassword, resetToken.user_id],
    );

    await pool.query(
      `
      UPDATE "FloFlo".password_reset_token
      SET used_at = NOW()
      WHERE id = $1
      `,
      [resetToken.id],
    );

    await pool.query(
      `
      UPDATE "FloFlo".password_reset_token
      SET used_at = NOW()
      WHERE user_id = $1
      AND used_at IS NULL
      AND id <> $2
      `,
      [resetToken.user_id, resetToken.id],
    );

    await pool.query("COMMIT");

    res.json({
      message: "Contraseña actualizada correctamente",
    });
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {});

    console.error("Error restableciendo contraseña:", error);

    res.status(500).json({
      message: "Error restableciendo contraseña",
    });
  }
};

module.exports = {
  register,
  login,
  getMe,
  updateMe,
  forgotPassword,
  resetPassword,
  changePassword,
  
};

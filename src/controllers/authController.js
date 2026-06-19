const pool = require("../database/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

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

const register = async (req, res) => {
  try {
    const { firstName, lastName, rut, birth_date, email, password } = req.body;
    const avatar = req.file ? req.file.path : null;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        message: "Todos los campos obligatorios deben ser completados",
      });
    }

    const userExists = await pool.query(
      `
      SELECT id
      FROM "FloFlo"."user"
      WHERE email = $1
      `,
      [email],
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({
        message: "El correo ya está registrado",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

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
    NOW()
  )
  RETURNING id, "firstName", "lastName", rut, birth_date, email, avatar, role
  `,
      [
        firstName,
        lastName,
        rut || null,
        birth_date || null,
        email,
        hashedPassword,
        avatar || null,
      ],
    );

    const user = result.rows[0];

    const token = createToken(user);

    res.status(201).json({
      token,
      user,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        message: "Email y contraseña son obligatorios",
      });
    }

    const result = await pool.query(
      `
      SELECT *
      FROM "FloFlo"."user"
      WHERE email = $1
      `,
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Usuario no encontrado",
      });
    }

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(
      password,
      user.password,
    );

    if (!validPassword) {
      return res.status(401).json({
        message: "Contraseña incorrecta",
      });
    }

    const token = createToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: error.message,
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
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};
const updateMe = async (req, res) => {
  try {
    const user_id = req.user.id;

    const { firstName, lastName, rut, birth_date } = req.body;

    if (!firstName || !lastName) {
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
        updated_at = NOW()
      WHERE id = $6
      RETURNING id, "firstName", "lastName", rut, birth_date, email, avatar, created_at
      `,
      [firstName, lastName, rut || null, birth_date || null, avatar, user_id],
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  register,
  login,
  getMe,
  updateMe,
};

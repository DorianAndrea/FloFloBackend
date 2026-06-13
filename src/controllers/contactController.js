const pool = require("../database/db");

const getContacts = async (req, res) => {
  try {
    const user_id = req.user.id;

    const result = await pool.query(
      `
      SELECT
        uc.id,
        uc.user_id,
        uc.name,
        uc.relationship_type_id,
        uc.where_met,
        uc.image,
        uc.memory_note,
        uc.created_at,
        uc.updated_at,
        rt.relationship_name
      FROM "FloFlo".user_contact uc
      INNER JOIN "FloFlo".relationship_type rt
        ON uc.relationship_type_id = rt.id
      WHERE uc.user_id = $1
      ORDER BY uc.name
      `,
      [user_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};

const getContactById = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    const result = await pool.query(
      `
      SELECT
        uc.*,
        rt.relationship_name
      FROM "FloFlo".user_contact uc
      INNER JOIN "FloFlo".relationship_type rt
        ON uc.relationship_type_id = rt.id
      WHERE uc.id = $1
      AND uc.user_id = $2
      `,
      [id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Contacto no encontrado",
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

const createContact = async (req, res) => {
  try {
    const user_id = req.user.id;

    const {
      name,
      relationship_type_id,
      where_met,
      memory_note,
    } = req.body;

    const image = req.file ? req.file.path : null;

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".user_contact
      (
        user_id,
        name,
        relationship_type_id,
        where_met,
        image,
        memory_note,
        created_at,
        updated_at
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        NOW(),
        NOW()
      )
      RETURNING *
      `,
      [user_id, name, relationship_type_id, where_met, image, memory_note]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: error.message,
    });
  }
};

const updateContact = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    const {
      name,
      relationship_type_id,
      where_met,
      memory_note,
    } = req.body;

    const currentContact = await pool.query(
      `
      SELECT image
      FROM "FloFlo".user_contact
      WHERE id = $1
      AND user_id = $2
      `,
      [id, user_id]
    );

    if (currentContact.rows.length === 0) {
      return res.status(404).json({
        message: "Contacto no encontrado",
      });
    }

    const image = req.file ? req.file.path : currentImage;

    const result = await pool.query(
      `
      UPDATE "FloFlo".user_contact
      SET
        name = $1,
        relationship_type_id = $2,
        where_met = $3,
        image = $4,
        memory_note = $5,
        updated_at = NOW()
      WHERE id = $6
      AND user_id = $7
      RETURNING *
      `,
      [
        name,
        relationship_type_id,
        where_met,
        image,
        memory_note,
        id,
        user_id,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};

const deleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    const result = await pool.query(
      `
      DELETE FROM "FloFlo".user_contact
      WHERE id = $1
      AND user_id = $2
      RETURNING *
      `,
      [id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Contacto no encontrado",
      });
    }

    res.json({
      message: "Contacto eliminado correctamente",
      contact: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  getContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
};
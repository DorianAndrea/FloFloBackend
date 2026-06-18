const pool = require("../database/db");

const getContacts = async (req, res) => {
  try {
    const user_id = req.user.id;

    const search = req.query.search || "";
    const order = req.query.order || "recientes";

    let orderBy = "uc.id DESC";

    if (order === "antiguos") {
      orderBy = "uc.id ASC";
    }

    if (order === "az") {
      orderBy = "LOWER(uc.name) ASC";
    }

    if (order === "za") {
      orderBy = "LOWER(uc.name) DESC";
    }

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
      AND (
        $2 = ''
        OR translate(LOWER(uc.name), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $2 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
        OR translate(LOWER(rt.relationship_name), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $2 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
        OR translate(LOWER(uc.where_met), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $2 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
        OR translate(LOWER(COALESCE(uc.memory_note, '')), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $2 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
      )
      ORDER BY ${orderBy}
      `,
      [user_id, search],
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
      [id, user_id],
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

    const { name, relationship_type_id, where_met, memory_note } = req.body;

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
      [user_id, name, relationship_type_id, where_met, image, memory_note],
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

    const { name, relationship_type_id, where_met, memory_note } = req.body;

    const currentContact = await pool.query(
      `
      SELECT image
      FROM "FloFlo".user_contact
      WHERE id = $1
      AND user_id = $2
      `,
      [id, user_id],
    );

    if (currentContact.rows.length === 0) {
      return res.status(404).json({
        message: "Contacto no encontrado",
      });
    }

    const currentImage = currentContact.rows[0].image;
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
      [name, relationship_type_id, where_met, image, memory_note, id, user_id],
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
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const user_id = req.user.id;
    const { id } = req.params;

    const contactExists = await client.query(
      `
      SELECT id
      FROM "FloFlo".user_contact
      WHERE id = $1
      AND user_id = $2
      `,
      [id, user_id],
    );

    if (contactExists.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Persona no encontrada",
      });
    }

    const conversations = await client.query(
      `
      SELECT id
      FROM "FloFlo".user_contact_conversation
      WHERE user_contact_id = $1
      AND user_id = $2
      `,
      [id, user_id],
    );

    const conversationIds = conversations.rows.map((row) => row.id);

    if (conversationIds.length > 0) {
      await client.query(
        `
        DELETE FROM "FloFlo".contact_conversation_progress
        WHERE contact_conversation_id = ANY($1::int[])
        AND user_id = $2
        `,
        [conversationIds, user_id],
      );

      await client.query(
        `
        DELETE FROM "FloFlo".conversation_option
        WHERE exercise_id IN (
          SELECT id
          FROM "FloFlo".conversation_exercise
          WHERE conversation_id = ANY($1::int[])
        )
        `,
        [conversationIds],
      );

      await client.query(
        `
        DELETE FROM "FloFlo".conversation_exercise
        WHERE conversation_id = ANY($1::int[])
        `,
        [conversationIds],
      );

      await client.query(
        `
        DELETE FROM "FloFlo".conversation_message
        WHERE conversation_id = ANY($1::int[])
        `,
        [conversationIds],
      );

      await client.query(
        `
        DELETE FROM "FloFlo".user_contact_conversation
        WHERE id = ANY($1::int[])
        AND user_id = $2
        `,
        [conversationIds, user_id],
      );
    }

    const deleted = await client.query(
      `
      DELETE FROM "FloFlo".user_contact
      WHERE id = $1
      AND user_id = $2
      RETURNING *
      `,
      [id, user_id],
    );

    await client.query("COMMIT");

    res.json({
      message: "Persona eliminada correctamente",
      contact: deleted.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    res.status(500).json({
      message: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
};

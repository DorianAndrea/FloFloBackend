const pool = require("../database/db");

const {
  checkAndUnlockAchievements,
} = require("../services/achievementService");

const calculateLevel = (points) => {
  if (points >= 100) return 5;
  if (points >= 50) return 4;
  if (points >= 25) return 3;
  if (points >= 10) return 2;
  return 1;
};

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const validatePositiveInteger = (value, label) => {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw createHttpError(`${label} inválido`, 400);
  }

  return numberValue;
};

const assertParentCanAccessChild = async (parentId, childId, client = pool) => {
  const result = await client.query(
    `
    SELECT pc.child_id
    FROM "FloFlo".parent_child pc
    INNER JOIN "FloFlo"."user" u
      ON u.id = pc.child_id
    WHERE pc.parent_id = $1
    AND pc.child_id = $2
    AND u.role = 'child'
    LIMIT 1
    `,
    [parentId, childId],
  );

  if (result.rows.length === 0) {
    throw createHttpError("No tienes permiso para acceder a este niño/a", 403);
  }

  return true;
};

const resolvePlaceOwnerId = async (req, client = pool) => {
  const loggedUserId = validatePositiveInteger(req.user.id, "Usuario");
  const childIdParam = req.params.childId;

  if (!childIdParam) {
    return {
      ownerId: loggedUserId,
      loggedUserId,
      isParentManagingChild: false,
    };
  }

  const childId = validatePositiveInteger(childIdParam, "Niño/a");

  if (req.user.role !== "parent") {
    throw createHttpError("Solo un padre/cuidador puede usar esta ruta", 403);
  }

  await assertParentCanAccessChild(loggedUserId, childId, client);

  return {
    ownerId: childId,
    loggedUserId,
    isParentManagingChild: true,
  };
};

const getPlaces = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } = await resolvePlaceOwnerId(req);

    const search = req.query.search || "";
    const order = req.query.order || "recientes";

    let orderBy = "p.id DESC";

    if (order === "antiguos") {
      orderBy = "p.id ASC";
    }

    if (order === "az") {
      orderBy = "LOWER(p.name) ASC";
    }

    if (order === "za") {
      orderBy = "LOWER(p.name) DESC";
    }

    const result = await pool.query(
      `
      SELECT
        p.*
      FROM "FloFlo".place p
      WHERE p.user_id = $1
      AND (
        $2 = ''
        OR translate(LOWER(p.name), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $2 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
        OR translate(LOWER(COALESCE(p.description, '')), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $2 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
        OR translate(LOWER(COALESCE(p.activity, '')), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $2 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
        OR translate(LOWER(COALESCE(p.transport, '')), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $2 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
        OR translate(LOWER(COALESCE(p.people_present, '')), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
          LIKE translate(LOWER('%' || $2 || '%'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')
      )
      ORDER BY ${orderBy}
      `,
      [ownerId, search],
    );

    res.json(
      result.rows.map((place) => ({
        ...place,
        managed_by_parent: isParentManagingChild,
      })),
    );
  } catch (error) {
    console.error("Error obteniendo lugares:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const getPlaceById = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } = await resolvePlaceOwnerId(req);
    const id = validatePositiveInteger(req.params.id, "Lugar");

    const result = await pool.query(
      `
      SELECT *
      FROM "FloFlo".place
      WHERE id = $1
      AND user_id = $2
      LIMIT 1
      `,
      [id, ownerId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Lugar no encontrado",
      });
    }

    res.json({
      ...result.rows[0],
      managed_by_parent: isParentManagingChild,
    });
  } catch (error) {
    console.error("Error obteniendo lugar:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const createPlace = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } = await resolvePlaceOwnerId(req);

    const {
      name,
      address,
      description,
      activity,
      people_present,
      transport,
      estimated_duration,
      tips,
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: "El nombre del lugar es obligatorio",
      });
    }

    const image = req.file ? req.file.path : null;

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".place
      (
        user_id,
        name,
        address,
        image,
        description,
        activity,
        people_present,
        transport,
        estimated_duration,
        tips,
        created_at
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
      RETURNING *
      `,
      [
        ownerId,
        String(name).trim(),
        address || "",
        image,
        description || "",
        activity || "",
        people_present || "",
        transport || "",
        estimated_duration || "",
        tips || "",
      ],
    );

    res.status(201).json({
      ...result.rows[0],
      managed_by_parent: isParentManagingChild,
    });
  } catch (error) {
    console.error("Error creando lugar:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const updatePlace = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } = await resolvePlaceOwnerId(req);
    const id = validatePositiveInteger(req.params.id, "Lugar");

    const {
      name,
      address,
      description,
      activity,
      people_present,
      transport,
      estimated_duration,
      tips,
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        message: "El nombre del lugar es obligatorio",
      });
    }

    const currentPlace = await pool.query(
      `
      SELECT image
      FROM "FloFlo".place
      WHERE id = $1
      AND user_id = $2
      LIMIT 1
      `,
      [id, ownerId],
    );

    if (currentPlace.rows.length === 0) {
      return res.status(404).json({
        message: "Lugar no encontrado",
      });
    }

    const currentImage = currentPlace.rows[0].image;
    const image = req.file ? req.file.path : currentImage;

    const result = await pool.query(
      `
      UPDATE "FloFlo".place
      SET
        name = $1,
        address = $2,
        image = $3,
        description = $4,
        activity = $5,
        people_present = $6,
        transport = $7,
        estimated_duration = $8,
        tips = $9
      WHERE id = $10
      AND user_id = $11
      RETURNING *
      `,
      [
        String(name).trim(),
        address || "",
        image,
        description || "",
        activity || "",
        people_present || "",
        transport || "",
        estimated_duration || "",
        tips || "",
        id,
        ownerId,
      ],
    );

    res.json({
      ...result.rows[0],
      managed_by_parent: isParentManagingChild,
    });
  } catch (error) {
    console.error("Error actualizando lugar:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const deletePlace = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } = await resolvePlaceOwnerId(req);
    const id = validatePositiveInteger(req.params.id, "Lugar");

    const result = await pool.query(
      `
      DELETE FROM "FloFlo".place
      WHERE id = $1
      AND user_id = $2
      RETURNING *
      `,
      [id, ownerId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Lugar no encontrado",
      });
    }

    res.json({
      message: isParentManagingChild
        ? "Lugar del niño/a eliminado correctamente"
        : "Lugar eliminado correctamente",
      managedByParent: isParentManagingChild,
      place: result.rows[0],
    });
  } catch (error) {
    console.error("Error eliminando lugar:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const completePlace = async (req, res) => {
  const client = await pool.connect();

  try {
    const { ownerId, isParentManagingChild } = await resolvePlaceOwnerId(
      req,
      client,
    );

    const id = validatePositiveInteger(req.params.id, "Lugar");

    await client.query("BEGIN");

    const placeResult = await client.query(
      `
      SELECT id
      FROM "FloFlo".place
      WHERE id = $1
      AND user_id = $2
      LIMIT 1
      `,
      [id, ownerId],
    );

    if (placeResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Lugar no encontrado",
      });
    }

    const existing = await client.query(
      `
      SELECT *
      FROM "FloFlo".place_progress
      WHERE user_id = $1
      AND place_id = $2
      LIMIT 1
      `,
      [ownerId, id],
    );

    if (existing.rows.length > 0) {
      await client.query("COMMIT");

      return res.json({
        message: "Lugar ya estaba preparado",
        managedByParent: isParentManagingChild,
        progress: existing.rows[0],
        unlockedAchievements: [],
      });
    }

    const result = await client.query(
      `
      INSERT INTO "FloFlo".place_progress
      (
        user_id,
        place_id,
        completed,
        points,
        completed_at
      )
      VALUES ($1,$2,true,1,NOW())
      RETURNING *
      `,
      [ownerId, id],
    );

    const currentProgress = await client.query(
      `
      SELECT *
      FROM "FloFlo".user_progress
      WHERE user_id = $1
      LIMIT 1
      `,
      [ownerId],
    );

    let userProgress = null;

    if (currentProgress.rows.length > 0) {
      const newPoints = Number(currentProgress.rows[0].points || 0) + 1;

      const updatedProgress = await client.query(
        `
        UPDATE "FloFlo".user_progress
        SET
          points = $1,
          level = $2,
          completed_places = COALESCE(completed_places, 0) + 1,
          updated_at = NOW()
        WHERE user_id = $3
        RETURNING *
        `,
        [newPoints, calculateLevel(newPoints), ownerId],
      );

      userProgress = updatedProgress.rows[0] || null;
    } else {
      const createdProgress = await client.query(
        `
        INSERT INTO "FloFlo".user_progress
        (
          user_id,
          points,
          level,
          completed_conversations,
          completed_places,
          completed_routines,
          completed_moods,
          updated_at
        )
        VALUES ($1,$2,$3,0,1,0,0,NOW())
        RETURNING *
        `,
        [ownerId, 1, 1],
      );

      userProgress = createdProgress.rows[0] || null;
    }

    await client.query("COMMIT");

    const unlockedAchievements = await checkAndUnlockAchievements(ownerId);

    res.status(201).json({
      message: isParentManagingChild
        ? "Lugar del niño/a preparado"
        : "Lugar preparado",
      managedByParent: isParentManagingChild,
      progress: result.rows[0],
      userProgress,
      unlockedAchievements,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error completando lugar:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getPlaces,
  getPlaceById,
  createPlace,
  updatePlace,
  deletePlace,
  completePlace,
};
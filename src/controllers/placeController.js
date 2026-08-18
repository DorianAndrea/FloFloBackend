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

const getAdultChildAccess = async (
  adultId,
  childId,
  client = pool,
) => {
  const cleanAdultId = validatePositiveInteger(
    adultId,
    "Adulto",
  );

  const cleanChildId = validatePositiveInteger(
    childId,
    "Niño/a",
  );

  const result = await client.query(
    `
    SELECT
      pc.child_id,
      pc.relationship_key,
      pc.access_profile,
      pc.can_manage_team,
      pc.status

    FROM "FloFlo".parent_child pc

    INNER JOIN "FloFlo".child_profile child
      ON child.id = pc.child_id

    WHERE pc.parent_id = $1
      AND pc.child_id = $2
      AND pc.status = 'active'
      AND child.status = 'active'

    LIMIT 1
    `,
    [cleanAdultId, cleanChildId],
  );

  if (result.rows.length === 0) {
    throw createHttpError(
      "No tienes permiso para acceder a este niño/a",
      403,
    );
  }

  return result.rows[0];
};

const canCreateOrEditPlace = (accessProfile) => {
  return [
    "primary_caregiver",
    "caregiver",
    "therapist",
    "teacher",
    "professional",
  ].includes(accessProfile);
};

const canDeletePlace = (accessProfile) => {
  return ["primary_caregiver", "caregiver"].includes(accessProfile);
};

const resolvePlaceOwnerId = async (req, client = pool) => {
  const loggedUserId = validatePositiveInteger(req.user.id, "Usuario");

  const childIdParam = req.params.childId;

  if (!childIdParam) {
    if (req.user.role !== "child") {
      throw createHttpError(
        "Esta ruta es solo para cuentas de niño/a. Los adultos deben usar /children/:childId",
        403,
      );
    }

    return {
      ownerId: loggedUserId,
      actorId: loggedUserId,
      isAdultManagingChild: false,
      source: "child",
      accessProfile: "child",
      relationshipKey: "child",
      canManageTeam: false,
    };
  }

  const childId = validatePositiveInteger(childIdParam, "Niño/a");

  if (req.user.role !== "parent") {
    throw createHttpError(
      "Solo una cuenta adulta vinculada puede usar esta ruta",
      403,
    );
  }

  const access = await getAdultChildAccess(loggedUserId, childId, client);

  return {
    ownerId: childId,
    actorId: loggedUserId,
    isAdultManagingChild: true,
    source: "parent",
    accessProfile: access.access_profile,
    relationshipKey: access.relationship_key,
    canManageTeam: Boolean(access.can_manage_team),
  };
};

const getPlaces = async (req, res) => {
  try {
    const { ownerId, isAdultManagingChild } = await resolvePlaceOwnerId(req);

    const search = String(req.query.search || "").trim();
    const order = String(req.query.order || "recientes").trim();

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
        p.*,

        creator."firstName" AS creator_first_name,
        creator."lastName" AS creator_last_name,
        creator.avatar AS creator_avatar,

        updater."firstName" AS updater_first_name,
        updater."lastName" AS updater_last_name,
        updater.avatar AS updater_avatar

      FROM "FloFlo".place p

      LEFT JOIN "FloFlo"."user" creator
        ON creator.id = p.created_by

      LEFT JOIN "FloFlo"."user" updater
        ON updater.id = p.updated_by

      WHERE p.user_id = $1
        AND (
          $2 = ''

          OR translate(
            LOWER(p.name),
            'áéíóúÁÉÍÓÚñÑ',
            'aeiouaeiounn'
          ) LIKE translate(
            LOWER('%' || $2 || '%'),
            'áéíóúÁÉÍÓÚñÑ',
            'aeiouaeiounn'
          )

          OR translate(
            LOWER(COALESCE(p.description, '')),
            'áéíóúÁÉÍÓÚñÑ',
            'aeiouaeiounn'
          ) LIKE translate(
            LOWER('%' || $2 || '%'),
            'áéíóúÁÉÍÓÚñÑ',
            'aeiouaeiounn'
          )

          OR translate(
            LOWER(COALESCE(p.activity, '')),
            'áéíóúÁÉÍÓÚñÑ',
            'aeiouaeiounn'
          ) LIKE translate(
            LOWER('%' || $2 || '%'),
            'áéíóúÁÉÍÓÚñÑ',
            'aeiouaeiounn'
          )

          OR translate(
            LOWER(COALESCE(p.transport, '')),
            'áéíóúÁÉÍÓÚñÑ',
            'aeiouaeiounn'
          ) LIKE translate(
            LOWER('%' || $2 || '%'),
            'áéíóúÁÉÍÓÚñÑ',
            'aeiouaeiounn'
          )

          OR translate(
            LOWER(COALESCE(p.people_present, '')),
            'áéíóúÁÉÍÓÚñÑ',
            'aeiouaeiounn'
          ) LIKE translate(
            LOWER('%' || $2 || '%'),
            'áéíóúÁÉÍÓÚñÑ',
            'aeiouaeiounn'
          )
        )

      ORDER BY ${orderBy}
      `,
      [ownerId, search],
    );

    return res.json(
      result.rows.map((place) => ({
        ...place,
        managed_by_adult: isAdultManagingChild,
      })),
    );
  } catch (error) {
    console.error("Error obteniendo lugares:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo lugares",
    });
  }
};

const getPlaceById = async (req, res) => {
  try {
    const { ownerId, isAdultManagingChild } = await resolvePlaceOwnerId(req);

    const id = validatePositiveInteger(req.params.id, "Lugar");

    const result = await pool.query(
      `
      SELECT
        p.*,

        creator."firstName" AS creator_first_name,
        creator."lastName" AS creator_last_name,
        creator.avatar AS creator_avatar,

        updater."firstName" AS updater_first_name,
        updater."lastName" AS updater_last_name,
        updater.avatar AS updater_avatar

      FROM "FloFlo".place p

      LEFT JOIN "FloFlo"."user" creator
        ON creator.id = p.created_by

      LEFT JOIN "FloFlo"."user" updater
        ON updater.id = p.updated_by

      WHERE p.id = $1
        AND p.user_id = $2

      LIMIT 1
      `,
      [id, ownerId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Lugar no encontrado",
      });
    }

    return res.json({
      ...result.rows[0],
      managed_by_adult: isAdultManagingChild,
    });
  } catch (error) {
    console.error("Error obteniendo lugar:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo lugar",
    });
  }
};

const createPlace = async (req, res) => {
  try {
    const {
      ownerId,
      actorId,
      isAdultManagingChild,
      accessProfile,
      relationshipKey,
    } = await resolvePlaceOwnerId(req);

    if (isAdultManagingChild && !canCreateOrEditPlace(accessProfile)) {
      throw createHttpError(
        "Tu perfil puede consultar lugares, pero no crear nuevos",
        403,
      );
    }

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

    const cleanName = String(name || "").trim();

    if (!cleanName) {
      return res.status(400).json({
        message: "El nombre del lugar es obligatorio",
      });
    }

    const image = req.file ? req.file.path : null;

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".place (
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

        created_by,
        creator_access_profile,
        creator_relationship_key,

        updated_by,
        updater_access_profile,
        updater_relationship_key,

        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,

        $11, $12, $13,

        $11, $12, $13,

        NOW(),
        NOW()
      )
      RETURNING *
      `,
      [
        ownerId,
        cleanName,
        address || "",
        image,
        description || "",
        activity || "",
        people_present || "",
        transport || "",
        estimated_duration || "",
        tips || "",

        actorId,
        accessProfile,
        relationshipKey,
      ],
    );

    return res.status(201).json({
      message: isAdultManagingChild
        ? "Lugar creado correctamente para el niño/a"
        : "Lugar creado correctamente",

      managedByAdult: isAdultManagingChild,

      place: {
        ...result.rows[0],
        managed_by_adult: isAdultManagingChild,
      },
    });
  } catch (error) {
    console.error("Error creando lugar:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error creando lugar",
    });
  }
};

const updatePlace = async (req, res) => {
  try {
    const {
      ownerId,
      actorId,
      isAdultManagingChild,
      accessProfile,
      relationshipKey,
    } = await resolvePlaceOwnerId(req);

    if (isAdultManagingChild && !canCreateOrEditPlace(accessProfile)) {
      throw createHttpError(
        "Tu perfil puede consultar lugares, pero no modificarlos",
        403,
      );
    }

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

    const cleanName = String(name || "").trim();

    if (!cleanName) {
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
        tips = $9,

        updated_by = $10,
        updater_access_profile = $11,
        updater_relationship_key = $12,
        updated_at = NOW()

      WHERE id = $13
        AND user_id = $14

      RETURNING *
      `,
      [
        cleanName,
        address || "",
        image,
        description || "",
        activity || "",
        people_present || "",
        transport || "",
        estimated_duration || "",
        tips || "",

        actorId,
        accessProfile,
        relationshipKey,

        id,
        ownerId,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Lugar no encontrado",
      });
    }

    return res.json({
      message: isAdultManagingChild
        ? "Lugar del niño/a actualizado correctamente"
        : "Lugar actualizado correctamente",

      managedByAdult: isAdultManagingChild,

      place: {
        ...result.rows[0],
        managed_by_adult: isAdultManagingChild,
      },
    });
  } catch (error) {
    console.error("Error actualizando lugar:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error actualizando lugar",
    });
  }
};

const deletePlace = async (req, res) => {
  try {
    const { ownerId, isAdultManagingChild, accessProfile } =
      await resolvePlaceOwnerId(req);

    if (isAdultManagingChild && !canDeletePlace(accessProfile)) {
      throw createHttpError(
        "Solo una cuenta cuidadora puede eliminar lugares",
        403,
      );
    }

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

    return res.json({
      message: isAdultManagingChild
        ? "Lugar del niño/a eliminado correctamente"
        : "Lugar eliminado correctamente",

      managedByAdult: isAdultManagingChild,
      place: result.rows[0],
    });
  } catch (error) {
    console.error("Error eliminando lugar:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error eliminando lugar",
    });
  }
};

const completePlace = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;
  let committed = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const {
      ownerId,
      actorId,
      isAdultManagingChild,
      source,
      accessProfile,
      relationshipKey,
    } = await resolvePlaceOwnerId(req, client);

    const id = validatePositiveInteger(req.params.id, "Lugar");

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
      SELECT
        pp.*,

        completer."firstName" AS completer_first_name,
        completer."lastName" AS completer_last_name,
        completer.avatar AS completer_avatar

      FROM "FloFlo".place_progress pp

      LEFT JOIN "FloFlo"."user" completer
        ON completer.id = pp.completed_by

      WHERE pp.user_id = $1
        AND pp.place_id = $2

      LIMIT 1
      `,
      [ownerId, id],
    );

    if (existing.rows.length > 0) {
      await client.query("COMMIT");
      committed = true;

      return res.json({
        message: "Lugar ya estaba preparado",
        alreadyCompleted: true,
        managedByAdult: isAdultManagingChild,
        progress: existing.rows[0],
        unlockedAchievements: [],
      });
    }

    const result = await client.query(
      `
      INSERT INTO "FloFlo".place_progress (
        user_id,
        place_id,
        completed,
        points,
        completed_at,

        completed_by,
        completer_access_profile,
        completer_relationship_key,
        source
      )
      VALUES (
        $1,
        $2,
        true,
        1,
        NOW(),

        $3,
        $4,
        $5,
        $6
      )
      RETURNING *
      `,
      [ownerId, id, actorId, accessProfile, relationshipKey, source],
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
        INSERT INTO "FloFlo".user_progress (
          user_id,
          points,
          level,
          completed_conversations,
          completed_places,
          completed_routines,
          completed_moods,
          updated_at
        )
        VALUES (
          $1,
          1,
          1,
          0,
          1,
          0,
          0,
          NOW()
        )
        RETURNING *
        `,
        [ownerId],
      );

      userProgress = createdProgress.rows[0] || null;
    }

    await client.query("COMMIT");
    committed = true;

    const unlockedAchievements = await checkAndUnlockAchievements(ownerId);

    return res.status(201).json({
      message: isAdultManagingChild
        ? "Lugar del niño/a preparado correctamente"
        : "Lugar preparado correctamente",

      alreadyCompleted: false,
      managedByAdult: isAdultManagingChild,

      progress: {
        ...result.rows[0],
        managed_by_adult: isAdultManagingChild,
      },

      userProgress,
      unlockedAchievements,
    });
  } catch (error) {
    if (transactionStarted && !committed) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Error completando lugar:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error completando lugar",
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

const pool = require("../database/db");

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

const canCreateOrEditPlaceStep = (accessProfile) => {
  return [
    "primary_caregiver",
    "caregiver",
    "therapist",
    "teacher",
    "professional",
  ].includes(accessProfile);
};

const resolvePlaceOwnerId = async (req, client = pool) => {
  const loggedUserId = validatePositiveInteger(
    req.user.id,
    "Usuario",
  );

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
      accessProfile: "child",
      relationshipKey: "child",
    };
  }

  const childId = validatePositiveInteger(
    childIdParam,
    "Niño/a",
  );

  if (req.user.role !== "parent") {
    throw createHttpError(
      "Solo una cuenta adulta vinculada puede usar esta ruta",
      403,
    );
  }

  const access = await getAdultChildAccess(
    loggedUserId,
    childId,
    client,
  );

  return {
    ownerId: childId,
    actorId: loggedUserId,
    isAdultManagingChild: true,
    accessProfile: access.access_profile,
    relationshipKey: access.relationship_key,
  };
};

const validatePlaceOwnership = async (
  placeId,
  ownerId,
  client = pool,
) => {
  const result = await client.query(
    `
    SELECT id
    FROM "FloFlo".place
    WHERE id = $1
      AND user_id = $2
    LIMIT 1
    `,
    [placeId, ownerId],
  );

  return result.rows.length > 0;
};

const getPlaceSteps = async (req, res) => {
  try {
    const { ownerId, isAdultManagingChild } =
      await resolvePlaceOwnerId(req);

    const placeId = validatePositiveInteger(
      req.params.id,
      "Lugar",
    );

    const ownsPlace = await validatePlaceOwnership(
      placeId,
      ownerId,
    );

    if (!ownsPlace) {
      return res.status(404).json({
        message: "Lugar no encontrado para este usuario",
      });
    }

    const result = await pool.query(
      `
      SELECT
        ps.*,

        creator."firstName" AS creator_first_name,
        creator."lastName" AS creator_last_name,
        creator.avatar AS creator_avatar,

        updater."firstName" AS updater_first_name,
        updater."lastName" AS updater_last_name,
        updater.avatar AS updater_avatar

      FROM "FloFlo".place_step ps

      LEFT JOIN "FloFlo"."user" creator
        ON creator.id = ps.created_by

      LEFT JOIN "FloFlo"."user" updater
        ON updater.id = ps.updated_by

      WHERE ps.place_id = $1

      ORDER BY ps.step_order
      `,
      [placeId],
    );

    return res.json(
      result.rows.map((step) => ({
        ...step,
        managed_by_adult: isAdultManagingChild,
      })),
    );
  } catch (error) {
    console.error("Error obteniendo pasos del lugar:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo pasos del lugar",
    });
  }
};

const createPlaceStep = async (req, res) => {
  try {
    const {
      ownerId,
      actorId,
      isAdultManagingChild,
      accessProfile,
      relationshipKey,
    } = await resolvePlaceOwnerId(req);

    if (
      isAdultManagingChild &&
      !canCreateOrEditPlaceStep(accessProfile)
    ) {
      throw createHttpError(
        "Tu perfil puede consultar los pasos, pero no crear nuevos",
        403,
      );
    }

    const placeId = validatePositiveInteger(
      req.params.id,
      "Lugar",
    );

    const ownsPlace = await validatePlaceOwnership(
      placeId,
      ownerId,
    );

    if (!ownsPlace) {
      return res.status(404).json({
        message: "Lugar no encontrado para este usuario",
      });
    }

    const { step_order, title, description } = req.body;

    const stepOrder = Number(step_order);
    const cleanTitle = String(title || "").trim();

    if (!Number.isInteger(stepOrder) || stepOrder <= 0 || !cleanTitle) {
      return res.status(400).json({
        message:
          "step_order debe ser un número positivo y title es obligatorio",
      });
    }

    const image = req.file ? req.file.path : null;

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".place_step (
        place_id,
        step_order,
        title,
        description,
        image,

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
        $1,
        $2,
        $3,
        $4,
        $5,

        $6,
        $7,
        $8,

        $6,
        $7,
        $8,

        NOW(),
        NOW()
      )
      RETURNING *
      `,
      [
        placeId,
        stepOrder,
        cleanTitle,
        description || null,
        image,

        actorId,
        accessProfile,
        relationshipKey,
      ],
    );

    return res.status(201).json({
      message: isAdultManagingChild
        ? "Paso creado correctamente para el niño/a"
        : "Paso creado correctamente",

      managedByAdult: isAdultManagingChild,

      step: {
        ...result.rows[0],
        managed_by_adult: isAdultManagingChild,
      },
    });
  } catch (error) {
    console.error("Error creando paso del lugar:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error creando paso del lugar",
    });
  }
};

const replacePlaceSteps = async (req, res) => {
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
      accessProfile,
      relationshipKey,
    } = await resolvePlaceOwnerId(req, client);

    if (
      isAdultManagingChild &&
      !canCreateOrEditPlaceStep(accessProfile)
    ) {
      throw createHttpError(
        "Tu perfil puede consultar los pasos, pero no modificarlos",
        403,
      );
    }

    const placeId = validatePositiveInteger(
      req.params.id,
      "Lugar",
    );

    const { steps } = req.body;

    const ownsPlace = await validatePlaceOwnership(
      placeId,
      ownerId,
      client,
    );

    if (!ownsPlace) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Lugar no encontrado para este usuario",
      });
    }

    if (!Array.isArray(steps)) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "steps debe ser un arreglo",
      });
    }

    const validSteps = steps
      .map((step) => String(step || "").trim())
      .filter((step) => step.length > 0);

    if (validSteps.length === 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "Debe existir al menos un paso válido",
      });
    }

    await client.query(
      `
      DELETE FROM "FloFlo".place_step
      WHERE place_id = $1
      `,
      [placeId],
    );

    const insertedSteps = [];

    for (let i = 0; i < validSteps.length; i++) {
      const result = await client.query(
        `
        INSERT INTO "FloFlo".place_step (
          place_id,
          step_order,
          title,
          description,
          image,

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
          $1,
          $2,
          $3,
          $4,
          NULL,

          $5,
          $6,
          $7,

          $5,
          $6,
          $7,

          NOW(),
          NOW()
        )
        RETURNING *
        `,
        [
          placeId,
          i + 1,
          `Paso ${i + 1}`,
          validSteps[i],

          actorId,
          accessProfile,
          relationshipKey,
        ],
      );

      insertedSteps.push({
        ...result.rows[0],
        managed_by_adult: isAdultManagingChild,
      });
    }

    await client.query("COMMIT");
    committed = true;

    return res.json({
      message: isAdultManagingChild
        ? "Pasos del lugar del niño/a actualizados correctamente"
        : "Pasos del lugar actualizados correctamente",

      managedByAdult: isAdultManagingChild,
      steps: insertedSteps,
    });
  } catch (error) {
    if (transactionStarted && !committed) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Error reemplazando pasos del lugar:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error reemplazando pasos del lugar",
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getPlaceSteps,
  createPlaceStep,
  replacePlaceSteps,
};
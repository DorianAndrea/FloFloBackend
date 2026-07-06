const pool = require("../database/db");

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const isValidId = (id) => {
  const numberId = Number(id);
  return Number.isInteger(numberId) && numberId > 0;
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
    if (req.user.role !== "child") {
      throw createHttpError(
        "Esta ruta es solo para cuentas de niño/a. Los cuidadores deben usar /children/:childId",
        403,
      );
    }

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

const validatePlaceOwnership = async (placeId, ownerId, client = pool) => {
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
    const { ownerId, isParentManagingChild } = await resolvePlaceOwnerId(req);
    const placeId = validatePositiveInteger(req.params.id, "Lugar");

    const ownsPlace = await validatePlaceOwnership(placeId, ownerId);

    if (!ownsPlace) {
      return res.status(404).json({
        message: "Lugar no encontrado para este usuario",
      });
    }

    const result = await pool.query(
      `
      SELECT *
      FROM "FloFlo".place_step
      WHERE place_id = $1
      ORDER BY step_order
      `,
      [placeId],
    );

    res.json(
      result.rows.map((step) => ({
        ...step,
        managed_by_parent: isParentManagingChild,
      })),
    );
  } catch (error) {
    console.error("Error obteniendo pasos del lugar:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const createPlaceStep = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } = await resolvePlaceOwnerId(req);
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        message: "ID de lugar inválido",
      });
    }

    const placeId = Number(id);

    const ownsPlace = await validatePlaceOwnership(placeId, ownerId);

    if (!ownsPlace) {
      return res.status(404).json({
        message: "Lugar no encontrado para este usuario",
      });
    }

    const { step_order, title, description } = req.body;

    const stepOrder = Number(step_order);

    if (
      !Number.isInteger(stepOrder) ||
      stepOrder <= 0 ||
      !String(title || "").trim()
    ) {
      return res.status(400).json({
        message:
          "step_order debe ser un número positivo y title es obligatorio",
      });
    }

    const image = req.file ? req.file.path : null;

    const result = await pool.query(
      `
      INSERT INTO "FloFlo".place_step
      (
        place_id,
        step_order,
        title,
        description,
        image,
        created_at
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        NOW()
      )
      RETURNING *
      `,
      [placeId, stepOrder, String(title).trim(), description || null, image],
    );

    res.status(201).json({
      ...result.rows[0],
      managed_by_parent: isParentManagingChild,
    });
  } catch (error) {
    console.error("Error creando paso del lugar:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

const replacePlaceSteps = async (req, res) => {
  const client = await pool.connect();

  try {
    const { ownerId, isParentManagingChild } = await resolvePlaceOwnerId(
      req,
      client,
    );

    const { id } = req.params;
    const { steps } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({
        message: "ID de lugar inválido",
      });
    }

    const placeId = Number(id);

    const ownsPlace = await validatePlaceOwnership(placeId, ownerId, client);

    if (!ownsPlace) {
      return res.status(404).json({
        message: "Lugar no encontrado para este usuario",
      });
    }

    if (!Array.isArray(steps)) {
      return res.status(400).json({
        message: "steps debe ser un arreglo",
      });
    }

    const validSteps = steps
      .map((step) => String(step || "").trim())
      .filter((step) => step.length > 0);

    if (validSteps.length === 0) {
      return res.status(400).json({
        message: "Debe existir al menos un paso válido",
      });
    }

    await client.query("BEGIN");

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
        INSERT INTO "FloFlo".place_step
        (
          place_id,
          step_order,
          title,
          description,
          image,
          created_at
        )
        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          NULL,
          NOW()
        )
        RETURNING *
        `,
        [placeId, i + 1, `Paso ${i + 1}`, validSteps[i]],
      );

      insertedSteps.push({
        ...result.rows[0],
        managed_by_parent: isParentManagingChild,
      });
    }

    await client.query("COMMIT");

    res.json({
      message: isParentManagingChild
        ? "Pasos del lugar del niño/a actualizados correctamente"
        : "Pasos del lugar actualizados correctamente",
      managedByParent: isParentManagingChild,
      steps: insertedSteps,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error reemplazando pasos del lugar:", error);

    res.status(error.statusCode || 500).json({
      message: error.message,
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

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

const checkParentChildRelation = async (parentId, childId) => {
  const result = await pool.query(
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

  return result.rows.length > 0;
};

const resolveProgressOwnerId = async (req) => {
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
      isParentManagingChild: false,
    };
  }

  if (req.user.role !== "parent") {
    throw createHttpError("Solo un padre/cuidador puede usar esta ruta", 403);
  }

  const childId = validatePositiveInteger(childIdParam, "Niño/a");

  const hasRelation = await checkParentChildRelation(loggedUserId, childId);

  if (!hasRelation) {
    throw createHttpError(
      "No tienes permiso para ver el progreso de este niño/a",
      403,
    );
  }

  return {
    ownerId: childId,
    isParentManagingChild: true,
  };
};

const getUserProgress = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } = await resolveProgressOwnerId(req);

    const result = await pool.query(
      `
      SELECT *
      FROM "FloFlo".user_progress
      WHERE user_id = $1
      LIMIT 1
      `,
      [ownerId],
    );

    if (result.rows.length === 0) {
      return res.json({
        user_id: ownerId,
        points: 0,
        level: 1,
        completed_conversations: 0,
        completed_places: 0,
        completed_routines: 0,
        completed_moods: 0,
        managed_by_parent: isParentManagingChild,
      });
    }

    res.json({
      ...result.rows[0],
      managed_by_parent: isParentManagingChild,
    });
  } catch (error) {
    console.error("Error obteniendo progreso:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error obteniendo progreso",
    });
  }
};

module.exports = {
  getUserProgress,
};
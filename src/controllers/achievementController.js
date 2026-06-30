const pool = require("../database/db");
const achievementService = require("../services/achievementService");

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

const resolveAchievementOwnerId = async (req) => {
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
      "No tienes permiso para ver los logros de este niño/a",
      403,
    );
  }

  return {
    ownerId: childId,
    isParentManagingChild: true,
  };
};

const getAchievements = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } =
      await resolveAchievementOwnerId(req);

    const achievements = await achievementService.getAchievementsByUser(ownerId);

    res.json(
      achievements.map((achievement) => ({
        ...achievement,
        managed_by_parent: isParentManagingChild,
      })),
    );
  } catch (error) {
    console.error("Error al obtener logros:", error);

    res.status(error.statusCode || 500).json({
      message: error.message || "Error al obtener logros",
    });
  }
};

module.exports = {
  getAchievements,
};
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

// Los perfiles profesionales concretos se identifican por su vínculo activo,
// no por una lista cerrada de especialidades.
const checkAdultChildRelation = async (adultId, childId) => {
  const result = await pool.query(
    `
    SELECT pc.child_id
    FROM "FloFlo".parent_child pc
    INNER JOIN "FloFlo".child_profile cp ON cp.id = pc.child_id
    INNER JOIN "FloFlo"."user" u ON u.id = pc.parent_id
    WHERE pc.parent_id = $1
      AND pc.child_id = $2
      AND pc.status = 'active'
      AND cp.status = 'active'
      AND u.is_active = true
      AND u.role = 'parent'
      AND pc.access_profile IS NOT NULL
      AND pc.access_profile <> ''
      AND pc.relationship_key IS NOT NULL
      AND pc.relationship_key <> ''
    LIMIT 1
    `,
    [adultId, childId],
  );
  return result.rows.length > 0;
};

const resolveAchievementOwnerId = async (req) => {
  const loggedUserId = validatePositiveInteger(req.user.id, "Usuario");
  const childIdParam = req.params.childId;

  if (!childIdParam) {
    if (req.user.role !== "child") {
      throw createHttpError(
        "Esta ruta es solo para cuentas de niño/a. Los adultos deben usar /children/:childId",
        403,
      );
    }
    const result = await pool.query(
      `
      SELECT id FROM "FloFlo".child_profile
      WHERE legacy_user_id = $1 AND status = 'active'
      LIMIT 2
      `,
      [loggedUserId],
    );
    if (result.rows.length !== 1) {
      throw createHttpError(
        "No existe un perfil infantil activo asociado de forma única a esta cuenta",
        403,
      );
    }
    return { ownerId: result.rows[0].id, isParentManagingChild: false };
  }

  if (req.user.role !== "parent") {
    throw createHttpError("Solo una cuenta adulta autorizada puede usar esta ruta", 403);
  }
  const childId = validatePositiveInteger(childIdParam, "Niño/a");
  if (!(await checkAdultChildRelation(loggedUserId, childId))) {
    throw createHttpError("No tienes permiso para ver los logros de este niño/a", 403);
  }
  return { ownerId: childId, isParentManagingChild: true };
};

const getAchievements = async (req, res) => {
  try {
    const { ownerId, isParentManagingChild } = await resolveAchievementOwnerId(req);
    await achievementService.checkAndUnlockAchievements(ownerId);
    const achievements = await achievementService.getAchievementsByUser(ownerId);
    return res.json(
      achievements.map((achievement) => ({
        ...achievement,
        managed_by_parent: isParentManagingChild,
      })),
    );
  } catch (error) {
    console.error("Error al obtener logros:", error);
    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Error al obtener logros",
    });
  }
};

const getAchievementCount = async (req, res) => {
  try {
    const { ownerId } = await resolveAchievementOwnerId(req);
    const count = await achievementService.getAchievementCountByChild(ownerId);
    return res.status(200).json({ child_id: ownerId, achievements: count });
  } catch (error) {
    console.error("Error al obtener contador de logros:", error);
    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Error al obtener contador de logros",
    });
  }
};

module.exports = { getAchievements, getAchievementCount };
const {
  getAdaptiveExperienceRecommendations,
} = require("../cognitive-engine/services/adaptiveIntelligenceService");

const { getAdultChildAccess } = require(
  "../cognitive-engine/services/childAccessService",
);

const validatePositiveInteger = (value) => {
  const numberValue = Number(value);

  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
};

const getExperienceRecommendations = async (req, res) => {
  try {
    const actorUserId = validatePositiveInteger(req.user?.id);

    if (!actorUserId) {
      return res.status(401).json({
        message: "Usuario no válido",
      });
    }

    const childIdWasProvided =
      req.query.childId !== undefined &&
      req.query.childId !== null &&
      req.query.childId !== "";

    const requestedChildId = childIdWasProvided
      ? validatePositiveInteger(req.query.childId)
      : null;

    if (childIdWasProvided && !requestedChildId) {
      return res.status(400).json({
        message: "Niño/a inválido",
      });
    }

    let ownerUserId = actorUserId;

    if (requestedChildId) {
      if (req.user?.role !== "parent") {
        return res.status(403).json({
          message:
            "Solo una cuenta adulta puede solicitar recomendaciones de un niño/a",
        });
      }

      await getAdultChildAccess(actorUserId, requestedChildId);

      ownerUserId = requestedChildId;
    }

    const recommendations = await getAdaptiveExperienceRecommendations({
      ownerUserId,
      actorUserId,
      limit: 6,
    });

    const response = recommendations.map((item) => ({
      template_id: item.template_id,

      name: item.name,
      description: item.description,
      icon: item.icon,

      estimated_minutes: item.estimated_minutes,
      step_count: item.step_count,

      category_id: item.category_id,
      category_name: item.category_name,
      category_icon: item.category_icon,
      category_color: item.category_color,

      learning_context_id: item.learning_context_id,
      learning_context_name: item.learning_context_name,
      learning_context_icon: item.learning_context_icon,

      is_favorite: Boolean(item.is_favorite),

      // Se mantiene para uso interno/API.
      recommendation_priority: Number(item.recommendation_priority),

      reason: item.reason,

      explanations: Array.isArray(item.explanations) ? item.explanations : [],
    }));

    return res.json(response);
  } catch (error) {
    console.error("Error obteniendo recomendaciones de experiencias:", error);

    return res.status(error.statusCode || 500).json({
      message:
        error.message ||
        "No se pudieron obtener las recomendaciones de experiencias",
    });
  }
};

module.exports = {
  getExperienceRecommendations,
};

const cognitiveKernel = require("../cognitiveKernel");

const getExperience = (templateCode) => {
  return (
    cognitiveKernel.getExperience(templateCode) || null
  );
};

const getConceptsForExperience = (templateCode) => {
  const experience = getExperience(templateCode);

  if (!experience) {
    return [];
  }

  return experience.concepts || [];
};

const getPrimaryConcept = (templateCode) => {
  const concepts =
    getConceptsForExperience(templateCode);

  return (
    concepts.find(
      (concept) => concept.is_primary,
    ) || null
  );
};

const hasConcept = (
  templateCode,
  conceptCode,
) => {
  return getConceptsForExperience(
    templateCode,
  ).some(
    (concept) => concept.code === conceptCode,
  );
};

module.exports = {
  getExperience,
  getConceptsForExperience,
  getPrimaryConcept,
  hasConcept,
};
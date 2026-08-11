const fs = require("fs");
const path = require("path");

const floCardCatalogPath = path.join(
  __dirname,
  "..",
  "framework",
  "flocards",
  "floflo_flocard_catalog_v1.json",
);

let catalogCache = null;

const loadFloCardCatalog = () => {
  if (!catalogCache) {
    const rawCatalog = fs.readFileSync(
      floCardCatalogPath,
      "utf8",
    );

    catalogCache = JSON.parse(rawCatalog);
  }

  return catalogCache;
};

const getAllFloCards = () => {
  const catalog = loadFloCardCatalog();

  return Array.isArray(catalog.flocards)
    ? catalog.flocards
    : [];
};

const getFloCard = (floCardCode) => {
  if (!floCardCode) {
    return null;
  }

  return (
    getAllFloCards().find(
      (floCard) => floCard.code === floCardCode,
    ) || null
  );
};

const getFloCardsForConcept = (conceptCode) => {
  if (!conceptCode) {
    return [];
  }

  return getAllFloCards().filter(
    (floCard) =>
      Array.isArray(floCard.concepts) &&
      floCard.concepts.includes(conceptCode),
  );
};

const getFloCardsForExperience = (templateCode) => {
  if (!templateCode) {
    return [];
  }

  /*
   * Por ahora buscamos coincidencias mediante
   * experience_codes si existen en la FloCard.
   *
   * En el siguiente paso conectaremos formalmente
   * FloCards con pasos de experience_template.
   */
  return getAllFloCards().filter(
    (floCard) =>
      Array.isArray(floCard.experience_codes) &&
      floCard.experience_codes.includes(templateCode),
  );
};

const getFloCardsByInteractionType = (
  interactionType,
) => {
  if (!interactionType) {
    return [];
  }

  return getAllFloCards().filter(
    (floCard) =>
      floCard.interaction_type === interactionType,
  );
};

const getFloCardEventType = (
  floCardCode,
  eventKey,
) => {
  const floCard = getFloCard(floCardCode);

  if (!floCard?.event_mapping) {
    return null;
  }

  return floCard.event_mapping[eventKey] || null;
};

module.exports = {
  loadFloCardCatalog,
  getAllFloCards,
  getFloCard,
  getFloCardsForConcept,
  getFloCardsForExperience,
  getFloCardsByInteractionType,
  getFloCardEventType,
};
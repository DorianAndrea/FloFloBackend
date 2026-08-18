import api from "./api";
import { validateChildId } from "../utils/validateChildId";

export const getExperienceRecommendations = async (childId = null) => {
  const config = {};

  if (childId !== null && childId !== undefined && childId !== "") {
    const cleanChildId = validateChildId(childId);

    config.params = {
      childId: cleanChildId,
    };
  }

  const response = await api.get(
    "/experience-recommendations",
    config,
  );

  return response.data;
};
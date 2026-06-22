import api from "./api";

export const getContactConversations = async () => {
  const response = await api.get("/contact-conversations");
  return response.data;
};

export const createContactConversation = async (data) => {
  const response = await api.post("/contact-conversations", data);
  return response.data;
};
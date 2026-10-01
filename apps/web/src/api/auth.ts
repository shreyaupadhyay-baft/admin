import { apiGet, apiPost } from "./client.js";

export type CurrentAdmin = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
};

export const fetchCurrentAdmin = async (): Promise<CurrentAdmin> => {
  const res = await apiGet<{ admin: CurrentAdmin }>("/api/v1/auth/me");
  return res.data.admin;
};

export const login = async (email: string, password: string): Promise<CurrentAdmin> => {
  const res = await apiPost<{ admin: CurrentAdmin }>("/api/v1/auth/login", { email, password });
  return res.data.admin;
};

export const logout = async (): Promise<void> => {
  await apiPost("/api/v1/auth/logout");
};

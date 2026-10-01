import { apiGet, apiPatch, apiPost } from "./client.js";

export type UserStatus = "active" | "suspended" | "disabled";

export type AdminUser = {
  id: string;
  externalRef: string | null;
  email: string;
  phoneNumber: string | null;
  fullName: string;
  status?: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export type DeviceStatus = "active" | "inactive" | "blocked";

export type Device = {
  id: string;
  userId?: string;
  deviceRef: string;
  platform: "ios" | "android" | "web";
  status?: DeviceStatus;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type UserOverview = {
  profile: { fullName: string; email: string; phoneNumber: string | null };
  status?: UserStatus;
  devices: Device[];
  supportCases: { available: boolean; note: string };
  externalReference: { ref: string | null; note: string };
};

export const fetchUsers = async (params: {
  limit?: number;
  offset?: number;
  status?: UserStatus;
  search?: string;
}): Promise<{ users: AdminUser[]; limit: number; offset: number }> => {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);

  const res = await apiGet<{ users: AdminUser[] }>(`/api/v1/users?${query.toString()}`);
  return {
    users: res.data.users,
    limit: (res.meta.limit as number) ?? params.limit ?? 50,
    offset: (res.meta.offset as number) ?? params.offset ?? 0,
  };
};

export const fetchUser = async (id: string): Promise<AdminUser> => {
  const res = await apiGet<{ user: AdminUser }>(`/api/v1/users/${id}`);
  return res.data.user;
};

export const fetchUserOverview = async (id: string): Promise<UserOverview> => {
  const res = await apiGet<{ overview: UserOverview }>(`/api/v1/users/${id}/overview`);
  return res.data.overview;
};

export const createUser = async (payload: {
  email: string;
  fullName: string;
  phoneNumber?: string;
}): Promise<AdminUser> => {
  const res = await apiPost<{ user: AdminUser }>("/api/v1/users", payload);
  return res.data.user;
};

export const updateUser = async (
  id: string,
  payload: { email?: string; fullName?: string; phoneNumber?: string },
): Promise<AdminUser> => {
  const res = await apiPatch<{ user: AdminUser }>(`/api/v1/users/${id}`, payload);
  return res.data.user;
};

export const updateUserStatus = async (id: string, status: UserStatus, reason?: string): Promise<AdminUser> => {
  const res = await apiPatch<{ user: AdminUser }>(`/api/v1/users/${id}/status`, { status, reason });
  return res.data.user;
};

export const fetchUserDevices = async (id: string): Promise<Device[]> => {
  const res = await apiGet<{ devices: Device[] }>(`/api/v1/users/${id}/devices`);
  return res.data.devices;
};

export const updateDeviceStatus = async (id: string, status: DeviceStatus): Promise<Device> => {
  const res = await apiPatch<{ device: Device }>(`/api/v1/devices/${id}`, { status });
  return res.data.device;
};

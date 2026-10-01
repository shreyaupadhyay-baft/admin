import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "./client.js";

export type AdminSort = "created_at_desc" | "created_at_asc" | "full_name_asc" | "full_name_desc" | "email_asc" | "email_desc";

export type AdminRoleRef = { id: string; name: string; isActive: boolean };

export type AdminSummary = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  roles: AdminRoleRef[];
};

export type AdminDetail = AdminSummary & {
  lastLoginAt: string | null;
  activeSessionCount: number;
};

export type AdminSession = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  revokedAt: string | null;
  isActive: boolean;
};

export type RoleSummary = {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RoleDetail = RoleSummary & {
  permissions: Array<{ id: string; key: string; resource: string; action: string }>;
  assignedAdminCount: number;
};

export type PermissionRecord = { id: string; key: string; resource: string; action: string; description: string };

export type AdministrationAuditLog = {
  id: string;
  actorAdminId: string | null;
  actorEmail: string | null;
  actorFullName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  requestId: string | null;
  correlationId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export const fetchAdministrationAdmins = async (params: {
  limit?: number;
  offset?: number;
  search?: string;
  isActive?: boolean;
  roleId?: string;
  sort?: AdminSort;
}): Promise<{ admins: AdminSummary[]; limit: number; offset: number }> => {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.search) query.set("search", params.search);
  if (params.isActive !== undefined) query.set("isActive", String(params.isActive));
  if (params.roleId) query.set("roleId", params.roleId);
  if (params.sort) query.set("sort", params.sort);

  const res = await apiGet<{ admins: AdminSummary[] }>(`/api/v1/administration/admins?${query.toString()}`);
  return {
    admins: res.data.admins,
    limit: (res.meta.limit as number) ?? params.limit ?? 50,
    offset: (res.meta.offset as number) ?? params.offset ?? 0,
  };
};

export const fetchAdministrationAdmin = async (id: string): Promise<AdminDetail> => {
  const res = await apiGet<{ admin: AdminDetail }>(`/api/v1/administration/admins/${id}`);
  return res.data.admin;
};

export const createAdministrationAdmin = async (payload: {
  email: string;
  password: string;
  fullName: string;
  roleIds?: string[];
}): Promise<AdminSummary> => {
  const res = await apiPost<{ admin: AdminSummary }>("/api/v1/administration/admins", payload);
  return res.data.admin;
};

export const updateAdministrationAdmin = async (
  id: string,
  payload: Partial<{ email: string; fullName: string }>,
): Promise<AdminSummary> => {
  const res = await apiPatch<{ admin: AdminSummary }>(`/api/v1/administration/admins/${id}`, payload);
  return res.data.admin;
};

export const disableAdministrationAdmin = async (id: string): Promise<AdminSummary> => {
  const res = await apiPost<{ admin: AdminSummary }>(`/api/v1/administration/admins/${id}/disable`);
  return res.data.admin;
};

export const enableAdministrationAdmin = async (id: string): Promise<AdminSummary> => {
  const res = await apiPost<{ admin: AdminSummary }>(`/api/v1/administration/admins/${id}/enable`);
  return res.data.admin;
};

export const assignAdministrationRole = async (adminId: string, roleId: string): Promise<AdminSummary> => {
  const res = await apiPost<{ admin: AdminSummary }>(`/api/v1/administration/admins/${adminId}/roles`, { roleId });
  return res.data.admin;
};

export const removeAdministrationRole = async (adminId: string, roleId: string): Promise<void> => {
  await apiDelete(`/api/v1/administration/admins/${adminId}/roles/${roleId}`);
};

export const fetchAdminSessions = async (
  adminId: string,
  params: { limit?: number; offset?: number } = {},
): Promise<{ sessions: AdminSession[]; limit: number; offset: number }> => {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));

  const res = await apiGet<{ sessions: AdminSession[] }>(`/api/v1/administration/admins/${adminId}/sessions?${query.toString()}`);
  return {
    sessions: res.data.sessions,
    limit: (res.meta.limit as number) ?? params.limit ?? 50,
    offset: (res.meta.offset as number) ?? params.offset ?? 0,
  };
};

export const revokeAdminSessions = async (adminId: string): Promise<void> => {
  await apiPost(`/api/v1/administration/admins/${adminId}/revoke-sessions`);
};

export const fetchAdministrationRoles = async (params: {
  limit?: number;
  offset?: number;
  search?: string;
  isActive?: boolean;
}): Promise<{ roles: RoleSummary[]; limit: number; offset: number }> => {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.search) query.set("search", params.search);
  if (params.isActive !== undefined) query.set("isActive", String(params.isActive));

  const res = await apiGet<{ roles: RoleSummary[] }>(`/api/v1/administration/roles?${query.toString()}`);
  return {
    roles: res.data.roles,
    limit: (res.meta.limit as number) ?? params.limit ?? 50,
    offset: (res.meta.offset as number) ?? params.offset ?? 0,
  };
};

export const fetchAdministrationRole = async (id: string): Promise<RoleDetail> => {
  const res = await apiGet<{ role: RoleDetail }>(`/api/v1/administration/roles/${id}`);
  return res.data.role;
};

export const createAdministrationRole = async (payload: {
  name: string;
  description?: string;
  permissionIds?: string[];
}): Promise<RoleDetail> => {
  const res = await apiPost<{ role: RoleDetail }>("/api/v1/administration/roles", payload);
  return res.data.role;
};

export const updateAdministrationRole = async (
  id: string,
  payload: Partial<{ name: string; description: string }>,
): Promise<RoleDetail> => {
  const res = await apiPatch<{ role: RoleDetail }>(`/api/v1/administration/roles/${id}`, payload);
  return res.data.role;
};

export const enableAdministrationRole = async (id: string): Promise<RoleSummary> => {
  const res = await apiPost<{ role: RoleSummary }>(`/api/v1/administration/roles/${id}/enable`);
  return res.data.role;
};

export const disableAdministrationRole = async (id: string): Promise<RoleSummary> => {
  const res = await apiPost<{ role: RoleSummary }>(`/api/v1/administration/roles/${id}/disable`);
  return res.data.role;
};

export const updateRolePermissions = async (id: string, permissionIds: string[]): Promise<RoleDetail> => {
  const res = await apiPut<{ role: RoleDetail }>(`/api/v1/administration/roles/${id}/permissions`, { permissionIds });
  return res.data.role;
};

export const fetchAdministrationPermissions = async (params: {
  search?: string;
  resource?: string;
} = {}): Promise<{ permissions: PermissionRecord[]; groupedByResource: Record<string, PermissionRecord[]> }> => {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.resource) query.set("resource", params.resource);

  const res = await apiGet<{ permissions: PermissionRecord[]; groupedByResource: Record<string, PermissionRecord[]> }>(
    `/api/v1/administration/permissions?${query.toString()}`,
  );
  return res.data;
};

export const fetchAdministrationAudit = async (params: {
  limit?: number;
  offset?: number;
  actorAdminId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}): Promise<{ auditLogs: AdministrationAuditLog[]; limit: number; offset: number; total: number; hasNext: boolean }> => {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.actorAdminId) query.set("actorAdminId", params.actorAdminId);
  if (params.action) query.set("action", params.action);
  if (params.targetType) query.set("targetType", params.targetType);
  if (params.targetId) query.set("targetId", params.targetId);
  if (params.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params.dateTo) query.set("dateTo", params.dateTo);
  if (params.search) query.set("search", params.search);

  const res = await apiGet<{ auditLogs: AdministrationAuditLog[] }>(`/api/v1/administration/audit?${query.toString()}`);
  return {
    auditLogs: res.data.auditLogs,
    limit: (res.meta.limit as number) ?? params.limit ?? 50,
    offset: (res.meta.offset as number) ?? params.offset ?? 0,
    total: (res.meta.total as number) ?? 0,
    hasNext: Boolean(res.meta.hasNext),
  };
};

export const fetchAdministrationAuditDetail = async (id: string): Promise<AdministrationAuditLog> => {
  const res = await apiGet<{ auditLog: AdministrationAuditLog }>(`/api/v1/administration/audit/${id}`);
  return res.data.auditLog;
};

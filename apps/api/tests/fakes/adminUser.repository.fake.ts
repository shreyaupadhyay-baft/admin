import { randomUUID } from "node:crypto";
import { db, FakeUniqueViolation, type FakeAdminUser } from "./store.js";

export const findAdminUserByEmail = async (email: string): Promise<FakeAdminUser | null> =>
  db.adminUsers.find((u) => u.email === email.toLowerCase()) ?? null;

export const findAdminUserById = async (id: string): Promise<FakeAdminUser | null> =>
  db.adminUsers.find((u) => u.id === id) ?? null;

export const listAdminUsers = async (limit: number, offset: number): Promise<FakeAdminUser[]> =>
  [...db.adminUsers]
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(offset, offset + limit);

export const createAdminUser = async (params: {
  email: string;
  passwordHash: string;
  fullName: string;
}): Promise<FakeAdminUser> => {
  const email = params.email.toLowerCase();
  if (db.adminUsers.some((u) => u.email === email)) {
    throw new FakeUniqueViolation("duplicate email");
  }
  const row: FakeAdminUser = {
    id: randomUUID(),
    email,
    password_hash: params.passwordHash,
    full_name: params.fullName,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };
  db.adminUsers.push(row);
  return row;
};

export const updateAdminUser = async (
  id: string,
  fields: { fullName?: string; email?: string },
): Promise<FakeAdminUser | null> => {
  const row = db.adminUsers.find((u) => u.id === id);
  if (!row) return null;

  if (fields.email !== undefined) {
    const email = fields.email.toLowerCase();
    if (db.adminUsers.some((u) => u.email === email && u.id !== id)) {
      throw new FakeUniqueViolation("duplicate email");
    }
    row.email = email;
  }
  if (fields.fullName !== undefined) {
    row.full_name = fields.fullName;
  }
  row.updated_at = new Date();
  return row;
};

export const setAdminUserActive = async (id: string, isActive: boolean): Promise<FakeAdminUser | null> => {
  const row = db.adminUsers.find((u) => u.id === id);
  if (!row) return null;
  row.is_active = isActive;
  row.updated_at = new Date();
  return row;
};

export type AdminSort = "created_at_desc" | "created_at_asc" | "full_name_asc" | "full_name_desc" | "email_asc" | "email_desc";

const ADMIN_SORT_COMPARATORS: Record<AdminSort, (a: FakeAdminUser, b: FakeAdminUser) => number> = {
  created_at_desc: (a, b) => b.created_at.getTime() - a.created_at.getTime(),
  created_at_asc: (a, b) => a.created_at.getTime() - b.created_at.getTime(),
  full_name_asc: (a, b) => a.full_name.localeCompare(b.full_name),
  full_name_desc: (a, b) => b.full_name.localeCompare(a.full_name),
  email_asc: (a, b) => a.email.localeCompare(b.email),
  email_desc: (a, b) => b.email.localeCompare(a.email),
};

// Administration-only addition, mirroring adminUser.repository.ts.
export const listAdminUsersAdministration = async (params: {
  limit: number;
  offset: number;
  search?: string;
  isActive?: boolean;
  roleId?: string;
  sort: AdminSort;
}): Promise<FakeAdminUser[]> => {
  let results = [...db.adminUsers];

  if (params.roleId) {
    const memberIds = new Set(
      db.adminUserRoles.filter((ar) => ar.role_id === params.roleId).map((ar) => ar.admin_user_id),
    );
    results = results.filter((u) => memberIds.has(u.id));
  }
  if (params.search) {
    const needle = params.search.toLowerCase();
    results = results.filter(
      (u) => u.full_name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle),
    );
  }
  if (params.isActive !== undefined) {
    results = results.filter((u) => u.is_active === params.isActive);
  }

  return results.sort(ADMIN_SORT_COMPARATORS[params.sort]).slice(params.offset, params.offset + params.limit);
};

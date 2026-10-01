import { randomUUID } from "node:crypto";
import { db, FakeUniqueViolation } from "./store.js";
import type { FakeUser } from "./store.js";

// Every function returns a fresh copy, never a live reference into db.users —
// this mirrors a real `pg` query, which always hands back an independent row
// snapshot. Returning shared references here previously caused a value read
// from an earlier `find*` call to silently reflect a *later* `update*` call.
const clone = (row: FakeUser): FakeUser => ({ ...row });

export const listUsers = async (params: {
  limit: number;
  offset: number;
  status?: string;
  search?: string;
}): Promise<FakeUser[]> => {
  let results = db.users.map(clone);

  if (params.status) {
    results = results.filter((u) => u.status === params.status);
  }
  if (params.search) {
    const needle = params.search.toLowerCase();
    results = results.filter(
      (u) =>
        u.full_name.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle) ||
        (u.phone_number ?? "").includes(needle),
    );
  }

  return results
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(params.offset, params.offset + params.limit);
};

export const findUserById = async (id: string): Promise<FakeUser | null> => {
  const row = db.users.find((u) => u.id === id);
  return row ? clone(row) : null;
};

export const findUserByEmail = async (email: string): Promise<FakeUser | null> => {
  const row = db.users.find((u) => u.email === email.toLowerCase());
  return row ? clone(row) : null;
};

export const createUser = async (params: {
  email: string;
  phoneNumber?: string | null;
  fullName: string;
  externalRef?: string | null;
}): Promise<FakeUser> => {
  const email = params.email.toLowerCase();
  if (db.users.some((u) => u.email === email)) {
    throw new FakeUniqueViolation("duplicate email");
  }
  if (params.phoneNumber && db.users.some((u) => u.phone_number === params.phoneNumber)) {
    throw new FakeUniqueViolation("duplicate phone number");
  }

  const row: FakeUser = {
    id: randomUUID(),
    external_ref: params.externalRef ?? null,
    email,
    phone_number: params.phoneNumber ?? null,
    full_name: params.fullName,
    status: "active",
    security_status: "normal",
    created_at: new Date(),
    updated_at: new Date(),
  };
  db.users.push(row);
  return clone(row);
};

export const updateUserProfile = async (
  id: string,
  fields: { email?: string; phoneNumber?: string; fullName?: string },
): Promise<FakeUser | null> => {
  const row = db.users.find((u) => u.id === id);
  if (!row) return null;

  if (fields.email !== undefined) {
    const email = fields.email.toLowerCase();
    if (db.users.some((u) => u.email === email && u.id !== id)) {
      throw new FakeUniqueViolation("duplicate email");
    }
    row.email = email;
  }
  if (fields.phoneNumber !== undefined) {
    if (db.users.some((u) => u.phone_number === fields.phoneNumber && u.id !== id)) {
      throw new FakeUniqueViolation("duplicate phone number");
    }
    row.phone_number = fields.phoneNumber;
  }
  if (fields.fullName !== undefined) {
    row.full_name = fields.fullName;
  }
  row.updated_at = new Date();
  return clone(row);
};

export const updateUserStatus = async (id: string, status: string): Promise<FakeUser | null> => {
  const row = db.users.find((u) => u.id === id);
  if (!row) return null;
  row.status = status;
  row.updated_at = new Date();
  return clone(row);
};

export const updateUserSecurityStatus = async (id: string, securityStatus: string): Promise<FakeUser | null> => {
  const row = db.users.find((u) => u.id === id);
  if (!row) return null;
  row.security_status = securityStatus;
  row.updated_at = new Date();
  return clone(row);
};

export const countUsersBySecurityStatus = async (securityStatus: string): Promise<number> =>
  db.users.filter((u) => u.security_status === securityStatus).length;

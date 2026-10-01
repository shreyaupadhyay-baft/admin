import { randomUUID } from "node:crypto";
import { db, type FakeAuditLog } from "./store.js";

export const insertAuditLog = async (params: {
  actorAdminId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> => {
  const row: FakeAuditLog = {
    id: randomUUID(),
    actor_admin_id: params.actorAdminId,
    action: params.action,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
    request_id: params.requestId ?? null,
    correlation_id: params.correlationId ?? null,
    metadata: params.metadata ?? {},
    created_at: new Date(),
  };
  db.auditLogs.push(row);
};

export const listAuditLogs = async (limit: number, offset: number): Promise<FakeAuditLog[]> =>
  [...db.auditLogs]
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(offset, offset + limit);

// Administration-only addition, mirroring auditLog.repository.ts.
type FakeAuditLogWithActor = FakeAuditLog & { actor_email: string | null; actor_full_name: string | null };

const withActor = (log: FakeAuditLog): FakeAuditLogWithActor => {
  const actor = log.actor_admin_id ? db.adminUsers.find((a) => a.id === log.actor_admin_id) : undefined;
  return { ...log, actor_email: actor?.email ?? null, actor_full_name: actor?.full_name ?? null };
};

const containsCI = (haystack: string | null | undefined, needle: string): boolean =>
  !!haystack && haystack.toLowerCase().includes(needle.toLowerCase());

export const listAuditLogsFiltered = async (params: {
  limit: number;
  offset: number;
  actorAdminId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
}): Promise<{ rows: FakeAuditLogWithActor[]; total: number }> => {
  let results = db.auditLogs.map(withActor);

  if (params.actorAdminId) results = results.filter((l) => l.actor_admin_id === params.actorAdminId);
  if (params.action) results = results.filter((l) => l.action === params.action);
  if (params.targetType) results = results.filter((l) => l.target_type === params.targetType);
  if (params.targetId) results = results.filter((l) => l.target_id === params.targetId);
  if (params.dateFrom) results = results.filter((l) => l.created_at.getTime() >= params.dateFrom!.getTime());
  if (params.dateTo) results = results.filter((l) => l.created_at.getTime() <= params.dateTo!.getTime());
  if (params.search) {
    const term = params.search;
    results = results.filter(
      (l) =>
        containsCI(l.id, term) ||
        containsCI(l.action, term) ||
        containsCI(l.target_type, term) ||
        containsCI(l.target_id, term) ||
        containsCI(l.actor_email, term) ||
        containsCI(l.actor_full_name, term),
    );
  }

  results.sort((a, b) => b.created_at.getTime() - a.created_at.getTime() || b.id.localeCompare(a.id));
  const total = results.length;
  const rows = results.slice(params.offset, params.offset + params.limit);
  return { rows, total };
};

export const findAuditLogById = async (id: string): Promise<FakeAuditLogWithActor | null> => {
  const log = db.auditLogs.find((l) => l.id === id);
  return log ? withActor(log) : null;
};

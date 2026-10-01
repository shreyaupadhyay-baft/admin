import { randomUUID } from "node:crypto";
import { db } from "./store.js";
import type { FakeSecurityEvent } from "./store.js";

const clone = (row: FakeSecurityEvent): FakeSecurityEvent => ({ ...row });

export const listSecurityEvents = async (params: {
  limit: number;
  offset: number;
  eventType?: string;
  category?: string;
  severity?: string;
  status?: string;
  source?: string;
  userId?: string;
  deviceId?: string;
  detectedFrom?: Date;
  detectedTo?: Date;
  search?: string;
  sort: "newest" | "oldest";
}): Promise<FakeSecurityEvent[]> => {
  let results = db.securityEvents.map(clone);

  if (params.eventType) results = results.filter((e) => e.event_type === params.eventType);
  if (params.category) results = results.filter((e) => e.category === params.category);
  if (params.severity) results = results.filter((e) => e.severity === params.severity);
  if (params.status) results = results.filter((e) => e.status === params.status);
  if (params.source) results = results.filter((e) => e.source === params.source);
  if (params.userId) results = results.filter((e) => e.user_id === params.userId);
  if (params.deviceId) results = results.filter((e) => e.device_id === params.deviceId);
  if (params.detectedFrom) results = results.filter((e) => e.detected_at.getTime() >= params.detectedFrom!.getTime());
  if (params.detectedTo) results = results.filter((e) => e.detected_at.getTime() <= params.detectedTo!.getTime());
  if (params.search) {
    const needle = params.search.toLowerCase();
    results = results.filter(
      (e) => e.event_type.toLowerCase().includes(needle) || e.description.toLowerCase().includes(needle),
    );
  }

  results.sort((a, b) =>
    params.sort === "oldest" ? a.detected_at.getTime() - b.detected_at.getTime() : b.detected_at.getTime() - a.detected_at.getTime(),
  );

  return results.slice(params.offset, params.offset + params.limit);
};

export const findSecurityEventById = async (id: string): Promise<FakeSecurityEvent | null> => {
  const row = db.securityEvents.find((e) => e.id === id);
  return row ? clone(row) : null;
};

export const createSecurityEvent = async (params: {
  eventType: string;
  category: string;
  severity: string;
  source: string;
  userId?: string;
  deviceId?: string;
  externalReference?: string;
  description: string;
  metadata: Record<string, unknown>;
  detectedAt?: Date;
}): Promise<FakeSecurityEvent> => {
  const now = new Date();
  const row: FakeSecurityEvent = {
    id: randomUUID(),
    event_type: params.eventType,
    category: params.category,
    severity: params.severity,
    source: params.source,
    status: "new",
    user_id: params.userId ?? null,
    device_id: params.deviceId ?? null,
    external_reference: params.externalReference ?? null,
    description: params.description,
    metadata: params.metadata,
    detected_at: params.detectedAt ?? now,
    created_at: now,
  };
  db.securityEvents.push(row);
  return clone(row);
};

export const updateSecurityEventStatus = async (id: string, status: string): Promise<FakeSecurityEvent | null> => {
  const row = db.securityEvents.find((e) => e.id === id);
  if (!row) return null;
  row.status = status;
  return clone(row);
};

export const countSecurityEventsBySeverities = async (severities: string[], since: Date): Promise<number> =>
  db.securityEvents.filter((e) => severities.includes(e.severity) && e.detected_at.getTime() >= since.getTime()).length;

export const listRecentSecurityEvents = async (limit: number): Promise<FakeSecurityEvent[]> =>
  db.securityEvents
    .map(clone)
    .sort((a, b) => b.detected_at.getTime() - a.detected_at.getTime())
    .slice(0, limit);

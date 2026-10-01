import { randomUUID } from "node:crypto";
import { db } from "./store.js";
import type { FakeRiskSignal } from "./store.js";

const clone = (row: FakeRiskSignal): FakeRiskSignal => ({ ...row });

export const listRiskSignals = async (params: {
  limit: number;
  offset: number;
  category?: string;
  severity?: string;
  status?: string;
  source?: string;
  userId?: string;
  detectedFrom?: Date;
  detectedTo?: Date;
  sort: "newest" | "oldest";
}): Promise<FakeRiskSignal[]> => {
  let results = db.riskSignals.map(clone);

  if (params.category) results = results.filter((s) => s.category === params.category);
  if (params.severity) results = results.filter((s) => s.severity === params.severity);
  if (params.status) results = results.filter((s) => s.status === params.status);
  if (params.source) results = results.filter((s) => s.source === params.source);
  if (params.userId) results = results.filter((s) => s.user_id === params.userId);
  if (params.detectedFrom) results = results.filter((s) => s.detected_at.getTime() >= params.detectedFrom!.getTime());
  if (params.detectedTo) results = results.filter((s) => s.detected_at.getTime() <= params.detectedTo!.getTime());

  results.sort((a, b) =>
    params.sort === "oldest" ? a.detected_at.getTime() - b.detected_at.getTime() : b.detected_at.getTime() - a.detected_at.getTime(),
  );

  return results.slice(params.offset, params.offset + params.limit);
};

export const findRiskSignalById = async (id: string): Promise<FakeRiskSignal | null> => {
  const row = db.riskSignals.find((s) => s.id === id);
  return row ? clone(row) : null;
};

export const createRiskSignal = async (params: {
  signalType: string;
  category: string;
  severity: string;
  source: string;
  userId?: string;
  externalReference?: string;
  description: string;
  metadata: Record<string, unknown>;
  detectedAt?: Date;
}): Promise<FakeRiskSignal> => {
  const now = new Date();
  const row: FakeRiskSignal = {
    id: randomUUID(),
    signal_type: params.signalType,
    category: params.category,
    severity: params.severity,
    source: params.source,
    status: "new",
    user_id: params.userId ?? null,
    external_reference: params.externalReference ?? null,
    description: params.description,
    metadata: params.metadata,
    detected_at: params.detectedAt ?? now,
    created_at: now,
  };
  db.riskSignals.push(row);
  return clone(row);
};

export const updateRiskSignalStatus = async (id: string, status: string): Promise<FakeRiskSignal | null> => {
  const row = db.riskSignals.find((s) => s.id === id);
  if (!row) return null;
  row.status = status;
  return clone(row);
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export type ApiEnvelope<T> = {
  data: T;
  meta: Record<string, unknown>;
};

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    request_id: string;
  };
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

const request = async <T>(path: string, init: RequestInit): Promise<ApiEnvelope<T>> => {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...init,
  });

  const body = await res.json();

  if (!res.ok) {
    const errorBody = body as ApiErrorEnvelope;
    throw new ApiError(
      errorBody.error?.code ?? "UNKNOWN_ERROR",
      errorBody.error?.message ?? `Request failed with status ${res.status}`,
      res.status,
    );
  }

  return body as ApiEnvelope<T>;
};

export const apiGet = <T>(path: string): Promise<ApiEnvelope<T>> => request<T>(path, { method: "GET" });

export const apiPost = <T>(path: string, payload?: unknown): Promise<ApiEnvelope<T>> =>
  request<T>(path, {
    method: "POST",
    headers: payload !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });

export const apiPatch = <T>(path: string, payload: unknown): Promise<ApiEnvelope<T>> =>
  request<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const apiPut = <T>(path: string, payload: unknown): Promise<ApiEnvelope<T>> =>
  request<T>(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const apiDelete = <T>(path: string): Promise<ApiEnvelope<T>> => request<T>(path, { method: "DELETE" });

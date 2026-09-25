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

export const apiGet = async <T>(path: string): Promise<ApiEnvelope<T>> => {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    credentials: "include",
  });

  const body = await res.json();

  if (!res.ok) {
    const errorBody = body as ApiErrorEnvelope;
    throw new Error(errorBody.error?.message ?? `Request failed with status ${res.status}`);
  }

  return body as ApiEnvelope<T>;
};

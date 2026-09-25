import { useEffect, useState } from "react";
import { apiGet } from "../api/client.js";

type ReadinessData = {
  status: "ok" | "degraded";
  dependencies: Record<string, "up" | "down">;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; data: ReadinessData }
  | { kind: "error"; message: string };

export const SystemHealthPage = () => {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    apiGet<ReadinessData>("/api/v1/health/ready")
      .then((res) => {
        if (!cancelled) setState({ kind: "loaded", data: res.data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ kind: "error", message: err instanceof Error ? err.message : "Unknown error" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return <p>Checking system health…</p>;
  }

  if (state.kind === "error") {
    return <p role="alert">Could not reach the Admin API: {state.message}</p>;
  }

  return (
    <div>
      <h1>System Health</h1>
      <p>Overall status: {state.data.status}</p>
      <ul>
        {Object.entries(state.data.dependencies).map(([name, status]) => (
          <li key={name}>
            {name}: {status}
          </li>
        ))}
      </ul>
    </div>
  );
};

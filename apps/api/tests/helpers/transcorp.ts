import http from "node:http";
import type { AddressInfo } from "node:net";
import { loadTranscorpConfig, type TranscorpConfig } from "../../src/integrations/transcorp/config.js";

export const TEST_TOKEN = "test-bearer-token-SECRET-9f8e7d";

export interface RecordedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

export interface MockServer {
  url: string;
  requests: RecordedRequest[];
  setHandler(h: (req: RecordedRequest, res: http.ServerResponse, n: number) => void): void;
  close(): Promise<void>;
}

/** Real local HTTP server so timeout / network / redirect behaviour is exercised for real, not mocked. */
export const startMockServer = async (): Promise<MockServer> => {
  const requests: RecordedRequest[] = [];
  let handler: (req: RecordedRequest, res: http.ServerResponse, n: number) => void = (_r, res) => {
    res.writeHead(200, { "content-type": "application/json" }).end("{}");
  };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const recorded = { method: req.method ?? "", url: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString() };
      requests.push(recorded);
      handler(recorded, res, requests.length);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    setHandler: (h) => {
      handler = h;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
};

export const json = (res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify(body));
};

export const buildConfig = (
  baseUrl: string,
  overrides: Record<string, string | undefined> = {},
  nodeEnv: "development" | "test" | "production" = "test",
): TranscorpConfig => {
  const result = loadTranscorpConfig(
    {
      TRANSCORP_ENABLED: "true",
      TRANSCORP_AUTH_MODE: "bearer",
      TRANSCORP_BASE_URL: baseUrl,
      TRANSCORP_AUTH_TOKEN: TEST_TOKEN,
      TRANSCORP_TIMEOUT_MS: "300",
      TRANSCORP_TOTAL_TIMEOUT_MS: "5000",
      TRANSCORP_RETRY_BASE_DELAY_MS: "1",
      TRANSCORP_RETRY_MAX_DELAY_MS: "5",
      ...overrides,
    },
    nodeEnv,
  );
  if (result.status !== "ready") throw new Error(`test config invalid: ${JSON.stringify(result)}`);
  return result.config;
};

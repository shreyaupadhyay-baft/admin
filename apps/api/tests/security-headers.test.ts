import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/infrastructure/database/pool.js", () => ({
  checkDatabaseHealth: vi.fn().mockResolvedValue(true),
  pool: { query: vi.fn(), on: vi.fn() },
}));

vi.mock("../src/infrastructure/redis/client.js", () => ({
  checkRedisHealth: vi.fn().mockResolvedValue(true),
  redis: { on: vi.fn(), connect: vi.fn(), ping: vi.fn() },
}));

const { createApp } = await import("../src/app.js");

describe("security baseline", () => {
  const app = createApp();

  it("sets helmet security headers", async () => {
    const res = await request(app).get("/api/v1/health/live");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("rejects requests from an origin outside the allowlist", async () => {
    const res = await request(app)
      .get("/api/v1/health/live")
      .set("Origin", "https://not-allowed.example.com");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows requests from an allowlisted origin", async () => {
    const res = await request(app)
      .get("/api/v1/health/live")
      .set("Origin", "http://localhost:5173");

    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("never leaks a stack trace in the error envelope", async () => {
    const res = await request(app).get("/api/v1/does-not-exist");

    expect(JSON.stringify(res.body)).not.toMatch(/at\s+\S+\s+\(.*:\d+:\d+\)/);
  });
});

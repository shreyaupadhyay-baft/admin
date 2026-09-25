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

describe("health endpoints", () => {
  const app = createApp();

  it("GET /api/v1/health/live returns 200 without checking dependencies", async () => {
    const res = await request(app).get("/api/v1/health/live");

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
  });

  it("GET /api/v1/health/ready returns 200 when dependencies are healthy", async () => {
    const res = await request(app).get("/api/v1/health/ready");

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data.dependencies).toEqual({ database: "up", redis: "up" });
  });

  it("echoes back a request id and correlation id on every response", async () => {
    const res = await request(app).get("/api/v1/health/live");

    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.headers["x-correlation-id"]).toBeTruthy();
  });

  it("propagates an incoming correlation id instead of replacing it", async () => {
    const res = await request(app)
      .get("/api/v1/health/live")
      .set("x-correlation-id", "test-correlation-123");

    expect(res.headers["x-correlation-id"]).toBe("test-correlation-123");
  });

  it("returns the standard error envelope for unknown routes", async () => {
    const res = await request(app).get("/api/v1/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.request_id).toBeTruthy();
  });
});

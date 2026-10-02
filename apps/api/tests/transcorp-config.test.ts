import { describe, expect, it } from "vitest";
import { loadTranscorpConfig, summarizeSettings, isSafeRelativePath } from "../src/integrations/transcorp/config.js";
import { SecretValue } from "../src/integrations/transcorp/secret.js";

const valid = {
  TRANSCORP_ENABLED: "true",
  TRANSCORP_AUTH_MODE: "bearer",
  TRANSCORP_BASE_URL: "https://uat.transcorp.example/api",
  TRANSCORP_AUTH_TOKEN: "tok-abcdef",
};

const errorsOf = (src: Record<string, string>, nodeEnv: "development" | "test" | "production" = "test") => {
  const r = loadTranscorpConfig(src, nodeEnv);
  if (r.status !== "invalid") throw new Error(`expected invalid, got ${r.status}`);
  return r.errors;
};

describe("Transcorp config", () => {
  it("is disabled by default and when blank (existing .env files have blank TRANSCORP_* values)", () => {
    expect(loadTranscorpConfig({}, "development").status).toBe("disabled");
    expect(loadTranscorpConfig({ TRANSCORP_BASE_URL: "", TRANSCORP_AUTH_TOKEN: "" }, "production").status).toBe("disabled");
  });

  it("loads a valid UAT config with documented defaults", () => {
    const r = loadTranscorpConfig(valid, "test");
    if (r.status !== "ready") throw new Error("expected ready");
    expect(r.config.settings.environment).toBe("uat");
    expect(r.config.settings.hosts.main.baseUrl).toBe("https://uat.transcorp.example/api");
    expect(r.config.settings.timeoutMs).toBe(10_000);
    expect(r.config.settings.maxAttempts).toBe(3);
    expect(r.config.settings.hosts.kyc).toBeUndefined();
  });

  it("requires base URL and auth mode when enabled", () => {
    const e = errorsOf({ TRANSCORP_ENABLED: "true" });
    expect(e).toContain("TRANSCORP_AUTH_MODE is required when TRANSCORP_ENABLED=true");
    expect(e).toContain("TRANSCORP_BASE_URL is required when TRANSCORP_ENABLED=true");
  });

  it("requires credentials for the chosen auth mode, per host", () => {
    expect(errorsOf({ ...valid, TRANSCORP_AUTH_TOKEN: "" })).toContain("TRANSCORP_AUTH_TOKEN is required for TRANSCORP_AUTH_MODE=bearer");

    const kyc = errorsOf({ ...valid, TRANSCORP_KYC_BASE_URL: "https://kyc.transcorp.example" });
    expect(kyc).toContain("TRANSCORP_KYC_AUTH_TOKEN is required for TRANSCORP_AUTH_MODE=bearer");

    const partner = errorsOf({ ...valid, TRANSCORP_AUTH_MODE: "partner_headers" });
    expect(partner.join(" ")).toMatch(/PARTNER_ID is required/);
    expect(partner.join(" ")).toMatch(/PARTNER_ID_HEADER/);
  });

  it("does not guess header names", () => {
    expect(errorsOf({ ...valid, TRANSCORP_AUTH_MODE: "api_key_header" }).join(" ")).toMatch(/TRANSCORP_AUTH_HEADER_NAME is required/);
    expect(errorsOf({ ...valid, TRANSCORP_TENANT: "t1" }).join(" ")).toMatch(/TRANSCORP_TENANT_HEADER is required/);
    expect(errorsOf({ ...valid, TRANSCORP_WEBHOOK_TOKEN: "w" }).join(" ")).toMatch(/TRANSCORP_WEBHOOK_AUTH_HEADER is required/);
  });

  it("rejects invalid values", () => {
    expect(errorsOf({ ...valid, TRANSCORP_TIMEOUT_MS: "abc" }).join(" ")).toMatch(/TRANSCORP_TIMEOUT_MS/);
    expect(errorsOf({ ...valid, TRANSCORP_MAX_ATTEMPTS: "99" }).join(" ")).toMatch(/TRANSCORP_MAX_ATTEMPTS/);
    expect(errorsOf({ ...valid, TRANSCORP_AUTH_MODE: "magic" }).join(" ")).toMatch(/TRANSCORP_AUTH_MODE/);
    expect(errorsOf({ ...valid, TRANSCORP_TIMEOUT_MS: "9000", TRANSCORP_TOTAL_TIMEOUT_MS: "5000" })).toContain(
      "TRANSCORP_TIMEOUT_MS must not exceed TRANSCORP_TOTAL_TIMEOUT_MS",
    );
    expect(errorsOf({ ...valid, TRANSCORP_AUTH_HEADER_NAME: "bad header\r\nx: y" }).join(" ")).toMatch(/header name/);
  });

  describe("base URL validation (SSRF at the config boundary)", () => {
    it.each([
      ["not a url", "TRANSCORP_BASE_URL is not a valid URL"],
      ["http://uat.transcorp.example", "TRANSCORP_BASE_URL must use https"],
      ["ftp://uat.transcorp.example", "TRANSCORP_BASE_URL must use https"],
      ["https://user:pw@uat.transcorp.example", "TRANSCORP_BASE_URL must not embed credentials"],
      ["https://uat.transcorp.example/?x=1", "TRANSCORP_BASE_URL must not contain a query string or fragment"],
      ["https://169.254.169.254", "TRANSCORP_BASE_URL must not point at a private, link-local or internal address"],
      ["https://10.0.0.5", "TRANSCORP_BASE_URL must not point at a private, link-local or internal address"],
      ["https://192.168.1.1", "TRANSCORP_BASE_URL must not point at a private, link-local or internal address"],
      ["https://[::1]", "TRANSCORP_BASE_URL must not point at a loopback address in this environment"],
      ["https://localhost", "TRANSCORP_BASE_URL must not point at a loopback address in this environment"],
      ["https://svc.internal", "TRANSCORP_BASE_URL must not point at a private, link-local or internal address"],
    ])("rejects %s", (url, message) => {
      // Production-mode: loopback is never allowed; http is never allowed.
      const prod = errorsOf(
        { ...valid, TRANSCORP_BASE_URL: url, TRANSCORP_ENVIRONMENT: "production" },
        "production",
      );
      expect(prod).toContain(message);
    });

    it("allows plain http only to loopback and only outside production", () => {
      const dev = loadTranscorpConfig({ ...valid, TRANSCORP_BASE_URL: "http://127.0.0.1:9999" }, "development");
      expect(dev.status).toBe("ready");
      expect(errorsOf({ ...valid, TRANSCORP_BASE_URL: "http://127.0.0.1:9999" }, "production")).toContain(
        "TRANSCORP_BASE_URL must use https",
      );
      expect(errorsOf({ ...valid, TRANSCORP_BASE_URL: "http://uat.transcorp.example" }, "development")).toContain(
        "TRANSCORP_BASE_URL must use https",
      );
    });
  });

  describe("environment separation", () => {
    it("refuses the production provider from a non-production deployment", () => {
      expect(errorsOf({ ...valid, TRANSCORP_ENVIRONMENT: "production" }, "development")).toContain(
        "TRANSCORP_ENVIRONMENT=production requires NODE_ENV=production",
      );
    });

    it("allows UAT provider from a production-mode deployment (staging) and production provider in production", () => {
      expect(loadTranscorpConfig(valid, "production").status).toBe("ready");
      const prod = loadTranscorpConfig(
        { ...valid, TRANSCORP_BASE_URL: "https://api.transcorp.example", TRANSCORP_ENVIRONMENT: "production" },
        "production",
      );
      expect(prod.status).toBe("ready");
    });

    it("forbids auth mode none in production", () => {
      expect(errorsOf({ ...valid, TRANSCORP_AUTH_MODE: "none" }, "production")).toContain(
        "TRANSCORP_AUTH_MODE=none is not permitted in production",
      );
    });

    it("changes only env values between UAT and production — same code path", () => {
      const uat = loadTranscorpConfig(valid, "production");
      const prod = loadTranscorpConfig(
        { ...valid, TRANSCORP_ENVIRONMENT: "production", TRANSCORP_BASE_URL: "https://api.transcorp.example" },
        "production",
      );
      if (uat.status !== "ready" || prod.status !== "ready") throw new Error("expected ready");
      expect(uat.config.settings.environment).toBe("uat");
      expect(prod.config.settings.environment).toBe("production");
    });
  });

  describe("secret handling", () => {
    it("keeps secrets in SecretValue wrappers that do not serialise", () => {
      const r = loadTranscorpConfig(valid, "test");
      if (r.status !== "ready") throw new Error("expected ready");
      const token = r.config.secrets.main.authToken;
      expect(token).toBeInstanceOf(SecretValue);
      expect(token?.reveal()).toBe("tok-abcdef");
      expect(JSON.stringify(r.config)).not.toContain("tok-abcdef");
      expect(`${token}`).toBe("[REDACTED]");
    });

    it("never puts secret values in settings, summaries or validation errors", () => {
      const r = loadTranscorpConfig({ ...valid, TRANSCORP_AUTH_TOKEN: "tok-abcdef", TRANSCORP_TIMEOUT_MS: "nope" }, "test");
      expect(JSON.stringify(r)).not.toContain("tok-abcdef");
      const ok = loadTranscorpConfig(valid, "test");
      if (ok.status !== "ready") throw new Error("expected ready");
      expect(JSON.stringify(ok.config.settings)).not.toContain("tok-abcdef");
      expect(JSON.stringify(summarizeSettings(ok.config.settings))).not.toContain("tok-abcdef");
    });
  });

  it("validates the health probe path", () => {
    expect(errorsOf({ ...valid, TRANSCORP_HEALTH_PATH: "https://evil.example/x" }).join(" ")).toMatch(/TRANSCORP_HEALTH_PATH/);
    expect(errorsOf({ ...valid, TRANSCORP_HEALTH_PATH: "ping" }).join(" ")).toMatch(/TRANSCORP_HEALTH_PATH/);
    expect(errorsOf({ ...valid, TRANSCORP_HEALTH_PATH: "/ping", TRANSCORP_HEALTH_HOST: "kyc" }).join(" ")).toMatch(/requires TRANSCORP_KYC_BASE_URL/);
    const ok = loadTranscorpConfig({ ...valid, TRANSCORP_HEALTH_PATH: "/ping" }, "test");
    if (ok.status !== "ready") throw new Error("expected ready");
    expect(ok.config.settings.healthProbe).toEqual({ host: "main", path: "/ping" });
  });

  it("isSafeRelativePath rejects absolute, protocol-relative, traversal and query paths", () => {
    for (const bad of ["http://x", "//x/y", "/a/../b", "/a/%2e%2e/b", "/a?x=1", "/a#f", "a/b", "/a\\b", "/a//b", "/a b"]) {
      expect(isSafeRelativePath(bad), bad).toBe(false);
    }
    expect(isSafeRelativePath("/v1/items/abc%20def")).toBe(true);
  });
});

process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.CORS_ALLOWED_ORIGINS ??= "http://localhost:5173";
// The login rate limiter is a per-process singleton shared across every test
// in a file; the production default (10/15min) is far too tight for suites
// that log in as several different roles per test.
process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS ??= "1000";

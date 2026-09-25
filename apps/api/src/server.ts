import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logWithContext } from "./utils/logger.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logWithContext("info", "server_started", { port: env.PORT, nodeEnv: env.NODE_ENV });
});

const shutdown = (signal: string) => {
  logWithContext("info", "shutdown_signal_received", { signal });
  server.close(() => {
    logWithContext("info", "server_closed");
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

import app from "./app";
import { startWorkers } from "./video/worker";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
let stopWorkers: () => Promise<void> = async () => {};

const rawPort = process.env["PORT"] || process.env.API_PORT || "5001";

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  if (process.env.VIDEO_WORKER !== "false") stopWorkers = startWorkers();
});
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  server.close();
  const deadline = setTimeout(() => process.exit(0), 30_000);
  deadline.unref();
  await stopWorkers();
  await pool.end();
  clearTimeout(deadline);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

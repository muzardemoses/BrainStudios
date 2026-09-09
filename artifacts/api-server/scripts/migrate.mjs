import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(
  new URL("../../../lib/db/package.json", import.meta.url),
);
const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured");
  await client.connect();
  await client.query("BEGIN");
  await client.query(
    await readFile(
      new URL(
        "../../../lib/db/migrations/0001_video_workflow.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await client.query("COMMIT");
  console.log("Video workflow migration applied. Existing tables preserved.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(
    "Migration failed:",
    error.code || "connection or schema error",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}

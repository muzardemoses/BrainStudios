// Explicitly opt in: this check uses paid generation and creates a private test
// production. It never impersonates an application user or changes their work.
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { projectSchema } from "@workspace/video-workflow";
import { checkStorage, downloadFile } from "../src/video/storage";
import { google, publicError, config } from "../src/video/config";
import { enqueue, load, transaction, type Job } from "../src/video/repository";
import { execute } from "../src/video/worker";
import { mediaInfo } from "../src/video/media";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (!process.argv.includes("--generate"))
  throw new Error("Pass --generate to authorize the live integration check.");
const id = process.env.CHECK_PRODUCTION_ID || randomUUID();
let activeJob: Job | undefined;
try {
  await pool.query("SELECT 1");
  console.log("Postgres: connected");
  await checkStorage();
  console.log("R2: bucket accessible");
  const response = await google().models.generateContent({
    model: config.gemini,
    contents: "Reply with the word ready.",
    config: { maxOutputTokens: 32 },
  });
  if (!response.text) throw new Error("No model response");
  console.log("Vertex Gemini: ADC authenticated");
  if (!process.env.CHECK_PRODUCTION_ID) {
    const p = projectSchema.parse({
      id,
      title: "Live integration check",
      prompt:
        "An eight-second cinematic nature film: dawn sunlight filtering through a quiet forest canopy. One calm shot, natural green and gold palette, a brief reflective narration.",
      duration: 8,
      format: "16:9",
      style: "Cinematic",
      mode: "live",
      stage: 1,
      scenes: [],
      messages: [],
      thumbnail: 0,
      headline: "",
      description: "",
      tags: "",
    });
    await pool.query(
      "INSERT INTO video_productions(id,user_id,request_id,document) VALUES($1,$2,$3,$4)",
      [id, `integration-check-${id}`, randomUUID(), JSON.stringify(p)],
    );
  }
  console.log(`Check production: ${id}`);
  for (const kind of [
    "script",
    "plan",
    "scene",
    "assembly",
    "thumbnail",
    "publishing",
    "message",
  ]) {
    let p = await load(id);
    const succeeded = await pool.query(
      "SELECT 1 FROM video_jobs WHERE production_id=$1 AND kind=$2 AND status='succeeded'",
      [id, kind],
    );
    if (succeeded.rowCount) {
      console.log(`${kind}: already verified`);
      continue;
    }
    const existing = await pool.query(
      "SELECT 1 FROM video_jobs WHERE production_id=$1 AND kind=$2 AND status IN ('queued','waiting','failed')",
      [id, kind],
    );
    if (!existing.rowCount)
      await transaction((c) =>
        enqueue(
          c,
          p,
          kind,
          kind === "scene" ? p.scenes[0].id : undefined,
          kind === "message"
            ? {
                note: "In one short reply, explain what is ready and what I should review next. Do not change any scenes.",
              }
            : {},
        ),
      );
    for (;;) {
      const r = await pool.query<Job>(
        "UPDATE video_jobs SET status='running',locked_by=$3,locked_at=now(),attempts=attempts+1 WHERE id=(SELECT id FROM video_jobs WHERE production_id=$1 AND kind=$2 AND status IN ('queued','waiting','failed') ORDER BY created_at DESC LIMIT 1) RETURNING *",
        [id, kind, randomUUID()],
      );
      activeJob = r.rows[0];
      if (!activeJob) throw new Error("No eligible check job");
      const heartbeat = setInterval(() => {
        void pool.query(
          "UPDATE video_jobs SET locked_at=now() WHERE id=$1 AND locked_by=$2",
          [activeJob!.id, activeJob!.locked_by],
        ).catch(()=>{});
      }, 15000);
      try {
        await execute(activeJob);
      } finally {
        clearInterval(heartbeat);
      }
      const status = (
        await pool.query("SELECT status FROM video_jobs WHERE id=$1", [
          activeJob.id,
        ])
      ).rows[0].status;
      if (status === "succeeded") break;
      if (status !== "waiting") throw new Error(`Unexpected status ${status}`);
      console.log(`${kind}: provider operation saved, waiting 30 seconds`);
      await new Promise((r) => setTimeout(r, 30000));
    }
    console.log(`${kind}: succeeded`);
  }
  const p = await load(id),
    dir = await mkdtemp(join(tmpdir(), "brainstudios-check-"));
  try {
    const file = join(dir, "final.mp4");
    await downloadFile(p.finalKey!, file);
    const info = await mediaInfo(file);
    console.log(
      JSON.stringify({
        duration: Number(info.format.duration),
        streams: info.streams.map((s) => s.codec_type),
        clips: p.scenes.length,
        thumbnails: p.thumbnails.length,
        publishingReady: Boolean(p.title && p.description && p.tags),
      }),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
} catch (error) {
  if (activeJob)
    await pool
      .query(
        "UPDATE video_jobs SET status='failed',locked_by=NULL,error=$2 WHERE id=$1",
        [activeJob.id, publicError(error).message],
      )
      .catch(() => {});
  const e = error as { status?: number; code?: string; message?: string };
  console.error("Live check failed:", {
    status: e.status,
    code: e.code,
    message: publicError(error).message,
  });
  try {
    const data = JSON.parse(e.message || "{}");
    const detail = data.error || data;
    console.error("Provider diagnostic:", {
      status: detail.status,
      reasons: detail.details?.map((d: any) => ({
        reason: d.reason,
        service: d.metadata?.service,
        permission: d.metadata?.permission,
      })),
      categories: [
        "SERVICE_DISABLED",
        "BILLING_DISABLED",
        "SERVICE_USAGE_DENIED",
        "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
        "aiplatform.endpoints.predict",
        "quota project",
      ].filter((v) => (e.message || "").includes(v)),
    });
  } catch {}
  // Diagnostics intentionally exclude raw provider errors, which can contain tokens.
  process.exitCode = 1;
} finally {
  await pool.end();
}

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pool } from "@workspace/db";
import {
  projectSchema,
  timeline,
  invalidateScene,
} from "@workspace/video-workflow";
import {
  transaction,
  enqueue,
  load,
  finish,
  type Job,
} from "../src/video/repository";
import { assemble, runBinary, encoder, mediaInfo } from "../src/video/media";
import { putFile, downloadFile, r2 } from "../src/video/storage";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { config, publicError } from "../src/video/config";
const id = randomUUID(),
  sceneId = randomUUID(),
  keys: string[] = [];
const dir = await mkdtemp(join(tmpdir(), "brainstudios-regression-"));
try {
  for (let seconds = 8; seconds <= 120; seconds++) {
    const t = timeline(seconds);
    assert.equal(t[0].start, 0);
    assert.equal(t.at(-1)!.end, seconds);
    t.forEach((s, i) => {
      assert(s.end - s.start <= 8);
      assert(s.end > s.start);
      if (i) assert.equal(s.start, t[i - 1].end);
    });
  }
  const p = projectSchema.parse({
    id,
    title: "Regression check",
    prompt: "Regression test fixture",
    duration: 8,
    format: "9:16",
    style: "Cinematic",
    mode: "live",
    stage: 7,
    scenes: [
      {
        id: sceneId,
        title: "First",
        narration: "First scene",
        visual: "A green field",
        image: "",
        ready: true,
        start: 0,
        end: 4,
        clipKey: `checks/${id}/first.mp4`,
      },
      {
        id: randomUUID(),
        title: "Second",
        narration: "Second scene",
        visual: "A blue field",
        image: "",
        ready: true,
        start: 4,
        end: 8,
        clipKey: `checks/${id}/second.mp4`,
      },
    ],
    messages: [],
    thumbnail: 0,
    headline: "TEST",
    description: "A regression check.",
    tags: "test",
    finalKey: "old.mp4",
    thumbnails: [{ key: "old.png", concept: "Test", prompt: "Test" }],
  });
  const revision = invalidateScene(p, sceneId, {
    title: "Revised",
    narration: "Updated narration",
    visual: "Updated direction",
  });
  assert.equal(revision.scenes[0].ready, false);
  assert.equal(revision.scenes[0].revision, 2);
  assert.deepEqual(revision.scenes[1], p.scenes[1]);
  assert(
    revision.finalStale && revision.thumbnailStale && revision.publishingStale,
  );
  console.log("PASS: every supported timeline; isolated scene invalidation");
  await pool.query(
    "INSERT INTO video_productions(id,user_id,request_id,document) VALUES($1,$2,$3,$4)",
    [id, `check-${id}`, randomUUID(), JSON.stringify(p)],
  );
  await assert.rejects(load(id, "different-owner"), { status: 404 });
  await Promise.all(
    Array.from({ length: 4 }, () =>
      transaction((c) => enqueue(c, p, "assembly")),
    ),
  );
  const jobs = await pool.query<Job>(
    "SELECT * FROM video_jobs WHERE production_id=$1",
    [id],
  );
  assert.equal(jobs.rowCount, 1);
  const stale = { ...jobs.rows[0], locked_by: "old-claim" };
  await pool.query(
    "UPDATE video_jobs SET status='running',locked_by='new-claim' WHERE id=$1",
    [stale.id],
  );
  assert.equal(
    await finish(stale, async (doc) => {
      doc.title = "Should never be saved";
    }),
    false,
  );
  assert.equal((await load(id)).title, p.title);
  await finish({ ...stale, locked_by: "new-claim" }, async (doc) => {
    doc.title = "Valid completion";
  });
  assert.equal((await load(id)).title, "Valid completion");
  console.log(
    "PASS: owner isolation; concurrent enqueue deduplication; stale worker fencing",
  );
  for (let i = 0; i < 2; i++) {
    const file = join(dir, `clip-${i}.mp4`);
    const args = [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${i ? "blue" : "green"}:s=320x180:r=24`,
    ];
    if (i)
      args.push("-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100");
    args.push("-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p");
    if (i) args.push("-c:a", "aac");
    args.push(file);
    await runBinary(encoder(), args);
    console.log("Fixture clip encoded:", i + 1);
    keys.push(p.scenes[i].clipKey!);
    await putFile(keys.at(-1)!, file, "video/mp4");
    console.log("Fixture clip saved to R2:", i + 1);
  }
  keys.push(`checks/${id}/final.mp4`);
  await assemble(p, keys.at(-1)!);
  const final = join(dir, "result.mp4");
  await downloadFile(keys.at(-1)!, final);
  const info = await mediaInfo(final);
  assert(Math.abs(Number(info.format.duration) - 8) < 0.5);
  assert.equal(info.streams.find((s) => s.codec_type === "video")?.width, 720);
  assert.equal(
    info.streams.find((s) => s.codec_type === "video")?.height,
    1280,
  );
  assert(info.streams.some((s) => s.codec_type === "audio"));
  console.log(
    "PASS: R2 write/read; real FFmpeg assembly with mixed audio; portrait size and exact timeline",
  );
} catch (e) {
  console.error("Regression check failed:", publicError(e).message, {
    name: (e as any).name,
    code: (e as any).code,
    status: (e as any).$metadata?.httpStatusCode,
    location: (e as any).stack?.split("\n").slice(1, 3).join("\n"),
  });
  process.exitCode = 1;
} finally {
  for (const Key of keys)
    await r2
      .send(new DeleteObjectCommand({ Bucket: config.bucket, Key }))
      .catch(() => {});
  await pool
    .query("DELETE FROM video_productions WHERE id=$1 AND user_id=$2", [
      id,
      `check-${id}`,
    ])
    .catch(() => {});
  await pool.end();
  await rm(dir, { recursive: true, force: true });
}

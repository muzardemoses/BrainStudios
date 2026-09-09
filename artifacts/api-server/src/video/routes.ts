import { randomUUID } from "node:crypto";
import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import {
  createVideoSchema,
  commandSchema,
  detailsSchema,
  sceneEditSchema,
  projectSchema,
  invalidateScene,
  type Project,
} from "@workspace/video-workflow";
import { z } from "zod";
import {
  load,
  transaction,
  save,
  enqueue,
  message,
  jobsFor,
  type Job,
} from "./repository";
import { downloadUrl, hydrate } from "./storage";
import { readiness, WorkflowError, publicError } from "./config";
const router: IRouter = Router();
router.get("/video/config", (_req, res) => {
  res.json(readiness());
});
router.use(
  "/videos",
  clerkMiddleware({
    publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
    authorizedParties: (
      process.env.APP_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173"
    )
      .split(",")
      .map((s) => s.trim()),
  }),
);
router.use("/videos", (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (!getAuth(req).userId) {
    res
      .status(401)
      .json({ error: "Sign in to create and access your productions." });
    return;
  }
  next();
});
const owner = (req: Request) => getAuth(req).userId!;
const uuid = z.string().uuid();
async function response(id: string, userId: string) {
  const p = await load(id, userId);
  const jobs = await jobsFor(id);
  return hydrate({
    ...p,
    jobs: jobs
      .filter((j) => !["succeeded", "cancelled"].includes(j.status))
      .map((j) => ({
        id: j.id,
        kind: j.kind,
        status: j.status,
        sceneId: j.scene_id,
        error: j.error,
        attempts: j.attempts,
        label: j.label,
      })),
  });
}
router.get("/videos", async (req, res) => {
  const rows = await pool.query(
    "SELECT id FROM video_productions WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 100",
    [owner(req)],
  );
  res.json(
    await Promise.all(rows.rows.map((row) => response(row.id, owner(req)))),
  );
});
router.post("/videos", async (req, res) => {
  if (!readiness().ready)
    throw new WorkflowError(
      "Production services are not fully configured. The sample remains available.",
      503,
    );
  const body = createVideoSchema.parse(req.body),
    user = owner(req);
  const existing = await pool.query(
    "SELECT id FROM video_productions WHERE user_id=$1 AND request_id=$2",
    [user, body.requestId],
  );
  if (existing.rows[0]) {
    res.json(await response(existing.rows[0].id, user));
    return;
  }
  const p = projectSchema.parse({
    id: randomUUID(),
    title: "Your next production",
    prompt: body.prompt,
    duration: body.duration,
    format: body.format,
    style: body.style,
    mode: "live",
    stage: 1,
    scenes: [],
    messages: [
      { role: "user", text: body.prompt },
      {
        role: "assistant",
        text: "The Producer has assigned your brief to the Script Writer. Your timed narration is being written.",
        agent: "Producer",
      },
    ],
    thumbnail: 0,
    headline: "",
    description: "",
    tags: "",
  });
  const id = await transaction(async (c) => {
    const r = await c.query(
      "INSERT INTO video_productions(id,user_id,request_id,document) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,request_id) DO NOTHING RETURNING id",
      [p.id, user, body.requestId, JSON.stringify(p)],
    );
    if (!r.rows[0])
      return (
        await c.query(
          "SELECT id FROM video_productions WHERE user_id=$1 AND request_id=$2",
          [user, body.requestId],
        )
      ).rows[0].id as string;
    await enqueue(c, p, "script");
    return p.id;
  });
  res.status(201).json(await response(id, user));
});
router.get("/videos/:id", async (req, res) => {
  res.json(await response(uuid.parse(req.params.id), owner(req)));
});
router.get("/videos/:id/download/:asset", async (req, res) => {
  const p = await load(uuid.parse(req.params.id), owner(req));
  const video = req.params.asset === "video";
  if (!video && req.params.asset !== "thumbnail")
    throw new WorkflowError("Asset not found.", 404);
  const key = video ? p.finalKey : p.thumbnails[p.thumbnail]?.key;
  if (!key) throw new WorkflowError("This output is not ready.", 404);
  if (video ? p.finalStale : p.thumbnailStale)
    throw new WorkflowError("Rebuild this outdated output before downloading.");
  res.json({
    url: await downloadUrl(
      key,
      video ? "brainstudios-video.mp4" : "brainstudios-thumbnail.png",
    ),
  });
});
router.get("/videos/:id/events", async (req, res) => {
  const id = uuid.parse(req.params.id);
  await load(id, owner(req));
  const rows = await pool.query(
    "SELECT id,agent,type,detail,created_at FROM video_events WHERE production_id=$1 ORDER BY id DESC LIMIT 100",
    [id],
  );
  res.json(rows.rows);
});
async function editable(c: Parameters<typeof save>[0], p: Project) {
  await c.query(
    "UPDATE video_jobs SET locked_by=NULL,locked_at=NULL WHERE production_id=$1 AND status='paused' AND locked_at<now()-interval '2 minutes'",
    [p.id],
  );
  const result = await c.query(
    "SELECT 1 FROM video_jobs WHERE production_id=$1 AND (status IN ('queued','running','waiting','retrying') OR (status='paused' AND locked_by IS NOT NULL)) LIMIT 1",
    [p.id],
  );
  if (result.rowCount)
    throw new WorkflowError(
      "Wait for the current operation to finish, or pause it before editing.",
      409,
    );
}
function checkVersion(p: Project, version: unknown) {
  if (typeof version !== "number" || version !== p.version)
    throw new WorkflowError(
      "This production changed in another window. Refresh it and retry your edit.",
      409,
    );
}
router.patch("/videos/:id/scenes/:sceneId", async (req, res) => {
  const id = uuid.parse(req.params.id),
    sid = uuid.parse(req.params.sceneId),
    edits = sceneEditSchema.parse(req.body);
  await transaction(async (c) => {
    const p = await load(id, owner(req), c, true);
    checkVersion(p, req.body.version);
    await editable(c, p);
    if (!p.scenes.some((s) => s.id === sid))
      throw new WorkflowError("Scene not found.", 404);
    await c.query(
      "UPDATE video_jobs SET status='cancelled',locked_by=NULL WHERE production_id=$1 AND status IN ('failed','paused') AND (scene_id=$2 OR kind IN ('plan','assembly','thumbnail','publishing'))",
      [id, sid],
    );
    const updated = invalidateScene(p, sid, edits);
    message(
      updated,
      "Producer",
      "Your scene revision is saved. Unrelated clips are preserved. Review the updated script, then refresh the scene plan and regenerate this scene.",
    );
    await save(c, updated);
  });
  res.json(await response(id, owner(req)));
});
router.patch("/videos/:id", async (req, res) => {
  const id = uuid.parse(req.params.id),
    edits = detailsSchema.parse(req.body);
  await transaction(async (c) => {
    const p = await load(id, owner(req), c, true);
    checkVersion(p, req.body.version);
    await editable(c, p);
    if (
      edits.thumbnail !== undefined &&
      edits.thumbnail !== p.thumbnail &&
      !p.thumbnails[edits.thumbnail]
    )
      throw new WorkflowError("That thumbnail is not ready.");
    const headlineChanged =
      edits.headline !== undefined && edits.headline !== p.headline;
    Object.assign(p, edits);
    if (headlineChanged) {
      p.thumbnailStale = true;
      p.thumbnailConcepts = undefined;
      p.stage = Math.min(p.stage, 5);
    } else if (p.stage === 7) p.stage = 6;
    await save(c, p);
  });
  res.json(await response(id, owner(req)));
});
router.post("/videos/:id/commands", async (req, res) => {
  const id = uuid.parse(req.params.id),
    body = commandSchema.parse(req.body);
  await transaction(async (c) => {
    const p = await load(id, owner(req), c, true);
    if (body.command === "pause") {
      await c.query(
        "UPDATE video_jobs SET status='paused',updated_at=now() WHERE production_id=$1 AND status IN ('queued','running','waiting','retrying')",
        [id],
      );
      message(
        p,
        "Producer",
        "Pending work is paused. A request already sent to a provider may still finish; its result will be kept. Continue to resume saved operations.",
      );
      await save(c, p);
      return;
    }
    if (body.version !== undefined) checkVersion(p, body.version);
    await editable(c, p);
    if (body.command === "retry") {
      const pending = await c.query<Job>(
        "SELECT * FROM video_jobs WHERE production_id=$1 AND status IN ('failed','paused') FOR UPDATE",
        [id],
      );
      if (!pending.rowCount)
        throw new WorkflowError("There is no failed or paused work to retry.");
      for (const job of pending.rows) {
        if (
          job.scene_id &&
          p.scenes.find((s) => s.id === job.scene_id)?.revision !==
            job.scene_revision
        ) {
          await c.query(
            "UPDATE video_jobs SET status='cancelled' WHERE id=$1",
            [job.id],
          );
          continue;
        }
        const payload: Record<string, unknown> = {
          ...job.payload,
          pollStarted: Date.now(),
        };
        if (payload.operationFailed) {
          delete payload.operation;
          delete payload.operationFailed;
        }
        if (!payload.operation) delete payload.submitStarted;
        await c.query(
          "UPDATE video_jobs SET status='queued',attempts=0,error=NULL,locked_at=NULL,locked_by=NULL,payload=$2,run_after=now() WHERE id=$1",
          [job.id, JSON.stringify(payload)],
        );
        if (job.scene_id)
          p.scenes = p.scenes.map((s) =>
            s.id === job.scene_id
              ? { ...s, status: "queued", error: undefined }
              : s,
          );
      }
      message(
        p,
        "Producer",
        "Resuming the saved production work. Ready scenes will not be regenerated.",
      );
    } else if (body.command === "regenerate-scene") {
      const s = p.scenes.find((s) => s.id === body.sceneId);
      if (!s) throw new WorkflowError("Scene not found.", 404);
      if (!s.generationPrompt)
        throw new WorkflowError("Approve the revised scene plan first.");
      await c.query(
        "UPDATE video_jobs SET status='cancelled',locked_by=NULL WHERE production_id=$1 AND status IN ('failed','paused') AND (scene_id=$2 OR kind IN ('assembly','thumbnail','publishing'))",
        [id, s.id],
      );
      s.revision++;
      s.ready = false;
      s.status = "queued";
      s.error = undefined;
      p.finalStale = Boolean(p.finalKey);
      p.thumbnailStale = p.thumbnails.length > 0;
      p.publishingStale = true;
      p.stage = 3;
      await enqueue(c, p, "scene", s.id);
      message(
        p,
        "Producer",
        `Regenerating scene ${p.scenes.indexOf(s) + 1}. All other clips are preserved.`,
      );
    } else if (body.command === "regenerate-thumbnail") {
      if (!p.finalKey || p.finalStale)
        throw new WorkflowError(
          "Assemble the current scenes before generating thumbnails.",
        );
      await c.query(
        "UPDATE video_jobs SET status='cancelled' WHERE production_id=$1 AND kind IN ('thumbnail','publishing') AND status IN ('paused','failed')",
        [id],
      );
      p.thumbnailStale = true;
      p.stage = 5;
      await enqueue(c, p, "thumbnail");
    } else if (body.command === "message") {
      if (!body.text) throw new WorkflowError("Add a production note.");
      p.messages.push({ role: "user", text: body.text });
      await enqueue(c, p, "message", undefined, { note: body.text });
    } else {
      const failed = await c.query(
        "SELECT 1 FROM video_jobs WHERE production_id=$1 AND status IN ('failed','paused') LIMIT 1",
        [id],
      );
      if (failed.rowCount)
        throw new WorkflowError(
          "Retry or resume the unfinished work before continuing.",
        );
      if (!p.scenes.length) {
        await enqueue(c, p, "script");
      } else if (p.stage === 1) {
        p.stage = 2;
        await enqueue(c, p, "plan");
        message(
          p,
          "Producer",
          "Script approved. The Scene Director is translating your narration into a visual plan.",
        );
      } else if (p.stage === 2 || p.stage === 3) {
        if (p.scenes.some((s) => !s.ready && !s.generationPrompt))
          throw new WorkflowError("The scene plan is not ready.");
        p.stage = 3;
        for (const s of p.scenes) {
          if (!s.ready) {
            s.status = "queued";
            await enqueue(c, p, "scene", s.id);
          }
        }
        if (p.scenes.every((s) => s.ready)) p.stage = 4;
      } else if (p.stage === 4) {
        if (p.scenes.some((s) => !s.ready))
          throw new WorkflowError("Wait for all scene clips before assembly.");
        await enqueue(c, p, "assembly");
        message(
          p,
          "Editor",
          "All required clips are ready. Assembling them into the final video.",
        );
      } else if (p.stage === 5) {
        if (p.thumbnails.length < 3 || p.thumbnailStale) {
          await enqueue(c, p, "thumbnail");
          message(
            p,
            "ThumbnailCreator",
            "Creating three thumbnail options based on the finished production.",
          );
        } else {
          p.stage = 6;
          await enqueue(c, p, "publishing");
        }
      } else if (p.stage === 6) {
        if (!p.title.trim() || !p.description.trim())
          throw new WorkflowError("Add a title and description before saving.");
        if (
          !p.finalKey ||
          p.finalStale ||
          p.thumbnailStale ||
          p.publishingStale
        )
          throw new WorkflowError(
            "Refresh the outdated production outputs before finishing.",
          );
        p.stage = 7;
        message(
          p,
          "Producer",
          "Production complete. Your video, thumbnail, and publishing details are ready. Nothing has been uploaded to YouTube.",
        );
      }
    }
    await save(c, p);
  });
  res.json(await response(id, owner(req)));
});
router.use(
  (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error:
          "Some production fields are invalid. Check the form and try again.",
      });
      return;
    }
    const status = error instanceof WorkflowError ? error.status : 500;
    res.status(status).json({ error: publicError(error).message });
  },
);
export default router;

import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { GenerateVideosOperation } from "@google/genai";
import { z } from "zod/v4";
import {
  invalidateScene,
  sceneDuration,
  timeline,
  type Project,
} from "@workspace/video-workflow";
import {
  config,
  google,
  googleAuth,
  publicError,
  WorkflowError,
} from "./config";
import {
  delegate,
  instructions,
  scriptOutput,
  planOutput,
  thumbnailOutput,
  publishingOutput,
  noteOutput,
} from "./agents";
import {
  load,
  finish,
  checkpoint,
  event,
  message,
  type Job,
  transaction,
  save,
} from "./repository";
import { put } from "./storage";
import { assemble, posterFor } from "./media";
import { logger } from "../lib/logger";

export async function execute(job: Job) {
  const p = await load(job.production_id);
  await event(p.id, job.id, "Producer", "job-start", {
    kind: job.kind,
    attempt: job.attempts,
  });
  if (job.kind === "script") {
    const draft = await delegate<z.infer<typeof scriptOutput>>(
      job,
      p,
      "ScriptWriter",
      instructions.script,
      scriptOutput,
    );
    const times = timeline(p.duration);
    if (draft.sections.length !== times.length)
      throw new WorkflowError(
        "The script did not fit the requested timeline. Please retry.",
        502,
        true,
      );
    for (let i = 0; i < times.length; i++)
      if (
        draft.sections[i].narration.trim().split(/\s+/).length >
        (times[i].end - times[i].start) * 3
      )
        throw new WorkflowError(
          "The narration is too dense for the requested timing. Retrying the Script Writer.",
          502,
          true,
        );
    await finish(job, async (doc) => {
      doc.title = draft.title;
      doc.scenes = draft.sections.map((s, i) => ({
        ...s,
        id: randomUUID(),
        ...times[i],
        visual: "",
        image: "",
        ready: false,
        revision: 1,
        status: "planned",
      }));
      doc.stage = 1;
      message(
        doc,
        "ScriptWriter",
        `Your ${p.duration}-second script is ready in ${times.length} timed sections. Review the narration, then approve it for scene direction.`,
      );
    });
  } else if (job.kind === "plan") {
    const plan = await delegate<z.infer<typeof planOutput>>(
      job,
      p,
      "SceneDirector",
      instructions.plan,
      planOutput,
    );
    if (
      plan.scenes.length !== p.scenes.length ||
      new Set(plan.scenes.map((s) => s.id)).size !== p.scenes.length ||
      p.scenes.some((s) => !plan.scenes.some((d) => d.id === s.id))
    )
      throw new WorkflowError(
        "The scene plan did not match the approved script. Please retry.",
        502,
        true,
      );
    await finish(job, async (doc) => {
      doc.visualBible = plan.visualBible;
      doc.scenes = doc.scenes.map((s) =>
        s.ready
          ? s
          : {
              ...s,
              ...plan.scenes.find((d) => d.id === s.id),
              status: "planned",
            },
      );
      doc.stage = 2;
      message(
        doc,
        "SceneDirector",
        "Your visual scene plan is ready. Each shot now has its own subjects, action, environment, camera direction, and Veo prompt. Existing ready clips were preserved.",
      );
    });
  } else if (job.kind === "scene") {
    await delegate(
      job,
      p,
      "VisualGenerator",
      "Generate the approved scene with Veo and persist its result.",
      null,
      () => generateScene(job, p),
    );
  } else if (job.kind === "assembly") {
    const key = `productions/${p.id}/assemblies/${job.id}.mp4`;
    await delegate(
      job,
      p,
      "Editor",
      "Assemble the approved clips in timeline order using the local encoder.",
      null,
      () => assemble(p, key),
    );
    await finish(job, async (doc) => {
      doc.finalKey = key;
      doc.finalStale = false;
      doc.stage = 5;
      message(
        doc,
        "Editor",
        `Your ${p.duration}-second video is assembled and saved. It includes the clips’ generated audio; the timed transcript remains available in your production package. Next, create your thumbnail.`,
      );
    });
  } else if (job.kind === "thumbnail") {
    if (!p.thumbnailConcepts || p.thumbnailStale) {
      const concepts = await delegate<z.infer<typeof thumbnailOutput>>(
        job,
        p,
        "ThumbnailCreator",
        instructions.thumbnail,
        thumbnailOutput,
      );
      if (
        !(await checkpoint(job, async (doc) => {
          doc.thumbnailConcepts = concepts.concepts;
          doc.headline = concepts.headline;
          doc.thumbnails = [];
          doc.thumbnailStale = false;
        }))
      )
        return;
    }
    for (let i = 0; i < 3; i++) {
      const doc = await load(p.id);
      if (doc.thumbnails[i]) continue;
      const state = (
        await pool.query(
          "SELECT status FROM video_jobs WHERE id=$1 AND locked_by=$2",
          [job.id, job.locked_by],
        )
      ).rows[0]?.status;
      if (!state) return;
      if (state === "paused") {
        await pool.query(
          "UPDATE video_jobs SET locked_by=NULL,locked_at=NULL WHERE id=$1 AND locked_by=$2",
          [job.id, job.locked_by],
        );
        return;
      }
      const concept = doc.thumbnailConcepts![i];
      const key = `productions/${p.id}/thumbnails/${job.id}-${i}.png`;
      await delegate(
        job,
        doc,
        "ThumbnailRenderer",
        "Render the approved thumbnail concept and persist it.",
        null,
        async () => {
          const ai = google();
          let bytes: string | undefined;
          let mime = "image/png";
          if (config.image.startsWith("imagen")) {
            const result = await ai.models.generateImages({
              model: config.image,
              prompt: concept.prompt,
              config: { numberOfImages: 1, aspectRatio: "16:9" },
            });
            bytes = result.generatedImages?.[0]?.image?.imageBytes;
            mime = result.generatedImages?.[0]?.image?.mimeType || mime;
          } else {
            const result = await ai.models.generateContent({
              model: config.image,
              contents: concept.prompt,
              config: {
                responseModalities: ["TEXT", "IMAGE"],
                imageConfig: { aspectRatio: "16:9" },
              },
            });
            const part = result.candidates?.[0]?.content?.parts?.find(
              (x) => x.inlineData?.data,
            );
            bytes = part?.inlineData?.data;
            mime = part?.inlineData?.mimeType || mime;
          }
          if (!bytes)
            throw new WorkflowError(
              "Image generation returned no image. Adjust the thumbnail concept or retry.",
            );
          await put(key, Buffer.from(bytes, "base64"), mime);
          return { key };
        },
      );
      if (
        !(await checkpoint(job, async (latest) => {
          latest.thumbnails[i] = { key, ...concept };
        }))
      )
        return;
    }
    await finish(job, async (doc) => {
      doc.stage = 5;
      doc.thumbnailStale = false;
      message(
        doc,
        "ThumbnailCreator",
        "Three generated thumbnails are ready and saved. Choose your cover, then continue to publishing details.",
      );
    });
  } else if (job.kind === "publishing") {
    const result = await delegate<z.infer<typeof publishingOutput>>(
      job,
      p,
      "PublishingAssistant",
      instructions.publishing,
      publishingOutput,
    );
    await finish(job, async (doc) => {
      doc.title = result.title;
      doc.description = result.description;
      doc.tags = result.tags.join(", ");
      doc.publishingStale = false;
      doc.stage = 6;
      message(
        doc,
        "PublishingAssistant",
        "Your publishing draft is ready, based on the finished production. Review the title, description, and tags, then save. Nothing has been uploaded to YouTube.",
      );
    });
  } else if (job.kind === "message") {
    const response = await delegate<z.infer<typeof noteOutput>>(
      job,
      p,
      "ProductionAdvisor",
      instructions.message,
      noteOutput,
    );
    await finish(job, async (doc) => {
      if (response.action === "revise-scene") {
        if (
          !doc.scenes.some((s) => s.id === response.sceneId) ||
          !response.title ||
          !response.narration ||
          !response.visual
        )
          throw new WorkflowError(
            "The Producer could not identify a valid scene revision. Please name the scene and try again.",
          );
        const changed = invalidateScene(doc, response.sceneId!, {
          title: response.title,
          narration: response.narration,
          visual: response.visual,
        });
        Object.assign(doc, changed);
      }
      message(doc, "Producer", response.reply);
    });
  } else throw new WorkflowError("Unknown production job.");
}
async function generateScene(job: Job, p: Project) {
  const scene = p.scenes.find((s) => s.id === job.scene_id);
  if (!scene || scene.revision !== job.scene_revision) {
    await pool.query(
      "UPDATE video_jobs SET status='cancelled',locked_by=NULL WHERE id=$1 AND locked_by=$2",
      [job.id, job.locked_by],
    );
    return { cancelled: true };
  }
  const ai = google(true);
  let operation: GenerateVideosOperation;
  const operationName =
    typeof job.payload.operation === "string"
      ? job.payload.operation
      : undefined;
  if (!operationName) {
    if (job.payload.submitStarted)
      throw new WorkflowError(
        "Veo submission was interrupted before an operation ID could be saved. Automatic resubmission is disabled to avoid duplicate charges. Retry explicitly to start a new request.",
      );
    if (!scene.generationPrompt)
      throw new WorkflowError(
        "This scene needs an approved visual plan before video generation.",
      );
    await pool.query(
      "UPDATE video_jobs SET payload=payload || $2::jsonb WHERE id=$1 AND locked_by=$3",
      [
        job.id,
        JSON.stringify({ submitStarted: true, pollStarted: Date.now() }),
        job.locked_by,
      ],
    );
    if (
      !(await checkpoint(job, async (doc) => {
        doc.scenes = doc.scenes.map((s) =>
          s.id === scene.id
            ? { ...s, status: "generating", error: undefined }
            : s,
        );
      }))
    )
      return { cancelled: true };
    const duration = sceneDuration(p, scene);
    const veoDuration = duration <= 4 ? 4 : duration <= 6 ? 6 : 8;
    try {
      operation = await ai.models.generateVideos({
        model: config.veo,
        prompt: `${scene.generationPrompt}\nVisual continuity: ${p.visualBible || scene.continuity || ""}\nAudio: natural ambience appropriate to the scene, no speech, dialogue or narration.`,
        config: {
          numberOfVideos: 1,
          durationSeconds: veoDuration,
          aspectRatio: p.format,
          resolution: "720p",
          generateAudio: !config.veo.startsWith("veo-2"),
          personGeneration: "allow_adult",
        },
      });
    } catch (e) {
      const info = publicError(e);
      const status = Number((e as { status?: number }).status);
      if (status === 429 || status === 400 || status === 403 || status === 404)
        await pool.query(
          "UPDATE video_jobs SET payload=payload - 'submitStarted' WHERE id=$1 AND locked_by=$2",
          [job.id, job.locked_by],
        );
      else
        throw new WorkflowError(
          "Veo submission could not be confirmed. Retry explicitly to avoid an automatic duplicate request.",
        );
      throw e;
    }
    if (!operation.name)
      throw new WorkflowError(
        "Veo did not return an operation ID. Retry explicitly; automatic resubmission is disabled.",
      );
    await pool.query(
      "UPDATE video_jobs SET payload=payload || $2::jsonb WHERE id=$1 AND locked_by=$3",
      [
        job.id,
        JSON.stringify({
          operation: operation.name,
          model: config.veo,
          location: config.veoLocation,
        }),
        job.locked_by,
      ],
    );
  } else {
    if (
      Date.now() - Number(job.payload.pollStarted || Date.now()) >
      2 * 60 * 60_000
    )
      throw new WorkflowError(
        "Veo is taking longer than expected. The operation is saved. Retry to check its status again without generating a duplicate.",
      );
    operation = await ai.operations.getVideosOperation({
      operation: Object.assign(new GenerateVideosOperation(), {
        name: operationName,
      }),
    });
  }
  if (!operation.done) {
    const polls = Number(job.payload.polls || 0) + 1;
    await pool.query(
      "UPDATE video_jobs SET status=CASE WHEN status='paused' THEN status ELSE 'waiting' END,locked_at=NULL,locked_by=NULL,run_after=now()+($2 * interval '1 second'),payload=payload || $3::jsonb WHERE id=$1 AND locked_by=$4",
      [
        job.id,
        Math.min(15 + polls * 5, 60),
        JSON.stringify({ polls }),
        job.locked_by,
      ],
    );
    return { waiting: true };
  }
  if (operation.error || !operation.response?.generatedVideos?.[0]?.video)
    await pool.query(
      "UPDATE video_jobs SET payload=payload || '{\"operationFailed\":true}'::jsonb WHERE id=$1 AND locked_by=$2",
      [job.id, job.locked_by],
    );
  if (operation.error)
    throw new WorkflowError(
      "Veo could not generate this scene. Try revising its visual direction, then regenerate.",
    );
  const video = operation.response?.generatedVideos?.[0]?.video;
  if (!video)
    throw new WorkflowError(
      "Veo returned no playable clip. The request may have been filtered. Adjust the scene prompt and retry.",
    );
  let bytes: Buffer;
  if (video.videoBytes) bytes = Buffer.from(video.videoBytes, "base64");
  else if (video.uri) {
    let url: string;
    if (video.uri.startsWith("gs://")) {
      const [bucket, ...key] = video.uri.slice(5).split("/");
      url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(key.join("/"))}?alt=media`;
    } else {
      const parsed = new URL(video.uri);
      if (
        parsed.protocol !== "https:" ||
        !(
          parsed.hostname === "googleapis.com" ||
          parsed.hostname.endsWith(".googleapis.com")
        )
      )
        throw new WorkflowError(
          "The provider returned an unsupported media location.",
        );
      url = parsed.href;
    }
    const response = await googleAuth.request<ArrayBuffer>({
      url,
      responseType: "arraybuffer",
      timeout: 120_000,
    });
    bytes = Buffer.from(response.data);
  } else throw new WorkflowError("Veo returned no media data.");
  const key = `productions/${p.id}/scenes/${scene.id}/r${scene.revision}-${job.id}.mp4`,
    posterKey = key.replace(/\.mp4$/, ".jpg");
  await put(key, bytes, "video/mp4");
  await posterFor(bytes, posterKey);
  await finish(job, async (doc) => {
    doc.scenes = doc.scenes.map((s) =>
      s.id === scene.id
        ? {
            ...s,
            ready: true,
            status: "ready",
            error: undefined,
            clipKey: key,
            posterKey,
          }
        : s,
    );
    const n = doc.scenes.filter((s) => s.ready).length;
    if (n === doc.scenes.length) doc.stage = 4;
    message(
      doc,
      "VisualGenerator",
      `Scene ${doc.scenes.findIndex((s) => s.id === scene.id) + 1} is ready. ${n} of ${doc.scenes.length} clips saved.${n === doc.scenes.length ? " All scenes are ready for assembly." : ""}`,
    );
  });
  return { ready: true, key };
}
async function fail(job: Job, error: unknown) {
  const info = publicError(error);
  const retry = info.retryable && job.attempts < 4;
  await transaction(async (c) => {
    const p = await load(job.production_id, undefined, c, true);
    const current = (
      await c.query<Job>("SELECT * FROM video_jobs WHERE id=$1 FOR UPDATE", [
        job.id,
      ])
    ).rows[0];
    if (!current || current.locked_by !== job.locked_by) return;
    await c.query(
      "UPDATE video_jobs SET status=CASE WHEN status='paused' THEN status ELSE $2 END,error=$3,locked_by=NULL,locked_at=NULL,run_after=now()+($4 * interval '1 second'),updated_at=now() WHERE id=$1",
      [
        job.id,
        retry ? "retrying" : "failed",
        info.message,
        Math.min(30 * 2 ** job.attempts, 300),
      ],
    );
    if (job.scene_id)
      p.scenes = p.scenes.map((s) =>
        s.id === job.scene_id
          ? { ...s, status: retry ? "queued" : "failed", error: info.message }
          : s,
      );
    message(p, "Producer", `${job.label}: ${info.message}`);
    await save(c, p);
    await event(
      p.id,
      job.id,
      "Producer",
      retry ? "job-retry" : "job-failed",
      { message: info.message },
      c,
    );
  });
}
export async function claim(): Promise<Job | undefined> {
  await pool.query(
    "UPDATE video_jobs SET locked_by=NULL,locked_at=NULL WHERE status='paused' AND locked_at<now()-interval '2 minutes'",
  );
  const result = await pool.query<Job>(
    `WITH candidate AS (SELECT id FROM video_jobs WHERE ((status IN ('queued','waiting','retrying') AND run_after<=now()) OR (status='running' AND locked_at<now()-interval '2 minutes')) ORDER BY run_after LIMIT 1 FOR UPDATE SKIP LOCKED) UPDATE video_jobs j SET status='running',locked_at=now(),locked_by=$1,attempts=attempts+CASE WHEN j.status='waiting' THEN 0 ELSE 1 END,updated_at=now() FROM candidate WHERE j.id=candidate.id RETURNING j.*`,
    [randomUUID()],
  );
  return result.rows[0];
}
let stopping = false;
export async function workerLoop() {
  while (!stopping) {
    let job: Job | undefined;
    try {
      job = await claim();
      if (job) {
        const heartbeat = setInterval(() => {
          void pool
            .query(
              "UPDATE video_jobs SET locked_at=now() WHERE id=$1 AND locked_by=$2",
              [job!.id, job!.locked_by],
            )
            .catch(() => {});
        }, 15_000);
        try {
          await execute(job);
        } catch (e) {
          await fail(job, e);
        } finally {
          clearInterval(heartbeat);
        }
      }
    } catch {
      logger.warn(
        "Production worker could not reach storage; retrying shortly.",
      );
    }
    if (!job) await new Promise((r) => setTimeout(r, 3000));
  }
}
export function startWorkers() {
  stopping = false;
  const workers = [workerLoop(), workerLoop()];
  return async () => {
    stopping = true;
    await Promise.all(workers);
  };
}

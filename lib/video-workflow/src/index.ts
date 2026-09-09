import { z } from "zod";
export const steps = [
  "Prompt",
  "Timed script",
  "Scene plan",
  "Generated scenes",
  "Video assembly",
  "Thumbnail",
  "Publishing details",
];
export const sceneSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  narration: z.string(),
  visual: z.string(),
  image: z.string(),
  ready: z.boolean(),
  start: z.number().optional(),
  end: z.number().optional(),
  revision: z.number().default(1),
  status: z
    .enum(["planned", "queued", "generating", "ready", "failed"])
    .optional(),
  error: z.string().optional(),
  action: z.string().optional(),
  environment: z.string().optional(),
  subjects: z.string().optional(),
  camera: z.string().optional(),
  generationPrompt: z.string().optional(),
  continuity: z.string().optional(),
  clipKey: z.string().optional(),
  posterKey: z.string().optional(),
  clipUrl: z.string().optional(),
});
export const jobSchema = z.object({
  id: z.string(),
  kind: z.string(),
  status: z.string(),
  sceneId: z.string().nullable(),
  error: z.string().nullable(),
  attempts: z.number(),
  label: z.string(),
});
export const projectSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  duration: z.number().int().min(8).max(120),
  format: z.enum(["16:9", "9:16"]),
  style: z.string(),
  mode: z.enum(["demo", "live"]).default("demo"),
  version: z.number().default(1),
  stage: z.number().int().min(0).max(7),
  scenes: z.array(sceneSchema).max(30),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      text: z.string(),
      agent: z.string().optional(),
    }),
  ),
  thumbnail: z.number().int().min(0).max(2),
  headline: z.string(),
  description: z.string(),
  tags: z.string(),
  visualBible: z.string().optional(),
  finalKey: z.string().optional(),
  finalUrl: z.string().optional(),
  finalStale: z.boolean().default(false),
  thumbnails: z
    .array(
      z.object({
        key: z.string(),
        url: z.string().optional(),
        concept: z.string(),
        prompt: z.string(),
      }),
    )
    .default([]),
  thumbnailConcepts: z
    .array(z.object({ concept: z.string(), prompt: z.string() }))
    .optional(),
  thumbnailStale: z.boolean().default(false),
  publishingStale: z.boolean().default(false),
  jobs: z.array(jobSchema).default([]),
  updatedAt: z.string().optional(),
});
export type Project = z.infer<typeof projectSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type JobView = z.infer<typeof jobSchema>;
export const createVideoSchema = z.object({
  prompt: z.string().trim().min(5).max(4000),
  duration: z.number().int().min(8).max(120),
  format: z.enum(["16:9", "9:16"]),
  style: z.string().trim().min(1).max(80),
  requestId: z.string().uuid(),
});
export const sceneEditSchema = z.object({
  title: z.string().trim().min(1).max(100),
  narration: z.string().trim().min(1).max(1000),
  visual: z.string().trim().max(2000),
});
export const detailsSchema = z
  .object({
    title: z.string().max(100),
    description: z.string().max(5000),
    tags: z.string().max(500),
    headline: z.string().max(100),
    thumbnail: z.number().int().min(0).max(2),
  })
  .partial();
export const commandSchema = z.object({
  command: z.enum([
    "advance",
    "pause",
    "retry",
    "regenerate-scene",
    "regenerate-thumbnail",
    "message",
  ]),
  sceneId: z.string().optional(),
  text: z.string().trim().min(1).max(2000).optional(),
  version: z.number().int().optional(),
});
export const runningJob = (p: Project) =>
  p.jobs.find((j) =>
    ["queued", "running", "waiting", "retrying"].includes(j.status),
  );
export const sceneDuration = (p: Project, s: Scene) =>
  s.start !== undefined && s.end !== undefined
    ? s.end - s.start
    : p.duration / p.scenes.length;
export function timecode(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
export function sceneTime(p: Project, index: number) {
  const s = p.scenes[index];
  return `${timecode(s.start ?? (index * p.duration) / p.scenes.length)} – ${timecode(s.end ?? ((index + 1) * p.duration) / p.scenes.length)}`;
}
// All real segments fit Veo's 4/6/8-second requests. The editor trims the last clip
// to its exact planned duration; no cumulative drift is introduced by the model.
export function timeline(duration: number) {
  const count = Math.ceil(duration / 8),
    base = Math.floor(duration / count),
    extra = duration % count;
  let cursor = 0;
  return Array.from({ length: count }, (_, i) => {
    const start = cursor;
    cursor += base + (i < extra ? 1 : 0);
    return { start, end: cursor };
  });
}
export function invalidateScene(
  p: Project,
  id: string,
  edits: z.infer<typeof sceneEditSchema>,
): Project {
  return {
    ...p,
    scenes: p.scenes.map((s) =>
      s.id === id
        ? {
            ...s,
            ...edits,
            generationPrompt: undefined,
            ready: false,
            status: "planned" as const,
            error: undefined,
            revision: s.revision + 1,
          }
        : s,
    ),
    stage: 1,
    finalStale: Boolean(p.finalKey),
    thumbnailStale: p.thumbnails.length > 0,
    publishingStale: true,
  };
}

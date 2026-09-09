import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { projectSchema, type Project } from "@workspace/video-workflow";
import { WorkflowError } from "./config";
const connect = async () => await pool.connect();
export type SqlClient = Awaited<ReturnType<typeof connect>>;
export interface Job {
  id: string;
  production_id: string;
  kind: string;
  scene_id: string | null;
  scene_revision: number | null;
  status: string;
  payload: Record<string, unknown>;
  attempts: number;
  error: string | null;
  label: string;
  locked_by: string | null;
  created_at: Date;
}
export async function transaction<T>(fn: (client: SqlClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const value = await fn(c);
    await c.query("COMMIT");
    return value;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function load(
  id: string,
  owner?: string,
  client: Pick<SqlClient, "query"> = pool,
  lock = false,
): Promise<Project> {
  const r = await client.query(
    `SELECT document, version, updated_at FROM video_productions WHERE id=$1${owner ? " AND user_id=$2" : ""}${lock ? " FOR UPDATE" : ""}`,
    owner ? [id, owner] : [id],
  );
  if (!r.rows[0]) throw new WorkflowError("Production not found.", 404);
  return projectSchema.parse({
    ...r.rows[0].document,
    version: r.rows[0].version,
    updatedAt: r.rows[0].updated_at.toISOString(),
  });
}
export async function save(c: Pick<SqlClient, "query">, p: Project) {
  // Signed transport URLs are never persisted as canonical media references.
  const doc = {
    ...p,
    jobs: [],
    finalUrl: undefined,
    scenes: p.scenes.map((s) => ({ ...s, image: "", clipUrl: undefined })),
    thumbnails: p.thumbnails.map((t) => ({ ...t, url: undefined })),
  };
  const r = await c.query(
    "UPDATE video_productions SET document=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING version",
    [p.id, JSON.stringify(doc)],
  );
  p.version = r.rows[0].version;
}
export async function event(
  id: string,
  jobId: string | null,
  agent: string,
  type: string,
  detail: Record<string, unknown>,
  c: Pick<SqlClient, "query"> = pool,
) {
  await c.query(
    "INSERT INTO video_events(production_id,job_id,agent,type,detail) VALUES($1,$2,$3,$4,$5)",
    [id, jobId, agent, type, JSON.stringify(detail)],
  );
}
export function message(p: Project, agent: string, text: string) {
  p.messages = [...p.messages.slice(-149), { role: "assistant", text, agent }];
}
export const labels: Record<string, string> = {
  script: "Writing your timed script",
  plan: "Directing your scenes",
  scene: "Generating your scene",
  assembly: "Assembling your video",
  thumbnail: "Creating your thumbnails",
  publishing: "Preparing publishing details",
  message: "Producer is reviewing your direction",
};
export async function enqueue(
  c: Pick<SqlClient, "query">,
  p: Project,
  kind: string,
  sceneId?: string,
  payload: Record<string, unknown> = {},
) {
  const scene = p.scenes.find((s) => s.id === sceneId);
  await c.query(
    `INSERT INTO video_jobs(id,production_id,kind,scene_id,scene_revision,payload,label) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
    [
      randomUUID(),
      p.id,
      kind,
      sceneId || null,
      scene?.revision || null,
      JSON.stringify(payload),
      sceneId
        ? `Generating scene ${p.scenes.findIndex((s) => s.id === sceneId) + 1} of ${p.scenes.length}`
        : labels[kind],
    ],
  );
}
export async function jobsFor(id: string) {
  return (
    await pool.query<Job>(
      "SELECT * FROM video_jobs WHERE production_id=$1 ORDER BY created_at DESC LIMIT 100",
      [id],
    )
  ).rows;
}
// Every checkpoint is fenced by a unique claim token. A worker that lost its
// lease cannot overwrite a newer worker or a subsequent user revision.
export async function checkpoint(
  job: Job,
  fn: (p: Project, c: SqlClient) => Promise<void>,
  complete = false,
) {
  return transaction(async (c) => {
    const p = await load(job.production_id, undefined, c, true);
    const r = await c.query<Job>(
      "SELECT * FROM video_jobs WHERE id=$1 FOR UPDATE",
      [job.id],
    );
    if (
      !r.rows[0] ||
      r.rows[0].locked_by !== job.locked_by ||
      !["running", "paused"].includes(r.rows[0].status)
    )
      return false;
    if (
      job.scene_id &&
      p.scenes.find((s) => s.id === job.scene_id)?.revision !==
        job.scene_revision
    ) {
      await c.query(
        "UPDATE video_jobs SET status='cancelled',locked_by=NULL WHERE id=$1",
        [job.id],
      );
      return false;
    }
    await fn(p, c);
    await save(c, p);
    if (complete)
      await c.query(
        "UPDATE video_jobs SET status='succeeded',locked_by=NULL,locked_at=NULL,error=NULL,updated_at=now() WHERE id=$1",
        [job.id],
      );
    return true;
  });
}
export async function finish(
  job: Job,
  fn: (p: Project, c: SqlClient) => Promise<void>,
) {
  return checkpoint(job, fn, true);
}

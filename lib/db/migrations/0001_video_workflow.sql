-- Additive migration: the previous studio tables are deliberately untouched.
CREATE TABLE IF NOT EXISTS video_productions (
 id uuid PRIMARY KEY, user_id text NOT NULL, request_id uuid NOT NULL,
 document jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id, request_id)
);
CREATE INDEX IF NOT EXISTS video_productions_owner ON video_productions(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS video_jobs (
 id uuid PRIMARY KEY, production_id uuid NOT NULL REFERENCES video_productions(id) ON DELETE CASCADE,
 kind text NOT NULL, scene_id text, scene_revision integer, status text NOT NULL DEFAULT 'queued',
 payload jsonb NOT NULL DEFAULT '{}', attempts integer NOT NULL DEFAULT 0, error text, label text NOT NULL,
 run_after timestamptz NOT NULL DEFAULT now(), locked_at timestamptz, locked_by text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS video_jobs_runnable ON video_jobs(status, run_after);
CREATE INDEX IF NOT EXISTS video_jobs_production ON video_jobs(production_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS video_jobs_active_unique ON video_jobs(production_id, kind, COALESCE(scene_id,''))
 WHERE status IN ('queued','running','waiting','retrying','paused');
CREATE TABLE IF NOT EXISTS video_events (
 id bigserial PRIMARY KEY, production_id uuid NOT NULL REFERENCES video_productions(id) ON DELETE CASCADE,
 job_id uuid REFERENCES video_jobs(id) ON DELETE SET NULL, agent text NOT NULL, type text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS video_events_production ON video_events(production_id, id);

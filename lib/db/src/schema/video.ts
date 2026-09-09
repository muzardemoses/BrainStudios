import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  bigserial,
  index,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
export const videoProductionsTable = pgTable(
  "video_productions",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    requestId: uuid("request_id").notNull(),
    document: jsonb("document").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("video_productions_user_id_request_id_key").on(
      t.userId,
      t.requestId,
    ),
    index("video_productions_owner").on(t.userId, t.updatedAt.desc()),
  ],
);
export const videoJobsTable = pgTable(
  "video_jobs",
  {
    id: uuid("id").primaryKey(),
    productionId: uuid("production_id")
      .notNull()
      .references(() => videoProductionsTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    sceneId: text("scene_id"),
    sceneRevision: integer("scene_revision"),
    status: text("status").notNull().default("queued"),
    payload: jsonb("payload").notNull().default({}),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    label: text("label").notNull(),
    runAfter: timestamp("run_after", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("video_jobs_runnable").on(t.status, t.runAfter),
    index("video_jobs_production").on(t.productionId, t.createdAt),
    uniqueIndex("video_jobs_active_unique")
      .on(t.productionId, t.kind, sql`COALESCE(${t.sceneId},'')`)
      .where(
        sql`${t.status} IN ('queued','running','waiting','retrying','paused')`,
      ),
  ],
);
export const videoEventsTable = pgTable(
  "video_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productionId: uuid("production_id")
      .notNull()
      .references(() => videoProductionsTable.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => videoJobsTable.id, {
      onDelete: "set null",
    }),
    agent: text("agent").notNull(),
    type: text("type").notNull(),
    detail: jsonb("detail").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("video_events_production").on(t.productionId, t.id)],
);

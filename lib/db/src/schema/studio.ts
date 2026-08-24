import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const usersTable = pgTable("studio_users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  ...timestamps,
});

export const productionsTable = pgTable("productions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default("demo-director"),
  title: text("title").notNull(),
  originalIdea: text("original_idea").notNull(),
  genre: text("genre").notNull(),
  tone: text("tone").notNull(),
  visualStyle: text("visual_style").notNull(),
  targetRuntime: integer("target_runtime").notNull(),
  audience: text("audience").notNull(),
  status: text("status").notNull().default("draft"),
  progress: integer("progress").notNull().default(0),
  keyVisual: text("key_visual"),
  ...timestamps,
});

export const agentRunsTable = pgTable("agent_runs", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull(),
  agentType: text("agent_type").notNull(),
  label: text("label").notNull(),
  detail: text("detail").notNull(),
  status: text("status").notNull().default("queued"),
  progress: integer("progress").notNull().default(0),
  dependency: text("dependency"),
  input: jsonb("input").$type<Record<string, unknown>>(),
  output: jsonb("output").$type<Record<string, unknown>>(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const storyActsTable = pgTable("story_acts", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  sequence: integer("sequence").notNull(),
  ...timestamps,
});

export const scenesTable = pgTable("scenes", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull(),
  actId: integer("act_id").notNull(),
  sceneNumber: integer("scene_number").notNull(),
  heading: text("heading").notNull(),
  location: text("location").notNull(),
  time: text("time").notNull(),
  description: text("description").notNull(),
  dialogue: text("dialogue").notNull(),
  characterNames: text("character_names").array().notNull().default([]),
  status: text("status").notNull().default("approved"),
  revision: integer("revision").notNull().default(1),
  ...timestamps,
});

export const charactersTable = pgTable("characters", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  personality: text("personality").notNull(),
  motivations: text("motivations").notNull(),
  appearance: text("appearance").notNull(),
  relationships: text("relationships").notNull(),
  storyArc: text("story_arc").notNull(),
  visualPrompt: text("visual_prompt").notNull(),
  portraitUrl: text("portrait_url"),
  appearanceLocked: boolean("appearance_locked").notNull().default(false),
  ...timestamps,
});

export const locationsTable = pgTable("locations", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull(),
  name: text("name").notNull(),
  atmosphere: text("atmosphere").notNull(),
  productionNotes: text("production_notes").notNull(),
  ...timestamps,
});

export const conceptAssetsTable = pgTable("concept_assets", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull(),
  type: text("type").notNull(),
  prompt: text("prompt").notNull(),
  assetUrl: text("asset_url"),
  status: text("status").notNull().default("planned"),
  locked: boolean("locked").notNull().default(false),
  ...timestamps,
});

export const storyboardFramesTable = pgTable("storyboard_frames", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull(),
  sceneId: integer("scene_id").notNull(),
  shotNumber: text("shot_number").notNull(),
  description: text("description").notNull(),
  framing: text("framing").notNull(),
  cameraMovement: text("camera_movement").notNull(),
  dialogue: text("dialogue").notNull(),
  duration: integer("duration").notNull(),
  imageUrl: text("image_url"),
  status: text("status").notNull().default("needs review"),
  locked: boolean("locked").notNull().default(false),
  ...timestamps,
});

export const shotsTable = pgTable("shots", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull(),
  sceneId: integer("scene_id").notNull(),
  shotType: text("shot_type").notNull(),
  lens: text("lens").notNull(),
  lighting: text("lighting").notNull(),
  transition: text("transition").notNull(),
  ...timestamps,
});

export const productionBudgetsTable = pgTable("production_budgets", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull(),
  total: integer("total").notNull(),
  currency: text("currency").notNull().default("USD"),
  categories: jsonb("categories")
    .$type<Array<{ category: string; amount: number; percentage: number }>>()
    .notNull(),
  ...timestamps,
});

export const productionSchedulesTable = pgTable("production_schedules", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull(),
  day: integer("day").notNull(),
  date: text("date").notNull(),
  scene: text("scene").notNull(),
  location: text("location").notNull(),
  cast: text("cast").notNull(),
  timeOfDay: text("time_of_day").notNull(),
  duration: text("duration").notNull(),
  notes: text("notes").notNull(),
  ...timestamps,
});

export const generatedAssetsTable = pgTable("generated_assets", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  objectPath: text("object_path"),
  prompt: text("prompt").notNull(),
  status: text("status").notNull().default("planned"),
  ...timestamps,
});

export const revisionsTable = pgTable("revisions", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  previousVersion: integer("previous_version").notNull(),
  newVersion: integer("new_version").notNull(),
  instruction: text("instruction").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dependenciesTable = pgTable("dependencies", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull(),
  sourceEntityType: text("source_entity_type").notNull(),
  sourceEntityId: integer("source_entity_id").notNull(),
  targetEntityType: text("target_entity_type").notNull(),
  targetEntityId: integer("target_entity_id").notNull(),
  status: text("status").notNull().default("current"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const directorMessagesTable = pgTable("director_messages", {
  id: serial("id").primaryKey(),
  productionId: integer("production_id").notNull(),
  message: text("message").notNull(),
  response: text("response").notNull(),
  requiresConfirmation: boolean("requires_confirmation").notNull().default(true),
  affectedAssets: text("affected_assets").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProductionSchema = createInsertSchema(productionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProduction = z.infer<typeof insertProductionSchema>;
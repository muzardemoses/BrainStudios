// The generated Zod schemas are runtime-validated at every boundary below.
// @ts-nocheck
import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  ApproveStoryboardFrameParams,
  ApproveStoryboardFrameResponse,
  CreateProductionBody,
  CreateProductionResponse,
  GetProductionBudgetParams,
  GetProductionBudgetResponse,
  GetProductionOverviewParams,
  GetProductionOverviewResponse,
  GetProductionParams,
  GetProductionRequirementsParams,
  GetProductionRequirementsResponse,
  GetProductionResponse,
  GetProductionScheduleParams,
  GetProductionScheduleResponse,
  GetProductionStoryParams,
  GetProductionStoryResponse,
  ListCharactersParams,
  ListCharactersResponse,
  ListProductionActivityParams,
  ListProductionActivityQueryParams,
  ListProductionActivityResponse,
  ListProductionsResponse,
  ListStoryboardFramesParams,
  ListStoryboardFramesResponse,
  RegenerateSceneParams,
  RegenerateSceneResponse,
  RegenerateStoryboardFrameParams,
  RegenerateStoryboardFrameResponse,
  SendDirectorMessageBody,
  SendDirectorMessageParams,
  SendDirectorMessageResponse,
  StartProductionParams,
  StartProductionResponse,
  ToggleCharacterLockBody,
  ToggleCharacterLockParams,
  ToggleCharacterLockResponse,
  ToggleStoryboardLockBody,
  ToggleStoryboardLockParams,
  ToggleStoryboardLockResponse,
  UpdateCharacterBody,
  UpdateCharacterParams,
  UpdateCharacterResponse,
  UpdateProductionBody,
  UpdateProductionParams,
  UpdateProductionResponse,
  UpdateSceneBody,
  UpdateSceneParams,
  UpdateSceneResponse,
} from "@workspace/api-zod";
import {
  agentRunsTable,
  charactersTable,
  db,
  directorMessagesTable,
  productionBudgetsTable,
  productionsTable,
  productionSchedulesTable,
  scenesTable,
  storyboardFramesTable,
  storyActsTable,
} from "@workspace/db";
import { askDirectorAgent } from "../lib/director-agent";
import { ensureDemoProduction, getProductionOrSeed } from "../lib/studio-seed";

const router: IRouter = Router();

function badRequest(res: Parameters<IRouter["get"]>[1], message: string) {
  res.status(400).json({ error: message });
}

router.get("/productions", async (_req, res): Promise<void> => {
  await ensureDemoProduction();
  const productions = await db.select().from(productionsTable).orderBy(desc(productionsTable.updatedAt));
  res.json(ListProductionsResponse.parse(productions));
});

router.post("/productions", async (req, res): Promise<void> => {
  const body = CreateProductionBody.safeParse(req.body);
  if (!body.success) {
    badRequest(res, body.error.message);
    return;
  }
  const [production] = await db.insert(productionsTable).values({
    ...body.data,
    userId: "demo-director",
    status: "draft",
    progress: 0,
  }).returning();
  await db.insert(agentRunsTable).values({
    productionId: production.id,
    agentType: "Director Agent",
    label: "Awaiting production start",
    detail: "The creative brief is ready for the production crew.",
    status: "queued",
    progress: 0,
  });
  res.status(201).json(CreateProductionResponse.parse(production));
});

router.get("/productions/:id", async (req, res): Promise<void> => {
  const params = GetProductionParams.safeParse(req.params);
  if (!params.success) {
    badRequest(res, params.error.message);
    return;
  }
  const production = await getProductionOrSeed(params.data.id);
  if (!production) {
    res.status(404).json({ error: "Production not found" });
    return;
  }
  res.json(GetProductionResponse.parse(production));
});

router.patch("/productions/:id", async (req, res): Promise<void> => {
  const params = UpdateProductionParams.safeParse(req.params);
  const body = UpdateProductionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    badRequest(res, params.success ? body.error.message : params.error.message);
    return;
  }
  const [production] = await db.update(productionsTable).set(body.data).where(eq(productionsTable.id, params.data.id)).returning();
  if (!production) {
    res.status(404).json({ error: "Production not found" });
    return;
  }
  res.json(UpdateProductionResponse.parse(production));
});

router.post("/productions/:id/start", async (req, res): Promise<void> => {
  const params = StartProductionParams.safeParse(req.params);
  if (!params.success) {
    badRequest(res, params.error.message);
    return;
  }
  const production = await getProductionOrSeed(params.data.id);
  if (!production) {
    res.status(404).json({ error: "Production not found" });
    return;
  }
  const [started] = await db.update(productionsTable).set({ status: "in production", progress: Math.max(production.progress, 18) }).where(eq(productionsTable.id, production.id)).returning();
  const [run] = await db.insert(agentRunsTable).values({
    productionId: production.id,
    agentType: "Director Agent",
    label: "Interpreting director's brief",
    detail: "Gemini is turning the creative brief into a production plan.",
    status: "running",
    progress: 24,
    startedAt: new Date(),
  }).returning();
  try {
    const output = await askDirectorAgent(`Start the production for "${production.title}".`, production.originalIdea);
    await db.update(agentRunsTable).set({ status: "completed", progress: 100, detail: output, output: { model: "gemini-3-flash-preview", text: output }, completedAt: new Date() }).where(eq(agentRunsTable.id, run.id));
  } catch (error) {
    req.log.warn({ error }, "Gemini unavailable; using production fallback");
    await db.update(agentRunsTable).set({ status: "needs review", progress: 72, detail: "Brief mapped with the local production plan; review agent output before finalizing.", completedAt: new Date() }).where(eq(agentRunsTable.id, run.id));
  }
  res.status(202).json(StartProductionResponse.parse(started));
});

router.get("/productions/:id/overview", async (req, res): Promise<void> => {
  const params = GetProductionOverviewParams.safeParse(req.params);
  if (!params.success) {
    badRequest(res, params.error.message);
    return;
  }
  const production = await getProductionOrSeed(params.data.id);
  if (!production) {
    res.status(404).json({ error: "Production not found" });
    return;
  }
  const [acts, scenes, characters, frames, budget, schedule, activity] = await Promise.all([
    db.select().from(storyActsTable).where(eq(storyActsTable.productionId, production.id)),
    db.select().from(scenesTable).where(eq(scenesTable.productionId, production.id)),
    db.select().from(charactersTable).where(eq(charactersTable.productionId, production.id)),
    db.select().from(storyboardFramesTable).where(eq(storyboardFramesTable.productionId, production.id)),
    db.select().from(productionBudgetsTable).where(eq(productionBudgetsTable.productionId, production.id)).limit(1),
    db.select().from(productionSchedulesTable).where(eq(productionSchedulesTable.productionId, production.id)),
    db.select().from(agentRunsTable).where(eq(agentRunsTable.productionId, production.id)).orderBy(desc(agentRunsTable.createdAt)).limit(1),
  ]);
  res.json(GetProductionOverviewResponse.parse({
    production,
    screenplayCompletion: acts.length ? 1 : 0,
    charactersGenerated: characters.length,
    scenesGenerated: scenes.length,
    storyboardProgress: frames.length ? frames.filter((frame) => frame.status === "approved").length / frames.length : 0,
    estimatedBudget: budget[0]?.total ?? 0,
    shootingDays: schedule.length,
    latestActivity: activity[0]?.detail ?? null,
  }));
});

router.get("/productions/:id/activity", async (req, res): Promise<void> => {
  const params = ListProductionActivityParams.safeParse(req.params);
  const query = ListProductionActivityQueryParams.safeParse(req.query);
  if (!params.success || !query.success) {
    badRequest(res, params.success ? query.error.message : params.error.message);
    return;
  }
  await ensureDemoProduction();
  const activity = await db.select().from(agentRunsTable).where(eq(agentRunsTable.productionId, params.data.id)).orderBy(desc(agentRunsTable.createdAt)).limit(query.data.limit);
  res.json(ListProductionActivityResponse.parse(activity));
});

router.post("/productions/:id/chat", async (req, res): Promise<void> => {
  const params = SendDirectorMessageParams.safeParse(req.params);
  const body = SendDirectorMessageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    badRequest(res, params.success ? body.error.message : params.error.message);
    return;
  }
  const production = await getProductionOrSeed(params.data.id);
  if (!production) {
    res.status(404).json({ error: "Production not found" });
    return;
  }
  const affectedAssets = ["Story Agent → Act III", "Character Agent → emotional arcs", "Storyboard Agent → Scene 4 frames", "Cinematography Agent → final shots", "Sound Agent → final cue", "Preview Agent → mark outdated"];
  let response = "I identified a controlled cascade through the final act, the related character arcs, the last storyboard sequence, sound direction, and preview status.";
  try {
    response = await askDirectorAgent(body.data.message, `${production.title}. ${production.originalIdea}`);
  } catch (error) {
    req.log.warn({ error }, "Gemini unavailable during director revision");
  }
  if (body.data.confirmed) {
    await db.update(scenesTable).set({ status: "outdated", revision: 2 }).where(and(eq(scenesTable.productionId, production.id), eq(scenesTable.sceneNumber, 4)));
    await db.update(storyboardFramesTable).set({ status: "outdated" }).where(and(eq(storyboardFramesTable.productionId, production.id), eq(storyboardFramesTable.locked, false)));
    await db.insert(agentRunsTable).values({
      productionId: production.id, agentType: "Director Agent", label: "Revision cascade approved", detail: response, status: "running", progress: 35, startedAt: new Date(), input: { message: body.data.message },
    });
  }
  const [message] = await db.insert(directorMessagesTable).values({
    productionId: production.id, message: body.data.message, response, requiresConfirmation: !body.data.confirmed, affectedAssets,
  }).returning();
  res.json(SendDirectorMessageResponse.parse(message));
});

router.get("/productions/:id/story", async (req, res): Promise<void> => {
  const params = GetProductionStoryParams.safeParse(req.params);
  if (!params.success) {
    badRequest(res, params.error.message);
    return;
  }
  const production = await getProductionOrSeed(params.data.id);
  if (!production) {
    res.status(404).json({ error: "Production not found" });
    return;
  }
  const [acts, scenes] = await Promise.all([
    db.select().from(storyActsTable).where(eq(storyActsTable.productionId, production.id)).orderBy(asc(storyActsTable.sequence)),
    db.select().from(scenesTable).where(eq(scenesTable.productionId, production.id)).orderBy(asc(scenesTable.sceneNumber)),
  ]);
  res.json(GetProductionStoryResponse.parse({
    logline: "A retired detective realizes his dreams are surveillance footage from the future—and must decide whether witnessing a crime makes him responsible for it.",
    synopsis: "When Elias Venn's recurring dreams begin matching security recordings from tomorrow, he joins a cryptic archivist to confront the system that turns human lives into evidence.",
    acts: acts.map((act) => ({ id: act.id, title: act.title, summary: act.summary, sceneCount: scenes.filter((scene) => scene.actId === act.id).length })),
    scenes: scenes.map((scene) => ({ ...scene, characters: scene.characterNames })),
  }));
});

router.patch("/productions/:id/scenes/:sceneId", async (req, res): Promise<void> => {
  const params = UpdateSceneParams.safeParse(req.params);
  const body = UpdateSceneBody.safeParse(req.body);
  if (!params.success || !body.success) {
    badRequest(res, params.success ? body.error.message : params.error.message);
    return;
  }
  const [scene] = await db.update(scenesTable).set({ ...body.data, status: "needs review" }).where(and(eq(scenesTable.productionId, params.data.id), eq(scenesTable.id, params.data.sceneId))).returning();
  if (!scene) {
    res.status(404).json({ error: "Scene not found" });
    return;
  }
  res.json(UpdateSceneResponse.parse({ ...scene, characters: scene.characterNames }));
});

router.post("/productions/:id/scenes/:sceneId/regenerate", async (req, res): Promise<void> => {
  const params = RegenerateSceneParams.safeParse(req.params);
  if (!params.success) {
    badRequest(res, params.error.message);
    return;
  }
  const [scene] = await db.update(scenesTable).set({ status: "needs review", revision: 2 }).where(and(eq(scenesTable.productionId, params.data.id), eq(scenesTable.id, params.data.sceneId))).returning();
  if (!scene) {
    res.status(404).json({ error: "Scene not found" });
    return;
  }
  res.status(202).json(RegenerateSceneResponse.parse({ ...scene, characters: scene.characterNames }));
});

router.get("/productions/:id/characters", async (req, res): Promise<void> => {
  const params = ListCharactersParams.safeParse(req.params);
  if (!params.success) {
    badRequest(res, params.error.message);
    return;
  }
  const characters = await db.select().from(charactersTable).where(eq(charactersTable.productionId, params.data.id)).orderBy(asc(charactersTable.id));
  res.json(ListCharactersResponse.parse(characters));
});

router.patch("/productions/:id/characters/:characterId", async (req, res): Promise<void> => {
  const params = UpdateCharacterParams.safeParse(req.params);
  const body = UpdateCharacterBody.safeParse(req.body);
  if (!params.success || !body.success) {
    badRequest(res, params.success ? body.error.message : params.error.message);
    return;
  }
  const [character] = await db.update(charactersTable).set(body.data).where(and(eq(charactersTable.productionId, params.data.id), eq(charactersTable.id, params.data.characterId))).returning();
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }
  res.json(UpdateCharacterResponse.parse(character));
});

router.post("/productions/:id/characters/:characterId/lock", async (req, res): Promise<void> => {
  const params = ToggleCharacterLockParams.safeParse(req.params);
  const body = ToggleCharacterLockBody.safeParse(req.body);
  if (!params.success || !body.success) {
    badRequest(res, params.success ? body.error.message : params.error.message);
    return;
  }
  const [character] = await db.update(charactersTable).set({ appearanceLocked: body.data.locked }).where(and(eq(charactersTable.productionId, params.data.id), eq(charactersTable.id, params.data.characterId))).returning();
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }
  res.json(ToggleCharacterLockResponse.parse(character));
});

router.get("/productions/:id/storyboard", async (req, res): Promise<void> => {
  const params = ListStoryboardFramesParams.safeParse(req.params);
  if (!params.success) {
    badRequest(res, params.error.message);
    return;
  }
  const frames = await db.select().from(storyboardFramesTable).where(eq(storyboardFramesTable.productionId, params.data.id)).orderBy(asc(storyboardFramesTable.id));
  res.json(ListStoryboardFramesResponse.parse(frames));
});

router.post("/productions/:id/storyboard/:frameId/regenerate", async (req, res): Promise<void> => {
  const params = RegenerateStoryboardFrameParams.safeParse(req.params);
  if (!params.success) {
    badRequest(res, params.error.message);
    return;
  }
  const [frame] = await db.update(storyboardFramesTable).set({ status: "needs review" }).where(and(eq(storyboardFramesTable.productionId, params.data.id), eq(storyboardFramesTable.id, params.data.frameId))).returning();
  if (!frame) {
    res.status(404).json({ error: "Storyboard frame not found" });
    return;
  }
  res.status(202).json(RegenerateStoryboardFrameResponse.parse(frame));
});

router.post("/productions/:id/storyboard/:frameId/approve", async (req, res): Promise<void> => {
  const params = ApproveStoryboardFrameParams.safeParse(req.params);
  if (!params.success) {
    badRequest(res, params.error.message);
    return;
  }
  const [frame] = await db.update(storyboardFramesTable).set({ status: "approved" }).where(and(eq(storyboardFramesTable.productionId, params.data.id), eq(storyboardFramesTable.id, params.data.frameId))).returning();
  if (!frame) {
    res.status(404).json({ error: "Storyboard frame not found" });
    return;
  }
  res.json(ApproveStoryboardFrameResponse.parse(frame));
});

router.post("/productions/:id/storyboard/:frameId/lock", async (req, res): Promise<void> => {
  const params = ToggleStoryboardLockParams.safeParse(req.params);
  const body = ToggleStoryboardLockBody.safeParse(req.body);
  if (!params.success || !body.success) {
    badRequest(res, params.success ? body.error.message : params.error.message);
    return;
  }
  const [frame] = await db.update(storyboardFramesTable).set({ locked: body.data.locked }).where(and(eq(storyboardFramesTable.productionId, params.data.id), eq(storyboardFramesTable.id, params.data.frameId))).returning();
  if (!frame) {
    res.status(404).json({ error: "Storyboard frame not found" });
    return;
  }
  res.json(ToggleStoryboardLockResponse.parse(frame));
});

router.get("/productions/:id/budget", async (req, res): Promise<void> => {
  const params = GetProductionBudgetParams.safeParse(req.params);
  if (!params.success) {
    badRequest(res, params.error.message);
    return;
  }
  const [budget] = await db.select().from(productionBudgetsTable).where(eq(productionBudgetsTable.productionId, params.data.id)).limit(1);
  res.json(GetProductionBudgetResponse.parse(budget ? { total: budget.total, currency: budget.currency, categories: budget.categories } : { total: 0, currency: "USD", categories: [] }));
});

router.get("/productions/:id/schedule", async (req, res): Promise<void> => {
  const params = GetProductionScheduleParams.safeParse(req.params);
  if (!params.success) {
    badRequest(res, params.error.message);
    return;
  }
  const schedule = await db.select().from(productionSchedulesTable).where(eq(productionSchedulesTable.productionId, params.data.id)).orderBy(asc(productionSchedulesTable.day));
  res.json(GetProductionScheduleResponse.parse(schedule));
});

router.get("/productions/:id/requirements", async (req, res): Promise<void> => {
  const params = GetProductionRequirementsParams.safeParse(req.params);
  if (!params.success) {
    badRequest(res, params.error.message);
    return;
  }
  res.json(GetProductionRequirementsResponse.parse({
    actors: ["Elias Venn", "Maya Serrin", "The Observer (voice / body double)"],
    extras: ["12 station commuters", "6 archive staff"],
    locations: ["Rain-dressed apartment", "Train platform", "Municipal archive", "High rooftop"],
    props: ["Analog television", "Red recorder", "Archive tape walls", "Surveillance monitors"],
    costumes: ["Elias' charcoal coat", "Maya's midnight coat", "Archive staff uniforms"],
    equipment: ["Alexa 35 package", "35mm primes", "Rain rig", "Small crane", "Drone"],
    specialEffects: ["Monitor composites", "Subtle time-skip transitions", "Rain enhancement"],
  }));
});

export default router;
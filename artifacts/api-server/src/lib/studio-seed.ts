import { asc, eq } from "drizzle-orm";
import {
  agentRunsTable,
  charactersTable,
  db,
  productionBudgetsTable,
  productionsTable,
  productionSchedulesTable,
  scenesTable,
  storyboardFramesTable,
  storyActsTable,
} from "@workspace/db";

export async function ensureDemoProduction() {
  const [existing] = await db.select().from(productionsTable).orderBy(asc(productionsTable.id)).limit(1);
  if (existing) return existing;

  const [production] = await db
    .insert(productionsTable)
    .values({
      title: "The Lucid Witness",
      originalIdea: "A retired detective discovers that every dream he has ever had is actually surveillance footage from the future.",
      genre: "Neo-noir science fiction",
      tone: "Haunting, cerebral, intimate",
      visualStyle: "Analog future noir",
      targetRuntime: 15,
      audience: "Elevated genre audiences",
      status: "in production",
      progress: 68,
      keyVisual: null,
    })
    .returning();

  const [actOne, actTwo, actThree] = await db
    .insert(storyActsTable)
    .values([
      { productionId: production.id, title: "ACT I — THE SIGNAL", summary: "Elias realizes his dreams know more than he does.", sequence: 1 },
      { productionId: production.id, title: "ACT II — THE OBSERVER", summary: "The footage begins to predict a crime in real time.", sequence: 2 },
      { productionId: production.id, title: "ACT III — THE WITNESS", summary: "Elias chooses what future he is willing to see.", sequence: 3 },
    ])
    .returning();

  const scenes = await db
    .insert(scenesTable)
    .values([
      {
        productionId: production.id, actId: actOne.id, sceneNumber: 1, heading: "INT. ELIAS' APARTMENT — PRE-DAWN",
        location: "Elias' apartment", time: "Pre-dawn", description: "A television plays silent security footage of a rain-slick street. Elias wakes before the image changes.",
        dialogue: "ELIAS: I was there. I just haven't been there yet.", characterNames: ["Elias Venn"], status: "approved",
      },
      {
        productionId: production.id, actId: actOne.id, sceneNumber: 2, heading: "EXT. MERIDIAN STATION — NIGHT",
        location: "Meridian Station", time: "Night", description: "Elias follows a location from his dream through a city that seems to recognize him.",
        dialogue: "MAYA (V.O.): Dreams leave fingerprints.", characterNames: ["Elias Venn", "Maya"], status: "approved",
      },
      {
        productionId: production.id, actId: actTwo.id, sceneNumber: 3, heading: "INT. ARCHIVE ROOM — NIGHT",
        location: "Municipal archive", time: "Night", description: "Maya reveals a vault of unsolved crimes recorded years before they occurred.",
        dialogue: "MAYA: The camera doesn't watch the future. It remembers it.", characterNames: ["Maya", "Elias Venn"], status: "needs review",
      },
      {
        productionId: production.id, actId: actThree.id, sceneNumber: 4, heading: "EXT. ROOFTOP — DAWN",
        location: "Riverside tower rooftop", time: "Dawn", description: "Elias confronts the observer behind the lens as the city below enters the moment from his dream.",
        dialogue: "ELIAS: If I change it, do I disappear from the tape?", characterNames: ["Elias Venn", "The Observer"], status: "needs review",
      },
    ])
    .returning();

  await db.insert(charactersTable).values([
    {
      productionId: production.id, name: "Elias Venn", role: "Protagonist", personality: "Methodical, weathered, quietly obsessive",
      motivations: "To understand why the future is calling him a witness.", appearance: "Late 50s, charcoal overcoat, tired observant eyes, silver at the temples.",
      relationships: "Former detective; trusts Maya only when he has no other choice.", storyArc: "Moves from observer to author of his own moral choice.",
      visualPrompt: "Cinematic neo-noir portrait of a retired detective in a rain-dark apartment, analog surveillance glow, 35mm grain.", appearanceLocked: true,
    },
    {
      productionId: production.id, name: "Maya Serrin", role: "Archivist / Catalyst", personality: "Precise, elusive, compassionate beneath control",
      motivations: "To stop the archive from turning people into evidence.", appearance: "Early 30s, dark cropped hair, severe midnight coat, a small red recorder.",
      relationships: "Knows more about Elias' old case than she admits.", storyArc: "Chooses a human connection over preserving the system.",
      visualPrompt: "Cinematic noir portrait of a mysterious archivist, museum-dark palette, practical red recorder, soft edge light.", appearanceLocked: false,
    },
    {
      productionId: production.id, name: "The Observer", role: "Antagonistic presence", personality: "Unseen, patient, clinical",
      motivations: "To preserve every possible outcome.", appearance: "Never fully visible; suggested by reflections, lenses, and fractured monitor light.",
      relationships: "Feeds Elias images while withholding their context.", storyArc: "Revealed as the consequence of Elias' need for certainty.",
      visualPrompt: "Abstract cinematic presence in reflected glass and security monitors, no visible face, analog future noir.", appearanceLocked: true,
    },
  ]);

  await db.insert(storyboardFramesTable).values([
    { productionId: production.id, sceneId: scenes[0].id, shotNumber: "01A", description: "Elias wakes into blue television static.", framing: "Extreme close-up", cameraMovement: "Slow push-in", dialogue: "—", duration: 4, status: "approved", locked: true },
    { productionId: production.id, sceneId: scenes[0].id, shotNumber: "01B", description: "Silent footage fills the room with a future street.", framing: "Wide interior", cameraMovement: "Locked-off", dialogue: "ELIAS: I was there.", duration: 7, status: "approved", locked: false },
    { productionId: production.id, sceneId: scenes[1].id, shotNumber: "02A", description: "Maya appears at the edge of a platform light.", framing: "Medium silhouette", cameraMovement: "Lateral track", dialogue: "MAYA (V.O.): Dreams leave fingerprints.", duration: 5, status: "needs review", locked: false },
    { productionId: production.id, sceneId: scenes[2].id, shotNumber: "03A", description: "Archive tapes form a corridor around Maya.", framing: "Symmetrical wide", cameraMovement: "Dolly forward", dialogue: "MAYA: It remembers it.", duration: 6, status: "needs review", locked: false },
    { productionId: production.id, sceneId: scenes[3].id, shotNumber: "04A", description: "A city at dawn blinks into the exact future frame.", framing: "Aerial wide", cameraMovement: "Crane rise", dialogue: "ELIAS: If I change it…", duration: 8, status: "needs review", locked: false },
  ]);

  await db.insert(productionBudgetsTable).values({
    productionId: production.id,
    total: 84500,
    currency: "USD",
    categories: [
      { category: "Cast", amount: 18000, percentage: 21 },
      { category: "Crew", amount: 24700, percentage: 29 },
      { category: "Locations", amount: 8800, percentage: 10 },
      { category: "Equipment", amount: 12600, percentage: 15 },
      { category: "Wardrobe & props", amount: 5900, percentage: 7 },
      { category: "Post-production", amount: 9500, percentage: 11 },
      { category: "Contingency", amount: 5000, percentage: 6 },
    ],
  });

  await db.insert(productionSchedulesTable).values([
    { productionId: production.id, day: 1, date: "Day 01", scene: "Scene 1 — Apartment", location: "Elias' apartment", cast: "Elias", timeOfDay: "Pre-dawn", duration: "6 hrs", notes: "Rain rig + practical TV glow." },
    { productionId: production.id, day: 2, date: "Day 02", scene: "Scene 2 — Station", location: "Meridian Station", cast: "Elias, Maya", timeOfDay: "Night", duration: "8 hrs", notes: "Control platform extras and rain cover." },
    { productionId: production.id, day: 3, date: "Day 03", scene: "Scene 3 — Archive", location: "Municipal archive", cast: "Elias, Maya", timeOfDay: "Night", duration: "7 hrs", notes: "Build practical tape wall and monitor loop." },
    { productionId: production.id, day: 4, date: "Day 04", scene: "Scene 4 — Rooftop", location: "Riverside tower rooftop", cast: "Elias", timeOfDay: "Dawn", duration: "5 hrs", notes: "Weather hold; drone shot at first light." },
  ]);

  await db.insert(agentRunsTable).values([
    { productionId: production.id, agentType: "Director Agent", label: "Production plan assembled", detail: "Mapped story dependencies and production lanes.", status: "completed", progress: 100, completedAt: new Date() },
    { productionId: production.id, agentType: "Story Agent", label: "Screenplay draft ready", detail: "Four scenes structured across three acts.", status: "completed", progress: 100, completedAt: new Date() },
    { productionId: production.id, agentType: "Character Agent", label: "Cast bible in review", detail: "Three visual profiles prepared; two appearances locked.", status: "needs review", progress: 86, completedAt: new Date() },
    { productionId: production.id, agentType: "Storyboard Agent", label: "Awaiting final-act direction", detail: "Five camera-ready frames generated from the scene map.", status: "waiting", progress: 68, dependency: "Scene 4 revision" },
    { productionId: production.id, agentType: "Production Agent", label: "Budget baseline complete", detail: "Four-day shooting plan balanced against requirements.", status: "completed", progress: 100, completedAt: new Date() },
  ]);

  return production;
}

export async function getProductionOrSeed(id: number) {
  await ensureDemoProduction();
  const [production] = await db.select().from(productionsTable).where(eq(productionsTable.id, id));
  return production;
}
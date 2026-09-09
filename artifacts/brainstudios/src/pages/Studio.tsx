import { useEffect, useRef, useState, type FormEvent } from "react";
import { UserButton, useUser } from "@clerk/react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  AudioLines,
  Check,
  ChevronRight,
  CircleHelp,
  Clapperboard,
  Clock3,
  Copy,
  FileText,
  Film,
  Image as ImageIcon,
  Layers3,
  Leaf,
  Loader2,
  Maximize2,
  Menu,
  MessageSquare,
  Monitor,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRealProductions } from "@/components/ProductionApi";
import { runningJob, sceneDuration } from "@workspace/video-workflow";
import { authEnabled } from "@/lib/auth";
import {
  createProject,
  demoProject,
  invalidateScenes,
  readWorkspace,
  sceneTime,
  steps,
  storageKey,
  timecode,
  type Project,
  type Scene,
} from "@/lib/production";

const stepIcons = [
  MessageSquare,
  FileText,
  Layers3,
  Clapperboard,
  Film,
  ImageIcon,
  Send,
];
const stageActions = [
  "Create timed script",
  "Approve script",
  "Generate scenes",
  "Continue generation",
  "Assemble preview",
  "Use this thumbnail",
  "Save publishing details",
];
type Job = { projectId: string; kind: "scenes" | "assembly" };
function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`}>
      <AudioLines size={small ? 17 : 23} strokeWidth={2.4} />
    </span>
  );
}
function Account() {
  const { isSignedIn, user } = useUser();
  return isSignedIn ? (
    <>
      <UserButton />
      <span>
        <strong>{user.firstName || "My workspace"}</strong>
        <small>Personal workspace</small>
      </span>
    </>
  ) : (
    <a href={`${import.meta.env.BASE_URL}sign-in`} className="sign-in-link">
      Sign in to your account <ArrowRight size={15} />
    </a>
  );
}

export default function Studio() {
  const real = useRealProductions();
  const [workspace, setWorkspace] = useState(readWorkspace);
  const [liveDrafts, setLiveDrafts] = useState<
    Record<string, Partial<Project>>
  >({});
  const allProjects = [...real.projects, ...workspace.projects];
  const storedProject =
    allProjects.find((p) => p.id === workspace.activeId) ||
    workspace.projects[0];
  const project = { ...storedProject, ...liveDrafts[storedProject.id] };
  const live = project.mode === "live";
  const liveJob = live ? runningJob(storedProject) : undefined;
  const unfinished = live
    ? storedProject.jobs.filter((j) => ["failed", "paused"].includes(j.status))
    : [];
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestId = useRef(crypto.randomUUID());
  const [view, setView] = useState(project.stage === 7 ? 6 : project.stage);
  const [newProject, setNewProject] = useState(false);
  const [draft, setDraft] = useState("");
  const [duration, setDuration] = useState(60);
  const [format, setFormat] = useState<Project["format"]>("16:9");
  const [style, setStyle] = useState("Cinematic");
  const [job, setJob] = useState<Job | null>(null);
  const [sceneEditor, setSceneEditor] = useState<{
    index: number;
    scene: Scene;
    version: number;
  } | null>(null);
  const [help, setHelp] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"conversation" | "canvas">(
    "canvas",
  );
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const chatEnd = useRef<HTMLDivElement>(null);
  const canvasScroll = useRef<HTMLDivElement>(null);
  const previousMessageCount = useRef(project.messages.length);
  const ready = project.scenes.filter((s) => s.ready).length;
  const busy = live
    ? Boolean(liveJob) || real.pending
    : job?.projectId === project.id;
  const completed = project.stage === 7;
  const sceneDirty =
    sceneEditor &&
    (["title", "narration", "visual"] as const).some(
      (k) =>
        sceneEditor.scene[k] !== storedProject.scenes[sceneEditor.index]?.[k],
    );
  const restoring =
    !allProjects.some((p) => p.id === workspace.activeId) &&
    (!real.loaded || Boolean(real.userId && real.loading));
  const update = (fn: (p: Project) => Project) => {
    if (live) {
      const next = fn(project);
      setLiveDrafts((d) => ({
        ...d,
        [project.id]: {
          version: d[project.id]?.version ?? storedProject.version,
          title: next.title,
          description: next.description,
          tags: next.tags,
          headline: next.headline,
          thumbnail: next.thumbnail,
          stage: next.stage,
        },
      }));
    } else
      setWorkspace((w) => ({
        ...w,
        projects: w.projects.map((p) => (p.id === w.activeId ? fn(p) : p)),
      }));
  };
  async function saveLiveDraft(): Promise<Project> {
    if (!liveDrafts[project.id]) return storedProject;
    const {
      stage: _stage,
      version: draftVersion,
      ...draftFields
    } = liveDrafts[project.id];
    const fields = Object.fromEntries(
      Object.entries(draftFields).filter(
        ([key, value]) => value !== storedProject[key as keyof Project],
      ),
    );
    if (!Object.keys(fields).length) {
      setLiveDrafts((d) => {
        const copy = { ...d };
        delete copy[project.id];
        return copy;
      });
      return storedProject;
    }
    const saved = await real.mutate(
      `/videos/${project.id}`,
      { ...fields, version: draftVersion ?? storedProject.version },
      "PATCH",
    );
    setLiveDrafts((d) => {
      const copy = { ...d };
      delete copy[project.id];
      return copy;
    });
    return saved;
  }
  async function commandLive(
    command: string,
    extra: Record<string, unknown> = {},
  ) {
    try {
      const saved = command === "pause" ? storedProject : await saveLiveDraft();
      const next = await real.mutate(`/videos/${project.id}/commands`, {
        command,
        version: saved.version,
        ...extra,
      });
      setView(Math.min(next.stage, 6));
      return next;
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "The production request failed.",
      );
      void real.refresh();
      return undefined;
    }
  }
  const thumbnailImage = (i: number) =>
    live
      ? project.thumbnails[i]?.url || ""
      : project.scenes[[0, 3, 5][i]]?.image || "";
  async function downloadAsset(asset: "video" | "thumbnail") {
    try {
      await saveLiveDraft();
      const { url } = await real.request<{ url: string }>(
        `/videos/${project.id}/download/${asset}`,
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "";
      a.click();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Download failed.");
    }
  }
  useEffect(() => {
    if (live)
      setView((v) =>
        storedProject.stage === 5 && v === 4
          ? 4
          : Math.min(storedProject.stage, 6),
      );
  }, [storedProject.id, storedProject.stage]);
  const liveAction = unfinished.length
    ? unfinished.some((j) => j.status === "paused")
      ? "Resume production"
      : "Retry failed work"
    : project.stage === 5 &&
        (project.thumbnails.length < 3 || project.thumbnailStale)
      ? "Generate thumbnails"
      : project.stage === 4
        ? "Assemble video"
        : stageActions[project.stage];
  useEffect(() => {
    if (Object.keys(liveDrafts).length === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [liveDrafts]);
  const say = (text: string) =>
    update((p) => ({
      ...p,
      messages: [...p.messages, { role: "assistant", text }],
    }));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [workspace]);
  useEffect(() => {
    if (project.messages.length > previousMessageCount.current)
      chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    previousMessageCount.current = project.messages.length;
  }, [project.messages.length]);
  useEffect(() => {
    canvasScroll.current?.scrollTo({ top: 0 });
  }, [view, project.id, newProject]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!job) return;
    const target = workspace.projects.find((p) => p.id === job.projectId);
    if (!target) {
      setJob(null);
      return;
    }
    if (job.kind === "scenes" && target.scenes.every((s) => s.ready)) {
      setWorkspace((w) => ({
        ...w,
        projects: w.projects.map((p) =>
          p.id === job.projectId
            ? {
                ...p,
                stage: 4,
                messages: [
                  ...p.messages,
                  {
                    role: "assistant",
                    text: "All six sample scenes are ready. Review their visual directions, then assemble a timed storyboard preview. No video has been rendered.",
                  },
                ],
              }
            : p,
        ),
      }));
      setJob(null);
      return;
    }
    const timer = setTimeout(
      () => {
        setWorkspace((w) => ({
          ...w,
          projects: w.projects.map((p) => {
            if (p.id !== job.projectId) return p;
            if (job.kind === "assembly")
              return {
                ...p,
                stage: 5,
                messages: [
                  ...p.messages,
                  {
                    role: "assistant",
                    text: "Your storyboard preview is assembled with all six scenes and timed captions. Next, choose a thumbnail. This preview uses still images; rendered video and audio will be connected later.",
                  },
                ],
              };
            const next = p.scenes.findIndex((s) => !s.ready);
            return {
              ...p,
              scenes: p.scenes.map((s, i) =>
                i === next ? { ...s, ready: true } : s,
              ),
            };
          }),
        }));
        if (job.kind === "assembly") {
          setJob(null);
          setNotice("Storyboard preview is ready.");
        }
      },
      job.kind === "assembly" ? 2200 : 1300,
    );
    return () => clearTimeout(timer);
  }, [job, workspace.projects]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () => setPlayhead((t) => Math.min(t + 1, project.duration)),
      1000,
    );
    return () => clearInterval(timer);
  }, [playing, project.duration]);
  useEffect(() => {
    if (playhead >= project.duration) setPlaying(false);
  }, [playhead, project.duration]);

  function switchProject(id: string) {
    setJob(null);
    const next = allProjects.find((p) => p.id === id)!;
    setWorkspace((w) => ({ ...w, activeId: id }));
    setView(Math.min(next.stage, 6));
    setNewProject(false);
    setMobileNav(false);
    setPlaying(false);
    setPlayhead(0);
    setDraft("");
  }
  function startNew() {
    setJob(null);
    setNewProject(true);
    setDraft("");
    setMobileNav(false);
    setMobilePanel("conversation");
    setPlaying(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || (!newProject && busy) || real.pending) return;
    if (newProject && authEnabled) {
      if (!real.userId) {
        setNotice(
          "Sign in to create a real production. The sample is always available.",
        );
        return;
      }
      if (!real.ready) {
        setNotice(
          "The production server is unavailable or not configured. Please check the server; the sample is still available.",
        );
        return;
      }
      try {
        const next = await real.mutate("/videos", {
          prompt: draft.trim(),
          duration,
          format,
          style,
          requestId: requestId.current,
        });
        requestId.current = crypto.randomUUID();
        setWorkspace((w) => ({ ...w, activeId: next.id }));
        setView(1);
        setNewProject(false);
        setMobilePanel("canvas");
        setDraft("");
      } catch (e) {
        setNotice(
          e instanceof Error ? e.message : "Production could not be created.",
        );
      }
      return;
    }
    if (!newProject && live) {
      const result = await commandLive("message", { text: draft.trim() });
      if (result) setDraft("");
      return;
    }
    if (newProject) {
      const next = createProject(draft.trim(), duration, format, style);
      setWorkspace((w) => ({
        projects: [next, ...w.projects],
        activeId: next.id,
      }));
      setNewProject(false);
      setView(1);
      setMobilePanel("canvas");
      setPlayhead(0);
    } else {
      update((p) => ({
        ...p,
        messages: [
          ...p.messages,
          { role: "user", text: draft.trim() },
          {
            role: "assistant",
            text: "I’ve saved your direction in this conversation. In this demo, apply it through the timed script or scene cards. Those edits reset later stages so the production stays in sync.",
          },
        ],
      }));
    }
    setDraft("");
  }
  function advance() {
    if (busy) return;
    if (live) {
      void commandLive(unfinished.length ? "retry" : "advance");
      return;
    }
    if (project.stage === 1) {
      update((p) => ({ ...p, stage: 2 }));
      setView(2);
      say(
        "Script approved. Your scene plan pairs each timed section with a visual prompt. Review any scene, or generate the sample previews.",
      );
    } else if (project.stage === 2 || project.stage === 3) {
      update((p) => ({ ...p, stage: 3 }));
      setView(3);
      setJob({ projectId: project.id, kind: "scenes" });
    } else if (project.stage === 4) {
      setView(4);
      setJob({ projectId: project.id, kind: "assembly" });
    } else if (project.stage === 5) {
      if (!project.headline.trim()) {
        setNotice("Add a thumbnail headline before continuing.");
        return;
      }
      update((p) => ({ ...p, stage: 6 }));
      setView(6);
      say(
        "Thumbnail selected. Your publishing draft is ready to edit. Add a title, description, and tags, then save the production package.",
      );
    } else if (project.stage === 6) {
      if (!project.title.trim() || !project.description.trim()) {
        setNotice("Add a title and description before saving.");
        return;
      }
      update((p) => ({ ...p, stage: 7 }));
      setNotice("Publishing details saved. Your demo package is ready.");
      say(
        "Your production package is ready: timed script, scene plan, thumbnail selection, and publishing details. Download it to hand off. Nothing has been uploaded or published.",
      );
    }
  }
  function download() {
    const { messages: _messages, ...data } = project;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            ...data,
            mode: live ? "live" : "mock",
            media: live
              ? "Generated media stored in R2. Download URLs are temporary."
              : "Sample still images; no rendered video or generated audio.",
            scenes: data.scenes.map((s, i) => ({
              ...s,
              time: sceneTime(project, i),
            })),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${
      project.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 60) || "production"
    }-production.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Production package downloaded as JSON.");
  }
  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(
        `${project.title}\n\n${project.description}\n\n${project.tags}`,
      );
      setNotice("Publishing details copied.");
    } catch {
      setNotice("Clipboard unavailable. Select and copy the fields below.");
    }
  }
  async function saveScene(event: FormEvent) {
    event.preventDefault();
    if (!sceneEditor) return;
    if (
      ![
        sceneEditor.scene.title,
        sceneEditor.scene.narration,
        ...(live ? [] : [sceneEditor.scene.visual]),
      ].every((text) => text.trim())
    ) {
      setNotice("Add a scene title, narration, and visual direction.");
      return;
    }
    if (live) {
      try {
        await real.mutate(
          `/videos/${project.id}/scenes/${sceneEditor.scene.id}`,
          {
            title: sceneEditor.scene.title,
            narration: sceneEditor.scene.narration,
            visual: sceneEditor.scene.visual,
            version: sceneEditor.version,
          },
          "PATCH",
        );
        setSceneEditor(null);
        setView(1);
        setNotice(
          "Scene saved. Other clips are preserved; dependent outputs need rebuilding.",
        );
      } catch (e) {
        setNotice(
          e instanceof Error ? e.message : "The scene could not be saved.",
        );
        void real.refresh();
      }
      return;
    }
    update((p) =>
      invalidateScenes(
        p,
        p.scenes.map((s, i) =>
          i === sceneEditor.index ? sceneEditor.scene : s,
        ),
      ),
    );
    setSceneEditor(null);
    setJob(null);
    setPlaying(false);
    setView(1);
    setNotice(
      "Scene saved. Review and approve the updated script to regenerate.",
    );
  }
  const currentScene = Math.min(
    Math.max(project.scenes.length - 1, 0),
    Math.floor(
      playhead / (project.duration / Math.max(project.scenes.length, 1)),
    ),
  );
  function preview(large = false) {
    if (live)
      return project.finalUrl ? (
        <div
          className={`real-video ${project.format === "9:16" ? "portrait" : ""}`}
        >
          <video
            ref={videoRef}
            onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
            controls
            playsInline
            preload="metadata"
            src={project.finalUrl}
            poster={project.scenes[0]?.image}
            aria-label="Assembled production video"
          />
          <div className="subtle-note">
            {project.finalStale
              ? "This cut uses an earlier revision. Reassemble to include your latest scene edits."
              : "Final video · generated scene audio · stored in R2"}
          </div>
        </div>
      ) : (
        <div className="assembly-empty">
          <Film size={32} />
          <p>Your encoded video will appear when assembly finishes.</p>
        </div>
      );
    return (
      <div
        className={`preview-player ${large ? "large" : ""} ${project.format === "9:16" ? "portrait" : ""}`}
      >
        <img
          src={project.scenes[currentScene].image}
          alt={project.scenes[currentScene].title}
        />
        <span className="preview-label">
          STORYBOARD PREVIEW · SAMPLE IMAGERY
        </span>
        <div className="preview-caption">
          <small>SCENE {String(currentScene + 1).padStart(2, "0")}</small>
          <p>{project.scenes[currentScene].narration}</p>
        </div>
        <div className="player-controls">
          <button
            aria-label={playing ? "Pause preview" : "Play preview"}
            onClick={() => {
              if (playhead >= project.duration) setPlayhead(0);
              setPlaying(!playing);
            }}
          >
            {playing ? (
              <Pause size={17} />
            ) : (
              <Play size={17} fill="currentColor" />
            )}
          </button>
          <span>
            {timecode(playhead)} / {timecode(project.duration)}
          </span>
          <input
            disabled={live && busy}
            aria-label="Preview position"
            type="range"
            min="0"
            max={project.duration}
            value={playhead}
            onChange={(e) => setPlayhead(Number(e.target.value))}
          />
          {!large && (
            <button
              aria-label="Expand preview"
              onClick={() => setPreviewOpen(true)}
            >
              <Maximize2 size={16} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="studio-app">
      {restoring && (
        <div className="restore-overlay" role="status">
          <Loader2 size={22} className="spin" /> Restoring your production…
        </div>
      )}
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`studio-sidebar ${mobileNav ? "open" : ""}`}>
        <a href={import.meta.env.BASE_URL} className="brand">
          <Brand />
          <span>
            brainstudios<span className="brand-dot">.</span>
          </span>
        </a>
        <button className="new-video" onClick={startNew}>
          <Plus size={17} /> New video <span>＋</span>
        </button>
        <div className="sidebar-label">WORKSPACE</div>
        <button
          className={`nav-item ${!newProject ? "selected" : ""}`}
          onClick={() => {
            setNewProject(false);
            setMobileNav(false);
          }}
        >
          <Clapperboard size={17} /> Production studio{" "}
          <span className="nav-dot" />
        </button>
        <div className="sidebar-label projects-label">
          YOUR PRODUCTIONS{" "}
          <button aria-label="Create production" onClick={startNew}>
            <Plus size={14} />
          </button>
        </div>
        <div className="project-list">
          {allProjects.map((p) => (
            <button
              key={p.id}
              className={`project-item ${p.id === project.id && !newProject ? "active" : ""}`}
              onClick={() => switchProject(p.id)}
            >
              <span className={`project-dot ${p.stage === 7 ? "done" : ""}`} />
              <span>{p.title}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <span>
              <Sparkles size={16} /> A little idea. A whole video.
            </span>
            <p>
              You bring the spark.
              <br />
              Your studio handles the steps.
            </p>
            <span className="demo-pill">
              {live ? "YOUR AI PRODUCTION TEAM" : "INTERACTIVE DEMO"}
            </span>
          </div>
          <button className="nav-item help-link" onClick={() => setHelp(true)}>
            <CircleHelp size={17} /> How it works <ArrowRight size={14} />
          </button>
          <div className="account">
            {authEnabled ? (
              <Account />
            ) : (
              <>
                <span className="avatar">Y</span>
                <span>
                  <strong>Your workspace</strong>
                  <small>Local demo</small>
                </span>
                <span className="account-status" />
              </>
            )}
          </div>
        </div>
      </aside>
      <div className="studio-body">
        <header className="studio-header">
          <div className="breadcrumb">
            <button
              className="mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>Production studio</strong>
          </div>
          <div className="header-right">
            <span className="local-save">
              <span className={storageError ? "warning-dot" : "saved-dot"} />
              {storageError
                ? "Changes not saved"
                : live
                  ? liveDrafts[project.id]
                    ? "Unsaved changes"
                    : "Saved to your account"
                  : "Saved on this device"}
            </span>
            <button
              className="icon-button"
              aria-label="About BrainStudios"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>
        <div className="project-heading">
          <div>
            <div className="eyebrow">
              <span /> YOUR CREATIVE WORKSPACE
            </div>
            <h1>{newProject ? "What will you create next?" : project.title}</h1>
            <p>
              {newProject
                ? "An idea is all you need. Let’s make something worth watching."
                : "From a spark of an idea to a video ready for the world."}
            </p>
          </div>
          <div className="project-actions">
            <span className="mock-badge">
              <Sparkles size={13} />{" "}
              {live ? "Live production" : "Demo production"}
            </span>
            <button
              className="button secondary"
              onClick={download}
              disabled={newProject}
            >
              <ArrowDownToLine size={15} /> Export package
            </button>
          </div>
        </div>
        <div className="mobile-panel-tabs">
          <button
            className={mobilePanel === "conversation" ? "active" : ""}
            onClick={() => setMobilePanel("conversation")}
          >
            Conversation
          </button>
          <button
            className={mobilePanel === "canvas" ? "active" : ""}
            onClick={() => setMobilePanel("canvas")}
          >
            Production canvas
          </button>
        </div>
        <div className="workspace-panels">
          <section
            className={`conversation-panel ${mobilePanel === "conversation" ? "mobile-visible" : ""}`}
            aria-label="Production conversation"
          >
            <div className="panel-title">
              <span>
                <Brand small /> Your production assistant
              </span>
              <span
                className="online-dot"
                title={live ? "Production assistant" : "Demo assistant"}
              />
            </div>
            <div className="conversation-scroll">
              <div className="conversation-intro">
                <span className="intro-icon">
                  <WandSparkles size={23} />
                </span>
                <h2>Big ideas start here.</h2>
                <p>
                  Tell me what’s on your mind.
                  <br />
                  We’ll turn it into something you can watch.
                </p>
              </div>
              {newProject ? (
                <div className="starter-prompts">
                  <span>NEED A LITTLE INSPIRATION?</span>
                  {[
                    "A cinematic minute in the natural world",
                    "A punchy launch video for a new coffee brand",
                    "Explain why the ocean looks blue",
                  ].map((t) => (
                    <button key={t} onClick={() => setDraft(t)}>
                      {t}
                      <ArrowUp size={14} />
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <div className="chat-date">THIS PRODUCTION</div>
                  {project.messages.map((m, i) => (
                    <div
                      className={`message ${m.role}`}
                      key={`${project.id}-${i}`}
                    >
                      <div className="message-author">
                        {m.role === "assistant" ? (
                          <Brand small />
                        ) : (
                          <span className="user-avatar">Y</span>
                        )}
                        <strong>
                          {m.role === "assistant"
                            ? m.agent || "BrainStudios"
                            : "You"}
                        </strong>
                        {m.role === "assistant" && (
                          <span className="assistant-badge">STUDIO</span>
                        )}
                      </div>
                      <p>{m.text}</p>
                      {i === 1 && (
                        <div className="brief-chips">
                          <span>
                            <Clock3 size={12} />
                            {project.duration} seconds
                          </span>
                          <span>
                            <Monitor size={12} />
                            {project.format}
                          </span>
                          <span>
                            <Sparkles size={12} />
                            {project.style}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="assistant-progress">
                    <div>
                      <span className="progress-icon">
                        {busy ? (
                          <Loader2 size={18} className="spin" />
                        ) : (
                          <Layers3 size={18} />
                        )}
                      </span>
                      <strong>
                        {completed
                          ? "Ready for your next big idea"
                          : busy
                            ? "Your production is taking shape"
                            : "A clear path from idea to video"}
                      </strong>
                    </div>
                    <ul>
                      {["Timed script", "Scene plan", "Generated scenes"].map(
                        (label, i) => (
                          <li key={label}>
                            <span
                              className={
                                project.stage > i + 1
                                  ? "mini-check done"
                                  : "mini-check"
                              }
                            >
                              {project.stage > i + 1 ? (
                                <Check size={11} />
                              ) : (
                                <span />
                              )}
                            </span>
                            {label}
                            <small>
                              {i === 2 && project.stage >= 3
                                ? `${ready} / ${project.scenes.length} ready`
                                : project.stage > i + 1
                                  ? "Complete"
                                  : "Up next"}
                            </small>
                          </li>
                        ),
                      )}
                    </ul>
                    {!completed && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          setView(Math.min(project.stage, 6));
                          setMobilePanel("canvas");
                        }}
                      >
                        Open {steps[Math.min(project.stage, 6)].toLowerCase()}
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                </>
              )}
              <div ref={chatEnd} />
            </div>
            <form className="composer-area" onSubmit={submit}>
              {newProject && (
                <div className="creation-settings">
                  <label>
                    Length
                    <select
                      aria-label="Video duration"
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                    >
                      <option value={8}>8 sec · quick video</option>
                      <option value={30}>30 sec</option>
                      <option value={60}>60 sec</option>
                      <option value={90}>90 sec</option>
                      <option value={120}>120 sec</option>
                    </select>
                  </label>
                  <label>
                    Format
                    <select
                      aria-label="Video format"
                      value={format}
                      onChange={(e) =>
                        setFormat(e.target.value as Project["format"])
                      }
                    >
                      <option>16:9</option>
                      <option>9:16</option>
                    </select>
                  </label>
                  <label>
                    Style
                    <select
                      aria-label="Visual style"
                      value={style}
                      onChange={(e) => setStyle(e.target.value)}
                    >
                      <option>Cinematic</option>
                      <option>Documentary</option>
                      <option>Playful</option>
                      <option>Minimal</option>
                    </select>
                  </label>
                </div>
              )}
              <div className="composer">
                <textarea
                  aria-label={
                    newProject
                      ? "Describe your video"
                      : "Message your production assistant"
                  }
                  placeholder={
                    newProject
                      ? "Describe the video you have in mind…"
                      : "Add a direction, a detail, a little more you…"
                  }
                  value={draft}
                  maxLength={2000}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <div className="composer-bottom">
                  <span>
                    <Sparkles size={13} />
                    {newProject
                      ? "Let’s bring it to life"
                      : "Your vision. In every detail."}
                  </span>
                  <button
                    aria-label={newProject ? "Create video" : "Send message"}
                    disabled={
                      !draft.trim() || (!newProject && busy) || real.pending
                    }
                    type="submit"
                  >
                    <ArrowUp size={18} />
                  </button>
                </div>
              </div>
              <p className="composer-note">
                {newProject && authEnabled
                  ? "New videos use real AI services · Sign in required"
                  : live
                    ? "Live production · Your assets are saved to your account"
                    : "Demo mode · Sample media, no AI credits used"}
              </p>
            </form>
          </section>
          <main
            className={`canvas-panel ${mobilePanel === "canvas" ? "mobile-visible" : ""}`}
          >
            <div className="panel-title canvas-title">
              <span>
                <Layers3 size={16} /> Production canvas
              </span>
              <span className="canvas-live">
                <span />
                {completed
                  ? "Complete"
                  : busy
                    ? "In progress"
                    : "In the making"}
              </span>
            </div>
            <nav className="workflow-stepper" aria-label="Production workflow">
              {steps.map((step, i) => {
                const Icon = stepIcons[i];
                const done = !newProject && project.stage > i;
                return (
                  <button
                    key={step}
                    disabled={newProject || i > project.stage}
                    onClick={() => {
                      setView(i);
                      setPlaying(false);
                    }}
                    className={`${view === i && !newProject ? "current" : ""} ${done ? "complete" : ""}`}
                    aria-current={view === i ? "step" : undefined}
                  >
                    <span className="step-circle">
                      {done ? <Check size={14} /> : <Icon size={14} />}
                    </span>
                    <span>{step}</span>
                  </button>
                );
              })}
            </nav>
            <div className="canvas-scroll" ref={canvasScroll}>
              {!newProject && live && (
                <div className="live-job-panel" role="status">
                  {liveJob && (
                    <p>
                      <Loader2 size={15} className="spin" /> {liveJob.label}
                      {liveJob.status === "waiting"
                        ? " · Waiting for the provider"
                        : liveJob.status === "retrying"
                          ? " · Retrying with backoff"
                          : ""}
                    </p>
                  )}
                  {unfinished.map((j) => (
                    <p key={j.id}>
                      {j.status === "paused" ? "Paused: " : ""}
                      {j.error || j.label}
                    </p>
                  ))}
                  {!!unfinished.length && !busy && (
                    <button
                      className="button secondary"
                      onClick={() => void commandLive("retry")}
                    >
                      <RotateCcw size={14} /> {liveAction}
                    </button>
                  )}
                  {(project.finalStale ||
                    project.thumbnailStale ||
                    project.publishingStale) && (
                    <p>
                      Earlier edits changed this production. Rebuild the
                      dependent outputs before finishing.
                    </p>
                  )}
                  {liveDrafts[project.id] && (
                    <button
                      disabled={busy}
                      className="button secondary"
                      onClick={() =>
                        void saveLiveDraft()
                          .then(() => setNotice("Changes saved."))
                          .catch((e) => setNotice(e.message))
                      }
                    >
                      Save changes
                    </button>
                  )}
                </div>
              )}
              {(real.error || real.configError) && (
                <p className="info-box">
                  {real.error || real.configError} Your saved work remains safe.
                </p>
              )}
              {newProject ? (
                <div className="empty-canvas">
                  <span>
                    <Clapperboard size={36} />
                  </span>
                  <h2>Your next great video starts with a prompt.</h2>
                  <p>
                    Describe your idea in the conversation. Your script, scenes,
                    and final details will come together right here.
                  </p>
                  <div>
                    One idea <ArrowRight size={15} /> Seven simple steps{" "}
                    <ArrowRight size={15} /> Your video
                  </div>
                </div>
              ) : (
                <>
                  <div className="canvas-section-heading">
                    <div>
                      <div className="section-kicker">
                        STEP {String(view + 1).padStart(2, "0")}{" "}
                        <span>/ 07</span>
                      </div>
                      <h2>
                        {
                          [
                            "The creative brief",
                            "Every word, in its moment.",
                            "A plan for every frame.",
                            "Your story, scene by scene.",
                            "See the story come together.",
                            "Make the first impression count.",
                            "Ready for the world.",
                          ][view]
                        }
                      </h2>
                      <p>
                        {
                          [
                            "The idea that sets everything in motion.",
                            "A timed narration that gives your story room to breathe.",
                            `${project.scenes.length} moments. One consistent visual story.`,
                            "Each scene brings your idea a little closer to life.",
                            live
                              ? "Review the pacing of your assembled video."
                              : "Review the pacing with a timed storyboard preview.",
                            "Choose a cover that makes someone stop and watch.",
                            "The final details for your next upload.",
                          ][view]
                        }
                      </p>
                    </div>
                    {view === 3 && (
                      <span className="count-badge">
                        <span className="saved-dot" />
                        {ready} of {project.scenes.length} ready
                      </span>
                    )}
                  </div>
                  <div className="production-meta">
                    <span>
                      <Clock3 size={14} />
                      {timecode(project.duration)} duration
                    </span>
                    <span>
                      <Monitor size={14} />
                      {project.format}{" "}
                      {project.format === "16:9" ? "Landscape" : "Portrait"}
                    </span>
                    <span>
                      <Sparkles size={14} />
                      {project.style}
                    </span>
                    <span>
                      <AudioLines size={14} />
                      {live ? "Timed narration" : "Warm narration"}
                    </span>
                  </div>
                  {view === 0 && (
                    <div className="brief-card">
                      <span className="section-kicker">
                        YOUR ORIGINAL PROMPT
                      </span>
                      <p>{project.prompt}</p>
                      <div className="info-box">
                        <Sparkles size={16} />
                        Your prompt guides the script, visuals, and publishing
                        draft.
                      </div>
                      <button className="button secondary" onClick={startNew}>
                        <Plus size={15} />
                        Start a new idea
                      </button>
                    </div>
                  )}
                  {view === 1 && (
                    <div className="script-list">
                      <div className="list-heading">
                        <span>TIMED TRANSCRIPT</span>
                        <span>
                          {project.scenes.length} sections ·{" "}
                          {project.scenes.reduce(
                            (n, s) =>
                              n + s.narration.trim().split(/\s+/).length,
                            0,
                          )}{" "}
                          words
                        </span>
                      </div>
                      {project.scenes.map((s, i) => {
                        const fast =
                          (s.narration.trim().split(/\s+/).length /
                            sceneDuration(project, s)) *
                            60 >
                          165;
                        return (
                          <button
                            className="script-row"
                            key={i}
                            onClick={() =>
                              setSceneEditor({
                                index: i,
                                scene: { ...s },
                                version: storedProject.version,
                              })
                            }
                            disabled={!live && busy}
                          >
                            <span className="script-time">
                              {sceneTime(project, i)}
                              <small>
                                SCENE {String(i + 1).padStart(2, "0")}
                              </small>
                            </span>
                            <span className="script-text">
                              <strong>{s.title}</strong>
                              <span>{s.narration}</span>
                              {fast && (
                                <small className="pacing-warning">
                                  Fast pacing · shorten this section for natural
                                  narration
                                </small>
                              )}
                            </span>
                            <Settings2 size={15} />
                          </button>
                        );
                      })}
                      <div className="info-box">
                        <AudioLines size={16} />
                        {live
                          ? "Narration is timed to the scene boundaries. The assembled video uses generated ambience; a spoken voiceover is not added."
                          : "Timing is planned. Voice generation is not connected in this demo."}
                      </div>
                    </div>
                  )}
                  {(view === 2 || view === 3) && (
                    <>
                      <div className="scene-toolbar">
                        <span>
                          <span className="tiny-square" />
                          {view === 2 ? "SCENE PLAN" : "ALL SCENES"}
                          <small>
                            {String(project.scenes.length).padStart(2, "0")}
                          </small>
                        </span>
                        <button
                          onClick={() => setView(1)}
                          className="text-button"
                        >
                          <FileText size={13} /> View timed script
                        </button>
                      </div>
                      <div className="scene-grid">
                        {project.scenes.map((s, i) => {
                          const generating = live
                            ? s.status === "generating"
                            : busy &&
                              job?.kind === "scenes" &&
                              i === project.scenes.findIndex((s) => !s.ready);
                          return (
                            <button
                              className={`scene-card ${generating ? "generating" : ""}`}
                              key={i}
                              disabled={!live && busy}
                              onClick={() =>
                                setSceneEditor({
                                  index: i,
                                  scene: { ...s },
                                  version: storedProject.version,
                                })
                              }
                            >
                              <div className="scene-image">
                                <>
                                  {s.image ? (
                                    <img src={s.image} alt={s.title} />
                                  ) : (
                                    <div className="scene-placeholder">
                                      <Film size={32} />
                                      <span>
                                        {s.status === "failed"
                                          ? "Generation needs attention"
                                          : "Your shot starts here"}
                                      </span>
                                    </div>
                                  )}
                                </>
                                <span className="scene-number">
                                  SCENE {String(i + 1).padStart(2, "0")}
                                </span>
                                <span className="scene-length">
                                  {sceneDuration(project, s)}s
                                </span>
                                <span
                                  className={`scene-status ${s.ready && view === 3 ? "ready" : generating ? "working" : "queued"}`}
                                >
                                  {s.ready && view === 3 ? (
                                    <Check size={10} />
                                  ) : generating ? (
                                    <Loader2 size={10} className="spin" />
                                  ) : (
                                    <Clock3 size={10} />
                                  )}
                                  {view === 2
                                    ? "Planned"
                                    : s.ready
                                      ? "Ready"
                                      : generating
                                        ? "Generating"
                                        : s.status === "failed"
                                          ? "Failed"
                                          : "Queued"}
                                </span>
                                <span className="scene-hover">
                                  <Maximize2 size={17} />
                                  Review scene
                                </span>
                              </div>
                              <div className="scene-card-body">
                                <div>
                                  <h3>{s.title}</h3>
                                  <MoreHorizontal size={16} />
                                </div>
                                <p>
                                  {s.error ||
                                    (view === 2
                                      ? s.visual
                                      : `“${s.narration}”`)}
                                </p>
                                <span className="scene-timing">
                                  <AudioLines size={12} />
                                  {sceneTime(project, i)}
                                  <span>
                                    {live ? "Generated clip" : "Sample image"}
                                  </span>
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <div className="canvas-tip">
                        <Leaf size={15} />
                        <p>
                          A consistent visual style, from the first frame to the
                          last.
                          <span>
                            {live
                              ? "Generated clips are stored durably in R2."
                              : "Sample photography stands in for generated clips."}
                          </span>
                        </p>
                      </div>
                    </>
                  )}
                  {view === 4 && (
                    <div className="assembly-area">
                      {project.stage >= 5 ? (
                        <>
                          {preview()}
                          <div className="timeline-label">
                            <span>
                              <Layers3 size={14} />
                              SCENE TIMELINE
                            </span>
                            <span>{timecode(project.duration)}</span>
                          </div>
                          <div className="scene-timeline">
                            {project.scenes.map((s, i) => (
                              <button
                                key={i}
                                className={currentScene === i ? "active" : ""}
                                onClick={() =>
                                  (() => {
                                    const t =
                                      s.start ??
                                      (i * project.duration) /
                                        project.scenes.length;
                                    setPlayhead(t);
                                    if (live && videoRef.current)
                                      videoRef.current.currentTime = t;
                                  })()
                                }
                                aria-label={`Jump to scene ${i + 1}`}
                              >
                                <img src={s.image} alt="" />
                                <span>{String(i + 1).padStart(2, "0")}</span>
                              </button>
                            ))}
                          </div>
                          <div className="info-box">
                            <Film size={17} />
                            {live
                              ? "Encoded video with generated scene audio. Narration is available as a timed transcript; voiceover is not added."
                              : "Timed still-image preview with captions. Video rendering, voice, and music are not connected in the sample."}
                          </div>
                        </>
                      ) : (
                        <div className="assembly-empty">
                          <span>
                            {busy ? (
                              <Loader2 className="spin" size={32} />
                            ) : (
                              <Film size={32} />
                            )}
                          </span>
                          <h3>
                            {busy
                              ? "Arranging your scenes…"
                              : `${project.scenes.length} scenes. Ready to come together.`}
                          </h3>
                          <p>
                            {live
                              ? "Assemble your saved clips into a playable video."
                              : "Build a storyboard preview to review timing and narration."}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  {view === 5 && (
                    <div className="thumbnail-area">
                      <div
                        className={`thumbnail-preview ${live ? "live-thumbnail" : ""} thumbnail-style-${project.thumbnail}`}
                      >
                        <img
                          src={thumbnailImage(project.thumbnail) || undefined}
                          alt="Selected thumbnail background"
                        />
                        {!live && (
                          <>
                            <span className="thumbnail-wordmark">
                              BRAINSTUDIOS ORIGINAL
                            </span>
                            <h3>{project.headline}</h3>
                          </>
                        )}
                        {live && !thumbnailImage(project.thumbnail) && (
                          <div className="scene-placeholder">
                            <Sparkles size={32} />
                            <span>
                              {busy
                                ? "Creating your cover…"
                                : "Your generated cover will appear here."}
                            </span>
                          </div>
                        )}
                        <span className="thumbnail-duration">
                          {timecode(project.duration)}
                        </span>
                      </div>
                      <label className="field-label">
                        Thumbnail headline
                        <input
                          disabled={live && busy}
                          maxLength={80}
                          value={project.headline}
                          onChange={(e) =>
                            update((p) => ({
                              ...p,
                              headline: e.target.value,
                              stage: Math.min(p.stage, 5),
                            }))
                          }
                        />
                      </label>
                      <div className="thumbnail-options">
                        {(live
                          ? project.thumbnails.map((t) => t.concept)
                          : [
                              "Into the green",
                              "A wider perspective",
                              "The golden hour",
                            ]
                        ).map((name, i) => (
                          <button
                            key={name}
                            disabled={busy}
                            className={
                              project.thumbnail === i ? "selected" : ""
                            }
                            onClick={() =>
                              update((p) => ({
                                ...p,
                                thumbnail: i,
                                stage: Math.min(p.stage, 5),
                              }))
                            }
                          >
                            <img src={thumbnailImage(i)} alt="" />
                            <span>
                              {name}
                              {project.thumbnail === i && <Check size={14} />}
                            </span>
                          </button>
                        ))}
                      </div>
                      {live && project.thumbnails.length > 0 && (
                        <button
                          disabled={busy}
                          className="button secondary"
                          onClick={() =>
                            void commandLive("regenerate-thumbnail")
                          }
                        >
                          <RotateCcw size={14} /> Regenerate covers
                        </button>
                      )}
                      <p className="subtle-note">
                        {live
                          ? "Generated covers are saved with your production. Changing the headline requires new images."
                          : "Cover concept using sample photography. Your selection is included in the production package."}
                      </p>
                    </div>
                  )}
                  {view === 6 && (
                    <div className="publishing-area">
                      {completed && (
                        <div className="completion-banner">
                          <span>
                            <Check size={19} />
                          </span>
                          <div>
                            <strong>Your production package is ready.</strong>
                            <p>
                              All seven steps complete. A good idea, brought
                              together.
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="output-summary">
                        <img
                          src={thumbnailImage(project.thumbnail) || undefined}
                          alt="Selected cover"
                        />
                        <div>
                          <span className="section-kicker">
                            YOUR FINAL OUTPUT
                          </span>
                          <h3>{project.headline}</h3>
                          <p>
                            {timecode(project.duration)} · {project.format} ·{" "}
                            {project.scenes.length} scenes
                          </p>
                          <button
                            className="text-button"
                            onClick={() => {
                              setPlayhead(0);
                              setPreviewOpen(true);
                            }}
                          >
                            <Play size={13} />
                            {live
                              ? "Watch final video"
                              : "Review storyboard preview"}
                          </button>
                        </div>
                      </div>
                      {live && (
                        <div className="asset-downloads">
                          <button
                            disabled={busy || project.finalStale}
                            className="button secondary"
                            onClick={() => void downloadAsset("video")}
                          >
                            <ArrowDownToLine size={15} /> Download video
                          </button>
                          <button
                            disabled={busy || project.thumbnailStale}
                            className="button secondary"
                            onClick={() => void downloadAsset("thumbnail")}
                          >
                            <ArrowDownToLine size={15} /> Download thumbnail
                          </button>
                        </div>
                      )}
                      <div className="publishing-heading">
                        <h3>Publishing details</h3>
                        <button className="text-button" onClick={copyDetails}>
                          <Copy size={14} />
                          Copy details
                        </button>
                      </div>
                      <label className="field-label">
                        Video title <small>{project.title.length}/100</small>
                        <input
                          disabled={live && busy}
                          maxLength={100}
                          value={project.title}
                          onChange={(e) =>
                            update((p) => ({
                              ...p,
                              title: e.target.value,
                              stage: Math.min(p.stage, 6),
                            }))
                          }
                        />
                      </label>
                      <label className="field-label">
                        Description
                        <textarea
                          disabled={live && busy}
                          rows={5}
                          maxLength={5000}
                          value={project.description}
                          onChange={(e) =>
                            update((p) => ({
                              ...p,
                              description: e.target.value,
                              stage: Math.min(p.stage, 6),
                            }))
                          }
                        />
                      </label>
                      <label className="field-label">
                        Tags <small>Separate with commas</small>
                        <input
                          disabled={live && busy}
                          maxLength={500}
                          value={project.tags}
                          onChange={(e) =>
                            update((p) => ({
                              ...p,
                              tags: e.target.value,
                              stage: Math.min(p.stage, 6),
                            }))
                          }
                        />
                      </label>
                      <div className="deliverables">
                        <h3>Inside your production package</h3>
                        {[
                          "Timed script & scene prompts",
                          "Selected thumbnail concept",
                          "Title, description & tags",
                        ].map((t) => (
                          <span key={t}>
                            <Check size={14} />
                            {t}
                          </span>
                        ))}
                      </div>
                      <div className="info-box">
                        <Send size={16} />
                        Publishing is manual. YouTube is not connected, and no
                        video has been uploaded.
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            {!newProject && (
              <footer className="canvas-footer">
                <div>
                  <span className="footer-step">
                    {completed ? (
                      <Check size={14} />
                    ) : (
                      <span className={busy ? "pulsing-dot" : "saved-dot"} />
                    )}
                    {completed
                      ? "All steps complete"
                      : busy
                        ? live
                          ? liveJob?.label || "Saving changes…"
                          : job?.kind === "assembly"
                            ? "Assembling preview…"
                            : `Generating scene ${Math.min(ready + 1, project.scenes.length)} of ${project.scenes.length}…`
                        : project.stage === 3
                          ? `${ready} scenes ready. Let’s keep going.`
                          : `Up next: ${steps[Math.min(project.stage, 6)].toLowerCase()}`}
                  </span>
                  <small>
                    {completed
                      ? "Ready to export your production brief"
                      : "You stay in control at every step."}
                  </small>
                </div>
                {busy ? (
                  <button
                    className="button secondary"
                    onClick={() => {
                      if (live) {
                        void commandLive("pause");
                        return;
                      }
                      setJob(null);
                      setNotice(
                        "Paused. You can continue whenever you’re ready.",
                      );
                    }}
                  >
                    <Pause size={14} />
                    Pause
                  </button>
                ) : completed ? (
                  <button className="button primary" onClick={download}>
                    <ArrowDownToLine size={15} />
                    Export package
                  </button>
                ) : view < project.stage &&
                  !(view === 3 && project.stage === 4) ? (
                  <button
                    className="button primary"
                    onClick={() => setView(Math.min(project.stage, 6))}
                  >
                    Continue to{" "}
                    {steps[Math.min(project.stage, 6)].toLowerCase()}
                    <ArrowRight size={15} />
                  </button>
                ) : (
                  <button
                    className="button primary"
                    disabled={
                      live &&
                      (busy || (project.stage === 1 && !project.scenes.length))
                    }
                    onClick={advance}
                  >
                    <Sparkles size={15} />
                    {live ? liveAction : stageActions[project.stage]}
                    <ArrowRight size={15} />
                  </button>
                )}
              </footer>
            )}
          </main>
        </div>
      </div>
      {notice && (
        <div className="notice" role="status">
          <Check size={16} />
          {notice}
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <Dialog
        open={!!sceneEditor}
        onOpenChange={(open) => {
          if (!open) setSceneEditor(null);
        }}
      >
        <DialogContent className="scene-dialog">
          <DialogHeader>
            <DialogTitle>
              Scene{" "}
              {sceneEditor
                ? String(sceneEditor.index + 1).padStart(2, "0")
                : ""}{" "}
              · {sceneEditor && sceneTime(project, sceneEditor.index)}
            </DialogTitle>
            <DialogDescription>
              {live
                ? "Edit this scene’s narration and direction. Its clip and dependent outputs will need rebuilding; other clips are preserved."
                : "Review the narration and visual direction. Saving resets generated scenes and later steps."}
            </DialogDescription>
          </DialogHeader>
          {sceneEditor && (
            <form onSubmit={saveScene}>
              {live && sceneEditor.scene.clipUrl ? (
                <video
                  className="editor-image"
                  controls
                  playsInline
                  src={sceneEditor.scene.clipUrl}
                />
              ) : sceneEditor.scene.image ? (
                <img
                  className="editor-image"
                  src={sceneEditor.scene.image}
                  alt={sceneEditor.scene.title}
                />
              ) : null}
              {live && sceneEditor.scene.generationPrompt && (
                <details className="scene-direction">
                  <summary>Camera & generation direction</summary>
                  <p>{sceneEditor.scene.generationPrompt}</p>
                  <p>{sceneEditor.scene.continuity}</p>
                </details>
              )}
              {live && sceneEditor.scene.generationPrompt && (
                <button
                  type="button"
                  disabled={busy || Boolean(sceneDirty)}
                  title={
                    sceneDirty
                      ? "Save the edited scene before regenerating."
                      : undefined
                  }
                  className="text-button"
                  onClick={() => {
                    void commandLive("regenerate-scene", {
                      sceneId: sceneEditor.scene.id,
                    });
                    setSceneEditor(null);
                  }}
                >
                  <RotateCcw size={14} /> Regenerate this scene
                </button>
              )}
              <label className="field-label">
                Scene title
                <input
                  disabled={live && busy}
                  required
                  maxLength={100}
                  value={sceneEditor.scene.title}
                  onChange={(e) =>
                    setSceneEditor(
                      (v) =>
                        v && {
                          ...v,
                          scene: { ...v.scene, title: e.target.value },
                        },
                    )
                  }
                />
              </label>
              <label className="field-label">
                Narration
                <textarea
                  disabled={live && busy}
                  required
                  rows={3}
                  maxLength={1000}
                  value={sceneEditor.scene.narration}
                  onChange={(e) =>
                    setSceneEditor(
                      (v) =>
                        v && {
                          ...v,
                          scene: { ...v.scene, narration: e.target.value },
                        },
                    )
                  }
                />
              </label>
              <label className="field-label">
                Visual direction
                <textarea
                  disabled={live && busy}
                  required={!live}
                  rows={3}
                  maxLength={1500}
                  value={sceneEditor.scene.visual}
                  onChange={(e) =>
                    setSceneEditor(
                      (v) =>
                        v && {
                          ...v,
                          scene: { ...v.scene, visual: e.target.value },
                        },
                    )
                  }
                />
              </label>
              {live &&
                sceneEditor.scene.clipUrl &&
                !sceneEditor.scene.ready && (
                  <p className="subtle-note">
                    This preview is the previous clip. Generate the revised
                    scene to replace it.
                  </p>
                )}
              <div className="dialog-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setSceneEditor(null)}
                >
                  Cancel
                </button>
                <button
                  disabled={busy}
                  className="button primary"
                  type="submit"
                >
                  Save scene
                  <Check size={14} />
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>One idea. Your whole production.</DialogTitle>
            <DialogDescription>
              BrainStudios is your agentic video-production assistant.
            </DialogDescription>
          </DialogHeader>
          <ol className="help-steps">
            {steps.map((s, i) => (
              <li key={s}>
                <span>{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <p className="help-copy">
            Sign in to create a real production with your AI production team.
            Review the script and direction, generate clips, assemble your
            video, and prepare a cover and publishing details. Your productions
            are saved to your account.
          </p>
          <div className="info-box">
            <Sparkles size={18} />
            The nature sample stays available as an interactive local demo. Real
            productions use Gemini, Veo, and generated covers. Publishing to
            YouTube remains manual.
          </div>
          <button
            className="button secondary"
            onClick={() => {
              const demo = demoProject();
              setWorkspace((w) => ({
                projects: [demo, ...w.projects.filter((p) => p.id !== demo.id)],
                activeId: demo.id,
              }));
              setJob(null);
              setView(3);
              setNewProject(false);
              setPlaying(false);
              setPlayhead(0);
              setHelp(false);
            }}
          >
            <RotateCcw size={15} />
            Reset sample production
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) setPlaying(false);
        }}
      >
        <DialogContent className="preview-dialog">
          <DialogHeader>
            <DialogTitle>{project.title}</DialogTitle>
            <DialogDescription>
              {live
                ? "Assembled production · generated scene audio"
                : "Timed storyboard preview · sample still images, no audio"}
            </DialogDescription>
          </DialogHeader>
          {preview(true)}
        </DialogContent>
      </Dialog>
    </div>
  );
}

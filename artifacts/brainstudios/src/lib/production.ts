import { z } from "zod";

import { projectSchema, type Project, type Scene } from '@workspace/video-workflow';
export { steps, sceneSchema, projectSchema, sceneTime, timecode } from '@workspace/video-workflow';
export type { Project, Scene } from '@workspace/video-workflow';
export const storageKey = "brainstudios.video-workspace.v1";
const asset = (name: string) => `${import.meta.env.BASE_URL}images/${name}.jpg`;

const natureScenes: Scene[] = [
  {
    title: "A world waking up",
    narration:
      "Before the world wakes, something extraordinary is already happening. Light finds its way through the trees.",
    visual:
      "Aerial establishing shot of a misty forest at sunrise. Warm light, slow forward movement, cinematic depth.",
    image: asset("forest"),
    ready: true, revision: 1,
  },
  {
    title: "The smallest details",
    narration:
      "In every leaf, a tiny universe. Quiet, intricate, and more connected than we could ever imagine.",
    visual:
      "Macro close-up of fern leaves with morning dew. Shallow depth of field, soft green tones, gentle drift.",
    image: asset("leaves"),
    ready: true, revision: 1,
  },
  {
    title: "Always in motion",
    narration:
      "Water carves its own path. Moving around obstacles, reminding us that progress does not have to be loud.",
    visual:
      "Wide shot of a waterfall flowing into a still pool. Slow push-in, natural light, fine water mist.",
    image: asset("waterfall"),
    ready: true, revision: 1,
  },
  {
    title: "Room to breathe",
    narration:
      "Above the noise, there is room to breathe. A wider perspective, waiting just beyond the familiar.",
    visual:
      "Sweeping aerial over layered mountain peaks. Hazy horizon, restrained color grade, expansive composition.",
    image: asset("mountains"),
    ready: false, revision: 1,
  },
  {
    title: "Everything is connected",
    narration:
      "The forest, the water, the open sky. Separate stories, woven together into something bigger than ourselves.",
    visual:
      "Sunlight filtering through a dense forest canopy. Low-angle tracking shot, warm highlights, rich greens.",
    image: asset("canopy"),
    ready: false, revision: 1,
  },
  {
    title: "Take a closer look",
    narration:
      "The extraordinary is not always far away. Sometimes, all it takes is a moment to stop. And look closer.",
    visual:
      "Wide golden-hour landscape fading to a quiet end card. Slow pull-back, gentle light, space for the closing title.",
    image: asset("sunset"),
    ready: false, revision: 1,
  },
];

export function demoProject(): Project {
  const prompt =
    "Create a 60-second cinematic video about the quiet beauty of nature. Make it feel calm and inspiring, with warm narration and immersive visuals. For YouTube, in 16:9.";
  return {
    id: "nature-demo", mode: "demo", version: 1, finalStale: false, thumbnailStale: false, publishingStale: false, thumbnails: [], jobs: [],
    title: "The quiet beauty of nature",
    prompt,
    duration: 60,
    format: "16:9",
    style: "Cinematic",
    stage: 3,
    scenes: natureScenes.map((s) => ({ ...s })),
    thumbnail: 0,
    headline: "A little closer to nature.",
    description:
      "Take a minute to slow down. From sunlit forests to flowing water, discover the extraordinary beauty hiding in the everyday. What helps you reconnect with nature?",
    tags: "nature, cinematic, mindfulness, slow living",
    messages: [
      { role: "user", text: prompt },
      {
        role: "assistant",
        text: "A little breathing room, in video form. I’ve shaped your idea into a six-scene journey, moving from a misty forest to a warm, open horizon.",
      },
      {
        role: "assistant",
        text: "Your timed script and scene plan are ready. Each scene has 10 seconds of narration and a clear visual direction. The first three sample scenes are ready to preview — let’s bring the rest together.",
      },
    ],
  };
}

export function createProject(
  prompt: string,
  duration: number,
  format: Project["format"],
  style: string,
): Project {
  const title = prompt
    .replace(/^(create|make|produce)\s+(a|an)\s+/i, "")
    .replace(/\s+/g, " ")
    .slice(0, 64)
    .replace(/[.!?,]$/, "");
  const topic = title.charAt(0).toUpperCase() + title.slice(1);
  const labels = [
    "The opening hook",
    "Set the scene",
    "Go a little deeper",
    "A fresh perspective",
    "Bring it together",
    "The final takeaway",
  ];
  const topicPhrase = topic
    .replace(/^(a|an|the)\s+/i, "")
    .split(/\s+(?:with|for|in|that)\s+/i)[0];
  const subject =
    topicPhrase.split(/\s+/).length <= 8 ? topicPhrase : "this idea";
  const shortNarration = [
    `Discover ${subject}. See it differently.`,
    "Every story starts small. Let’s look a little closer.",
    "The little details can reveal something completely unexpected.",
    "A fresh perspective makes the familiar feel new again.",
    "Different moments. One story. Now it all comes together.",
    "There’s more to discover. What will you explore next?",
  ];
  const narration = [
    `What if we looked at ${subject} a little differently? Let’s start with a fresh perspective.`,
    "Every story begins with a detail. Small moments invite us to slow down, get curious, and see the bigger picture.",
    "Look a little closer. The most interesting part of this story might be the part we usually overlook.",
    "Step back for a moment. A different view can turn something familiar into something surprising, and open a new possibility.",
    "Now the pieces come together. Every moment is a reminder that a good story lives in the connections.",
    `There is always more to discover about ${subject}. What would you explore next? Share your perspective.`,
  ];
  const extensions = [
    "Leave a little room for wonder. Sometimes the best stories begin with a question.",
    "Notice how one detail leads to another, building a picture that feels entirely your own.",
    "Stay with this moment. Give yourself the time to notice what makes it different.",
    "Let the scene unfold slowly, with enough space to take in everything around you.",
    "Follow those connections and see where they lead. Each one adds something to the story.",
    "Keep that curiosity close. The next discovery might be waiting just around the corner.",
  ];
  return {
    ...demoProject(),
    id: crypto.randomUUID(),
    prompt,
    title: topic,
    duration,
    format,
    style,
    stage: 1,
    headline: topic,
    description: `A ${duration}-second ${style.toLowerCase()} exploration of ${topic}. Discover a fresh perspective and share your thoughts in the comments.`,
    tags: "video, storytelling, inspiration",
    scenes: natureScenes.map((s, i) => ({
      ...s,
      ready: false, revision: 1,
      title: labels[i],
      narration:
        duration === 30
          ? shortNarration[i]
          : `${narration[i]}${duration >= 90 ? ` ${extensions[i]}` : ""}${duration === 120 ? " Pause for a moment, take it in, and let the story stay with you." : ""}`,
      visual: `${style} ${format} composition for “${topic}”, scene ${i + 1}: ${labels[i].toLowerCase()}. Consistent lighting and color palette. Nature photograph is a placeholder reference; replace with topic-specific imagery.`,
    })),
    messages: [
      { role: "user", text: prompt },
      {
        role: "assistant",
        text: `I’ve drafted a ${duration}-second script with six timed sections in a ${style.toLowerCase()} style. This is a template-based demo using sample nature imagery. Edit the narration and visual directions to fit your idea, then approve the script.`,
      },
    ],
  };
}

export function readWorkspace(): { projects: Project[]; activeId: string } {
  try {
    const parsed = z
      .object({ projects: z.array(projectSchema).min(1), activeId: z.string() })
      .parse(JSON.parse(localStorage.getItem(storageKey) || "null"));
    return {
      ...parsed,
      activeId: parsed.activeId,
    };
  } catch {
    const demo = demoProject();
    return { projects: [demo], activeId: demo.id };
  }
}

export function invalidateScenes(project: Project, scenes: Scene[]): Project {
  return {
    ...project,
    scenes: scenes.map((s) => ({ ...s, ready: false })),
    stage: Math.min(project.stage, 1),
  };
}

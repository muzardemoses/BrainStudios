import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ffmpeg from "ffmpeg-static";
import { sceneDuration, type Project } from "@workspace/video-workflow";
import { downloadFile, putFile } from "./storage";
import { WorkflowError } from "./config";
export function runBinary(
  binary: string,
  args: string[],
  timeout = 300_000,
  captureStderr = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let error = "";
    child.stdout.on("data", (d) => {
      output = (output + d.toString()).slice(-1_000_000);
    });
    child.stderr.on("data", (d) => {
      error = (error + d.toString()).slice(-100_000);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    child.on("error", () => {
      clearTimeout(timer);
      reject(
        new WorkflowError(
          "The video encoder is unavailable. Install FFmpeg and retry assembly.",
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(captureStderr ? error : output);
      else
        reject(
          new WorkflowError(
            error.includes("No such file")
              ? "A required media file is unavailable. Retry this step."
              : "Video encoding failed. The source clips are safe; retry assembly.",
          ),
        );
    });
  });
}
export const encoder = () => process.env.FFMPEG_PATH || ffmpeg || "ffmpeg";
export async function mediaInfo(file: string) {
  type Info = {
    format: { duration: string };
    streams: Array<{ codec_type: string; width?: number; height?: number }>;
  };
  if (process.env.FFPROBE_PATH)
    return JSON.parse(
      await runBinary(
        process.env.FFPROBE_PATH,
        ["-v", "error", "-show_format", "-show_streams", "-of", "json", file],
        30000,
      ),
    ) as Info;
  // Inspect with the same encoder binary; the separate probe package incorrectly
  // ships an Intel executable under its macOS ARM path.
  const text = await runBinary(
    encoder(),
    [
      "-hide_banner",
      "-i",
      file,
      "-map",
      "0",
      "-t",
      "0",
      "-c",
      "copy",
      "-f",
      "null",
      "-",
    ],
    30000,
    true,
  );
  const input = text.split("Output #")[0];
  const duration = input.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  if (!duration)
    throw new WorkflowError("The media file has no valid duration.");
  const streams: Info["streams"] = [];
  for (const line of input.split("\n")) {
    if (/Stream #.*Video:/.test(line)) {
      const size = line.match(/\b(\d{2,5})x(\d{2,5})\b/);
      streams.push({
        codec_type: "video",
        width: size ? Number(size[1]) : undefined,
        height: size ? Number(size[2]) : undefined,
      });
    }
    if (/Stream #.*Audio:/.test(line)) streams.push({ codec_type: "audio" });
  }
  return {
    format: {
      duration: String(
        Number(duration[1]) * 3600 +
          Number(duration[2]) * 60 +
          Number(duration[3]),
      ),
    },
    streams,
  };
}
export async function posterFor(clip: Buffer, key: string) {
  const dir = await mkdtemp(join(tmpdir(), "brainstudios-poster-"));
  try {
    const input = join(dir, "scene.mp4"),
      output = join(dir, "poster.jpg");
    await writeFile(input, clip);
    const info = await mediaInfo(input);
    if (!info.streams.some((s) => s.codec_type === "video"))
      throw new WorkflowError("The provider returned a file without video.");
    await runBinary(
      encoder(),
      ["-y", "-i", input, "-frames:v", "1", "-vf", "scale=640:-2", output],
      60_000,
    );
    await putFile(key, output, "image/jpeg");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
export async function assemble(p: Project, outputKey: string) {
  if (!p.scenes.length || p.scenes.some((s) => !s.ready || !s.clipKey))
    throw new WorkflowError("Every scene must be ready before assembly.");
  const dir = await mkdtemp(join(tmpdir(), "brainstudios-assembly-"));
  try {
    const [width, height] = p.format === "16:9" ? [1280, 720] : [720, 1280];
    const normalized: string[] = [];
    for (let i = 0; i < p.scenes.length; i++) {
      const s = p.scenes[i];
      const input = join(dir, `input-${i}.mp4`),
        output = join(dir, `scene-${i}.mp4`);
      await downloadFile(s.clipKey!, input);
      const info = await mediaInfo(input);
      const audio = info.streams.some((s) => s.codec_type === "audio");
      const args = ["-y", "-i", input];
      if (!audio)
        args.push(
          "-f",
          "lavfi",
          "-i",
          "anullsrc=channel_layout=stereo:sample_rate=48000",
        );
      args.push(
        "-map",
        "0:v:0",
        "-map",
        audio ? "0:a:0" : "1:a:0",
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=8`,
        "-af",
        "apad",
        "-t",
        String(sceneDuration(p, s)),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "21",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        output,
      );
      await runBinary(encoder(), args);
      normalized.push(`file 'scene-${i}.mp4'`);
    }
    const list = join(dir, "list.txt"),
      output = join(dir, "final.mp4");
    await writeFile(list, normalized.join("\n"));
    await runBinary(encoder(), [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      list,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      output,
    ]);
    const info = await mediaInfo(output);
    if (Math.abs(Number(info.format.duration) - p.duration) > 0.5)
      throw new WorkflowError(
        "The encoded video duration did not match the approved timeline. Retry assembly.",
      );
    await putFile(outputKey, output, "video/mp4");
    return { key: outputKey, duration: Number(info.format.duration) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

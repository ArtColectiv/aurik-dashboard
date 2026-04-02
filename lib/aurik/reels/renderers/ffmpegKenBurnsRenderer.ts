import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

type KenBurnsInput = {
  imagePaths: string[];
  audioPath?: string;
  outPath: string;

  width: number;
  height: number;

  fps?: number;
  sceneSec?: number;
  transitionSec?: number;

  /**
   * More visible by default (still subtle, but clearly animated)
   */
  zoomStart?: number; // default 1.04
  zoomEnd?: number; // default 1.09

  /**
   * Adds a tiny drift (still quantized to avoid jitter)
   */
  enableMicroPan?: boolean;

  /**
   * Oversample factor reduces shimmer/jitter (recommended: 2)
   */
  oversampleFactor?: 1 | 2;

  logTag?: string;
};

function runFfmpeg(args: string[], logTag?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    proc.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      if (stderr.length > 200_000) stderr = stderr.slice(-200_000);
    });

    proc.on("error", (err) => reject(err));

    proc.on("close", (code) => {
      if (code === 0) return resolve();
      const prefix = logTag ? `[Aurik] kenburns:${logTag}` : "[Aurik] kenburns";
      reject(new Error(`${prefix} ffmpeg failed (code=${code}). stderr:\n${stderr}`));
    });
  });
}

/**
 * Degraded mode renderer:
 * Still images -> MP4 with smooth Ken Burns + crossfades.
 *
 * Goals:
 * - clearly animated (not a dead slideshow)
 * - NO jitter/vibration (oversample + even pixel quantization)
 */
export async function renderReelFromImagesKenBurnsMp4(input: KenBurnsInput): Promise<void> {
  const fps = input.fps ?? 30;
  const sceneSec = input.sceneSec ?? 4;
  const transitionSec = input.transitionSec ?? 0.25;

  const zoomStart = input.zoomStart ?? 1.04;
  const zoomEnd = input.zoomEnd ?? 1.09;

  const oversample = input.oversampleFactor ?? 2;

  if (!Array.isArray(input.imagePaths) || input.imagePaths.length === 0) {
    throw new Error("renderReelFromImagesKenBurnsMp4: imagePaths is empty");
  }
  if (sceneSec <= 0) throw new Error("renderReelFromImagesKenBurnsMp4: sceneSec must be > 0");
  if (transitionSec < 0) throw new Error("renderReelFromImagesKenBurnsMp4: transitionSec must be >= 0");
  if (transitionSec >= sceneSec) throw new Error("renderReelFromImagesKenBurnsMp4: transitionSec must be < sceneSec");

  await fs.mkdir(path.dirname(input.outPath), { recursive: true });

  const framesPerScene = Math.max(1, Math.round(sceneSec * fps));

  const w = input.width;
  const h = input.height;

  const W = oversample === 2 ? w * 2 : w;
  const H = oversample === 2 ? h * 2 : h;

  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];

  for (const img of input.imagePaths) {
    args.push("-loop", "1", "-t", String(sceneSec), "-i", img);
  }

  const audioInputIndex = input.imagePaths.length;
  if (input.audioPath) args.push("-i", input.audioPath);

  const filterParts: string[] = [];

  // Quantize coords to EVEN pixels to minimize yuv420p shimmer
  const qEven = (expr: string) => `2*floor((${expr})/2)`;

  // Ease-in-out (smoothstep): t*t*(3-2*t)
  // We'll inline t = on/(d-1)
  const tExpr = framesPerScene > 1 ? `(on/${framesPerScene - 1})` : `1`;
  const easeExpr = `(${tExpr})*(${tExpr})*(3-2*(${tExpr}))`;

  for (let i = 0; i < input.imagePaths.length; i++) {
    // zoom with easing (less robotic)
    const zExpr = `${zoomStart}+(${zoomEnd}-${zoomStart})*${easeExpr}`;

    // center crop window in zoomed space
    const baseX = `iw/2-(iw/zoom/2)`;
    const baseY = `ih/2-(ih/zoom/2)`;

    // micro pan in oversampled space (very tiny)
    // use easing so it doesn't "start/stop" abruptly
    const panX = input.enableMicroPan ? ` + (iw*0.010)*${easeExpr}` : "";
    const panY = input.enableMicroPan ? ` + (ih*0.006)*${easeExpr}` : "";

    const xExpr = qEven(`${baseX}${panX}`);
    const yExpr = qEven(`${baseY}${panY}`);

    const chain =
      `[${i}:v]` +
      // Oversample stage (helps reduce shimmering)
      `scale=${W}:${H}:force_original_aspect_ratio=increase,` +
      `crop=${W}:${H},` +
      // Ken Burns in oversampled space
      `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${framesPerScene}:s=${W}x${H}:fps=${fps},` +
      // Downscale to final
      `scale=${w}:${h},` +
      `setpts=PTS-STARTPTS,` +
      `format=yuv420p` +
      `[v${i}]`;

    filterParts.push(chain);
  }

  if (input.imagePaths.length === 1) {
    filterParts.push(`[v0]null[vout]`);
  } else {
    let current = "v0";
    for (let i = 1; i < input.imagePaths.length; i++) {
      const offset = i * (sceneSec - transitionSec);
      const outLabel = i === input.imagePaths.length - 1 ? "vout" : `vx${i}`;
      filterParts.push(
        `[${current}][v${i}]xfade=transition=fade:duration=${transitionSec}:offset=${offset}[${outLabel}]`
      );
      current = outLabel;
    }
  }

  args.push("-filter_complex", filterParts.join(";"));
  args.push("-map", "[vout]");

  if (input.audioPath) {
    args.push("-map", `${audioInputIndex}:a:0`, "-c:a", "aac", "-b:a", "192k", "-shortest");
  }

  args.push(
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps),
    "-movflags",
    "+faststart",
    input.outPath
  );

  await runFfmpeg(args, input.logTag ?? "render");
}

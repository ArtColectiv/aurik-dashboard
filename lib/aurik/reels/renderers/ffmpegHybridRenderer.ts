import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export type HybridSceneInput =
  | {
      kind: "video";
      videoPath: string;
      sceneSec: number;
    }
  | {
      kind: "image";
      imagePath: string;
      sceneSec: number;
    };

export type RenderHybridParams = {
  scenes: HybridSceneInput[];
  audioPath: string;
  outPath: string;

  width?: number; // default 1080
  height?: number; // default 1920
  fps?: number; // default 30
  transitionSec?: number; // default 0.25

  // KenBurns tuning
  zoomStart?: number; // default 1.04
  zoomEnd?: number; // default 1.09
  enableMicroPan?: boolean; // default true
  oversampleFactor?: 1 | 2; // default 2

  logTag?: string; // default "hybrid"
};

export type RenderHybridStats = {
  total: number;
  video: number;
  kenburns: number;
  finalDurationSec: number;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

function runFfmpeg(args: string[], logTag: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      // on ne spam pas la console; on garde pour l'erreur si ça fail
    });

    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (code === 0) return resolve();
      const tail = stderr.length > 2500 ? stderr.slice(-2500) : stderr;
      reject(new Error(`[Aurik][${logTag}] ffmpeg failed (code=${code}). tail=${tail}`));
    });
  });
}

/**
 * Rend un MP4 final en chaînant:
 * - scènes video: scale/crop -> fps -> setpts
 * - scènes image: Ken Burns (zoompan) -> fps -> setpts
 * puis xfade transitions + audio global.
 */
export async function renderReelFromHybridMp4(params: RenderHybridParams): Promise<{
  outPath: string;
  stats: RenderHybridStats;
}> {
  const width = params.width ?? 1080;
  const height = params.height ?? 1920;
  const fps = params.fps ?? 30;
  const transitionSec = params.transitionSec ?? 0.25;

  const zoomStart = params.zoomStart ?? 1.04;
  const zoomEnd = params.zoomEnd ?? 1.09;
  const enableMicroPan = params.enableMicroPan ?? true;
  const oversampleFactor: 1 | 2 = (params.oversampleFactor ?? 2) as 1 | 2;

  const logTag = params.logTag ?? "hybrid";

  if (!params.scenes?.length) throw new Error("renderReelFromHybridMp4: scenes is empty");
  if (!params.audioPath) throw new Error("renderReelFromHybridMp4: audioPath missing");
  if (!params.outPath) throw new Error("renderReelFromHybridMp4: outPath missing");

  if (!(await fileExists(params.audioPath))) {
    throw new Error(`renderReelFromHybridMp4: audioPath not found: ${params.audioPath}`);
  }

  const totalScenes = params.scenes.length;
  const videoCount = params.scenes.filter((s) => s.kind === "video").length;
  const kbCount = totalScenes - videoCount;

  // total duration with overlaps from xfade
  const sumSceneSec = params.scenes.reduce((acc, s) => acc + (s.sceneSec ?? 0), 0);
  const overlaps = transitionSec * Math.max(0, totalScenes - 1);
  const finalDurationSec = Math.max(0.001, sumSceneSec - overlaps);

  // Prepare inputs
  const ffArgs: string[] = ["-y", "-hide_banner"];

  // Inputs: each scene is an input; image uses -loop 1
  for (const s of params.scenes) {
    if (s.kind === "video") {
      if (!(await fileExists(s.videoPath))) {
        throw new Error(`renderReelFromHybridMp4: missing videoPath: ${s.videoPath}`);
      }
      ffArgs.push("-i", s.videoPath);
    } else {
      if (!(await fileExists(s.imagePath))) {
        throw new Error(`renderReelFromHybridMp4: missing imagePath: ${s.imagePath}`);
      }
      ffArgs.push("-loop", "1", "-t", String(s.sceneSec), "-i", s.imagePath);
    }
  }

  // Audio input last
  ffArgs.push("-i", params.audioPath);

  // Filter graph
  // Build one normalized video stream per scene => [v0], [v1], ...
  // Then chain xfade => [vout]
  // Finally map audio trimmed to finalDurationSec => [aout]
  const filters: string[] = [];

  const osW = width * oversampleFactor;
  const osH = height * oversampleFactor;

  for (let i = 0; i < params.scenes.length; i++) {
    const s = params.scenes[i]!;
    const sceneSec = clamp(s.sceneSec, 0.5, 30); // guard

    if (s.kind === "video") {
      // Trim to sceneSec for stability
      filters.push(
        `[${i}:v]` +
          `trim=duration=${sceneSec},setpts=PTS-STARTPTS,` +
          `fps=${fps},` +
          `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
          `crop=${width}:${height}` +
          `[v${i}]`
      );
    } else {
      // Ken Burns zoompan on oversampled canvas, then scale down
      // zoom progression linear per-frame
      const totalFrames = Math.max(1, Math.round(sceneSec * fps));
      const z0 = zoomStart;
      const z1 = zoomEnd;

      const zExpr = `if(lte(on,1),${z0},${z0}+(${z1}-${z0})*(on/${totalFrames}))`;

      // micro-pan: very subtle sin/cos drift
      const panAmp = enableMicroPan ? 0.012 : 0.0; // percent drift of extra margin
      const xExpr = enableMicroPan
        ? `(${osW}-iw*zoom)/2 + (${osW}-iw*zoom)*${panAmp}*sin(2*PI*on/${totalFrames})`
        : `(${osW}-iw*zoom)/2`;
      const yExpr = enableMicroPan
        ? `(${osH}-ih*zoom)/2 + (${osH}-ih*zoom)*${panAmp}*cos(2*PI*on/${totalFrames})`
        : `(${osH}-ih*zoom)/2`;

      filters.push(
        `[${i}:v]` +
          `scale=${osW}:${osH}:force_original_aspect_ratio=increase,` +
          `crop=${osW}:${osH},` +
          `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=${osW}x${osH}:fps=${fps},` +
          `scale=${width}:${height},` +
          `format=yuv420p,` +
          `setpts=PTS-STARTPTS` +
          `[v${i}]`
      );
    }
  }

  // xfade chain
  if (params.scenes.length === 1) {
    filters.push(`[v0]copy[vout]`);
  } else {
    let accLabel = `v0`;
    let accDur = clamp(params.scenes[0]!.sceneSec, 0.5, 30);

    for (let i = 1; i < params.scenes.length; i++) {
      const nextLabel = `v${i}`;
      const nextDur = clamp(params.scenes[i]!.sceneSec, 0.5, 30);

      // offset rule:
      // first xfade offset = t1 - d
      // next xfade offset = (t1+t2 - d) - d = t1+t2 -2d, etc.
      const offset = Math.max(0, accDur - transitionSec);
      const outLabel = `vx${i}`;

      filters.push(
        `[${accLabel}][${nextLabel}]` +
          `xfade=transition=fade:duration=${transitionSec}:offset=${offset},` +
          `format=yuv420p` +
          `[${outLabel}]`
      );

      // update accumulator
      accLabel = outLabel;
      accDur = accDur + nextDur - transitionSec;
    }

    filters.push(`[${accLabel}]copy[vout]`);
  }

  // Audio: trim to finalDurationSec (avoid desync / overrun)
  const audioInputIndex = params.scenes.length; // last input is audio
  filters.push(
    `[${audioInputIndex}:a]` +
      `atrim=duration=${finalDurationSec},asetpts=PTS-STARTPTS,` +
      `aresample=async=1:first_pts=0` +
      `[aout]`
  );

  const filterComplex = filters.join(";");

  const outDir = path.dirname(params.outPath);
  await ensureDir(outDir);

  ffArgs.push(
    "-filter_complex",
    filterComplex,
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-r",
    String(fps),
    "-s",
    `${width}x${height}`,
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    params.outPath
  );

  console.log(`[Aurik][${logTag}] renderReelFromHybridMp4:start`, {
    scenes: totalScenes,
    video: videoCount,
    kenburns: kbCount,
    width,
    height,
    fps,
    transitionSec,
    finalDurationSec: Number(finalDurationSec.toFixed(3)),
  });

  await runFfmpeg(ffArgs, logTag);

  if (!(await fileExists(params.outPath))) {
    throw new Error(`renderReelFromHybridMp4: ffmpeg completed but outPath missing: ${params.outPath}`);
  }

  console.log(`[Aurik][${logTag}] renderReelFromHybridMp4:ok`, {
    outPath: params.outPath,
  });

  return {
    outPath: params.outPath,
    stats: {
      total: totalScenes,
      video: videoCount,
      kenburns: kbCount,
      finalDurationSec,
    },
  };
}

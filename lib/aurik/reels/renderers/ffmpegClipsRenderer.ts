/* eslint-disable no-console */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) return resolve();
      const tail = stderr.split("\n").slice(-80).join("\n");
      reject(new Error(`ffmpeg exited with code ${code}\n${tail}`));
    });
  });
}

export async function renderReelFromClipsMp4(input: {
  clipPaths: string[];
  audioPath?: string;
  outPath: string;
  width: number;
  height: number;
  fps?: number;
  transitionSec?: number;
}): Promise<void> {
  const fps = input.fps ?? 30;
  const transitionSec = input.transitionSec ?? 0.25;

  if (!input.clipPaths?.length) {
    throw new Error("renderReelFromClipsMp4: clipPaths empty");
  }

  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];

  // Inputs: video clips
  for (const p of input.clipPaths) args.push("-i", p);

  const hasAudio = !!input.audioPath;
  if (hasAudio) args.push("-i", input.audioPath!);

  const filterParts: string[] = [];

  // 1) Normalisation de chaque clip
  for (let i = 0; i < input.clipPaths.length; i++) {
    const out = `v${i}`;
    const chain = [
      `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase`,
      `crop=${input.width}:${input.height}`,
      `fps=${fps}`,
      `setpts=PTS-STARTPTS`,
    ].join(",");

    filterParts.push(`[${i}:v]${chain}[${out}]`);
  }

  // 2) Enchaînement avec xfade
  // On enchaîne v0 -> v1 -> v2 -> ...
  let lastLabel = "v0";
  let currentOffset = 0;

  for (let i = 1; i < input.clipPaths.length; i++) {
    const nextLabel = `v${i}`;
    const outLabel = `x${i}`;

    // offset = durée cumulée - transition
    // Ici, on suppose des clips courts (4–6s),
    // donc on approxime en avançant à chaque étape.
    currentOffset += (i === 1 ? 0 : 0) + 4 - transitionSec;

    filterParts.push(
      `[${lastLabel}][${nextLabel}]xfade=transition=fade:duration=${transitionSec}:offset=${currentOffset}[${outLabel}]`
    );

    lastLabel = outLabel;
  }

  const vout = "vout";
  filterParts.push(`[${lastLabel}]format=yuv420p[${vout}]`);

  args.push("-filter_complex", filterParts.join(";"));
  args.push("-map", `[${vout}]`);

  if (hasAudio) {
    // audio input index = number of clips
    args.push("-map", `${input.clipPaths.length}:a`);
    args.push("-shortest");
  }

  args.push(
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-r",
    `${fps}`,
    "-movflags",
    "+faststart"
  );

  if (hasAudio) args.push("-c:a", "aac", "-b:a", "192k");

  await fs.mkdir(path.dirname(input.outPath), { recursive: true });
  args.push(input.outPath);

  await runFfmpeg(args);
}

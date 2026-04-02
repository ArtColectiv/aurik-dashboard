/* eslint-disable no-console */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildZoomPanFilter } from "./motionPresets";

type RenderReelMp4Input = {
  images: Array<{
    path: string;
    durationSec: number;
  }>;
  audioPath?: string;
  outPath: string;
  width: number;
  height: number;
  fps?: number;
  motionSeed?: number;
};

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));

    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) return resolve();

      const tail = stderr.split("\n").slice(-60).join("\n");
      reject(new Error(`ffmpeg exited with code ${code}\n${tail}`));
    });
  });
}

function buildSceneFilter(params: {
  imageInputLabel: string; // ex: "0:v"
  sceneIndex: number;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  motionSeed: number;
}): { filter: string; outLabel: string } {
  const {
    imageInputLabel,
    sceneIndex,
    durationSec,
    width,
    height,
    fps,
    motionSeed,
  } = params;

  const preW = width * 2;
  const preH = height * 2;

  const outLabel = `v${sceneIndex}`;

  const zoompan = buildZoomPanFilter({
    sceneIndex,
    motionSeed,
    durationSec,
    fps,
    outW: width,
    outH: height,
  });

  const chain = [
    `scale=${preW}:${preH}:force_original_aspect_ratio=increase`,
    `crop=${preW}:${preH}`,
    zoompan,
    `trim=duration=${durationSec}`,
    `setpts=PTS-STARTPTS`,
  ].join(",");

  const filter = `[${imageInputLabel}]${chain}[${outLabel}]`;

  return { filter, outLabel };
}


export async function renderReelMp4(input: RenderReelMp4Input): Promise<void> {
  const fps = input.fps ?? 30;
  const motionSeed = input.motionSeed ?? 1337;

  if (!input.images?.length) throw new Error("renderReelMp4: images is empty");
  if (!input.outPath) throw new Error("renderReelMp4: outPath missing");
  if (!input.width || !input.height)
    throw new Error("renderReelMp4: width/height missing");

  for (let i = 0; i < input.images.length; i++) {
    const img = input.images[i];

    if (!img?.path) {
      throw new Error(`renderReelMp4: images[${i}].path missing`);
    }
    if (!img?.durationSec || img.durationSec <= 0) {
      throw new Error(`renderReelMp4: images[${i}].durationSec invalid`);
    }
  }

  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];

  // image inputs
  for (let i = 0; i < input.images.length; i++) {
    const img = input.images[i]!;
    args.push("-loop", "1", "-t", `${img.durationSec}`, "-i", img.path);
  }

  const hasAudio = !!input.audioPath;
  if (hasAudio) args.push("-i", input.audioPath!);

  const filterParts: string[] = [];
  const sceneLabels: string[] = [];

  for (let i = 0; i < input.images.length; i++) {
    const { filter, outLabel } = buildSceneFilter({
      imageInputLabel: `${i}:v`,
      sceneIndex: i,
      durationSec: input.images[i]!.durationSec,
      width: input.width,
      height: input.height,
      fps,
      motionSeed,
    });

    filterParts.push(filter);
    sceneLabels.push(`[${outLabel}]`);
  }

  const concatOut = "vout";
  filterParts.push(
    `${sceneLabels.join("")}concat=n=${sceneLabels.length}:v=1:a=0,format=yuv420p[${concatOut}]`
  );

  args.push("-filter_complex", filterParts.join(";"));
  args.push("-map", `[${concatOut}]`);

  if (hasAudio) {
    // audio input index = number of image inputs
    args.push("-map", `${input.images.length}:a`);
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

  if (hasAudio) {
    args.push("-c:a", "aac", "-b:a", "192k");
  }

  await fs.mkdir(path.dirname(input.outPath), { recursive: true });
  args.push(input.outPath);

  await runFfmpeg(args);
}

export async function renderReelMp4ToTemp(
  input: Omit<RenderReelMp4Input, "outPath">
): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aurik-reel-"));
  const outPath = path.join(tmp, "reel.mp4");
  await renderReelMp4({ ...input, outPath });
  return outPath;
}

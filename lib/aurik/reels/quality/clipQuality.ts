/* eslint-disable no-console */
import { spawn } from "node:child_process";

export type ClipQuality = {
  flickerMeanAbsDiff: number; // 0..255 (plus haut = plus de flicker)
  motionMeanYDif?: number; // moyenne de YDIF si dispo (plus haut = plus de mouvement)
  frames: number;
};

function runCmd(
  cmd: string,
  args: string[]
): Promise<{ code: number; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/**
 * Analyse "cheap but effective" :
 * - flicker : moyenne des variations de luminance (YAVG) entre frames
 * - motion  : moyenne de YDIF (si présent dans signalstats)
 *
 * Utilise: ffmpeg -vf signalstats,metadata=print
 */
export async function analyzeClipQuality(clipPath: string): Promise<ClipQuality> {
  const args = [
    "-hide_banner",
    "-loglevel",
    "info",
    "-i",
    clipPath,
    "-vf",
    "signalstats,metadata=print:file=-",
    "-an",
    "-f",
    "null",
    "-",
  ];

  const r = await runCmd("ffmpeg", args);

  // ffmpeg écrit beaucoup dans stderr; metadata=print va dans stdout (file=-)
  const text = `${r.stdout}\n${r.stderr}`;

  const yavg: number[] = [];
  const ydif: number[] = [];

  // Exemples possibles (selon versions) :
  // lavfi.signalstats.YAVG=123.4
  // lavfi.signalstats.YDIF=5.67
  const reYAVG = /signalstats\.YAVG=([0-9]+(?:\.[0-9]+)?)/g;
  const reYDIF = /signalstats\.YDIF=([0-9]+(?:\.[0-9]+)?)/g;

  let m: RegExpExecArray | null;
  while ((m = reYAVG.exec(text))) yavg.push(parseFloat(m[1]!));
  while ((m = reYDIF.exec(text))) ydif.push(parseFloat(m[1]!));

  // flicker = mean abs diff of YAVG between consecutive frames
  let flicker = 0;
  if (yavg.length >= 2) {
    let sum = 0;
    for (let i = 1; i < yavg.length; i++) sum += Math.abs(yavg[i]! - yavg[i - 1]!);
    flicker = sum / (yavg.length - 1);
  }

  // motion = mean YDIF if available
  let motionMean: number | undefined;
  if (ydif.length > 0) {
    const sum = ydif.reduce((a, b) => a + b, 0);
    motionMean = sum / ydif.length;
  }

  return {
    flickerMeanAbsDiff: Number.isFinite(flicker) ? flicker : 0,
    motionMeanYDif: Number.isFinite(motionMean as number) ? motionMean : undefined,
    frames: Math.max(yavg.length, ydif.length),
  };
}

/**
 * Décide si un clip doit être reroll / rejeté.
 *
 * Objectif: accepter les mouvements réalistes (petits mouvements naturels),
 * rejeter:
 * - quasi image fixe (slide-show) => motion trop faible
 * - wobble / IA folle => motion trop haut ou flicker trop haut
 */
export function isClipBad(q: ClipQuality, opts?: { allowMoreMotion?: boolean }): boolean {
  const allowMoreMotion = opts?.allowMoreMotion ?? false;

  // Si trop peu de frames détectées, on évite de rejeter sur cette base
  // (ex: clips très courts ou parsing ffmpeg incomplet).
  const tooFewFrames = q.frames > 0 && q.frames < 20;
  if (tooFewFrames) return false;

  // Flicker visible (wobble, scintillement)
  // Légèrement relâché vs 6.0 pour éviter les faux positifs.
  const flickerBad = q.flickerMeanAbsDiff > 6.5;

  // Motion:
  // - trop bas => quasi figé (slideshow)
  // - trop haut => sur-animé / wobble / déformation
  // On tolère plus de motion si allowMoreMotion=true (scènes ambiance).
  const motionTooLow =
    q.motionMeanYDif != null ? q.motionMeanYDif < 0.8 : false;

  const motionTooHigh =
    q.motionMeanYDif != null
      ? q.motionMeanYDif > (allowMoreMotion ? 16.0 : 14.0)
      : false;

  return flickerBad || motionTooHigh || motionTooLow;
}

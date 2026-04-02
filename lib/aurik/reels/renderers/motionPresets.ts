export type MotionPreset =
  | "ZOOM_IN"
  | "ZOOM_OUT"
  | "PAN_LR"
  | "PAN_RL"
  | "PAN_UP"
  | "PAN_DOWN"
  | "DIAG_TL_BR"
  | "DIAG_TR_BL";

const PRESETS: MotionPreset[] = [
  "ZOOM_IN",
  "PAN_LR",
  "ZOOM_OUT",
  "PAN_RL",
  "PAN_UP",
  "PAN_DOWN",
  "DIAG_TL_BR",
  "DIAG_TR_BL",
];

function stableRand01(seedInt: number): number {
  let t = seedInt >>> 0;
  t += 0x6d2b79f5;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}

function pickPreset(sceneIndex: number, motionSeed: number): MotionPreset {
  const s = (sceneIndex + 1) * 10007 + motionSeed * 7919;
  const r = stableRand01(s);
  const idx = Math.floor(r * PRESETS.length) % PRESETS.length;
  return PRESETS[idx];
}

function ffEaseExpr(frames: number): string {
  const denom = Math.max(1, frames - 1);
  return `(1-cos(PI*(on/${denom})))/2`;
}

function clampZoom(z: number): number {
  return Math.max(1.0, Math.min(1.2, z));
}

/**
 * Génère UNIQUEMENT la partie zoompan=... (avec easing + presets).
 *
 * À intégrer dans ton filter_complex existant en remplaçant ton Ken Burns uniforme.
 */
export function buildZoomPanFilter(opts: {
  sceneIndex: number;
  motionSeed?: number;
  durationSec: number;
  fps: number;
  outW: number;
  outH: number;
}): string {
  const { sceneIndex, durationSec, fps, outW, outH } = opts;
  const motionSeed = opts.motionSeed ?? 1337;

  const frames = Math.max(1, Math.round(durationSec * fps));
  const ease = ffEaseExpr(frames);
  const preset = pickPreset(sceneIndex, motionSeed);

  // amplitude stable par scène
  const r = stableRand01((sceneIndex + 1) * 99991 + motionSeed * 17);
  const baseZoom = 1.02;
  const zoomAmp = 0.05 + r * 0.06; // 5% -> 11%
  const targetZoom = clampZoom(baseZoom + zoomAmp);
  const amp = targetZoom - baseZoom;

  const centerX = `(iw-ow)/2`;
  const centerY = `(ih-oh)/2`;
  const panMaxX = `(iw-ow)`;
  const panMaxY = `(ih-oh)`;

  const zZoomIn = `${baseZoom}+(${amp})*(${ease})`;
  const zZoomOut = `${baseZoom}+(${amp})*(1-(${ease}))`;

  let z = `${baseZoom}`;
  let x = centerX;
  let y = centerY;

  switch (preset) {
    case "ZOOM_IN":
      z = zZoomIn;
      x = centerX;
      y = centerY;
      break;

    case "ZOOM_OUT":
      z = zZoomOut;
      x = centerX;
      y = centerY;
      break;

    case "PAN_LR":
      z = `${baseZoom}+0.01*(${ease})`;
      x = `(${panMaxX})*(${ease})`;
      y = centerY;
      break;

    case "PAN_RL":
      z = `${baseZoom}+0.01*(${ease})`;
      x = `(${panMaxX})*(1-(${ease}))`;
      y = centerY;
      break;

    case "PAN_UP":
      z = `${baseZoom}+0.01*(${ease})`;
      x = centerX;
      y = `(${panMaxY})*(1-(${ease}))`;
      break;

    case "PAN_DOWN":
      z = `${baseZoom}+0.01*(${ease})`;
      x = centerX;
      y = `(${panMaxY})*(${ease})`;
      break;

    case "DIAG_TL_BR":
      z = `${baseZoom}+0.015*(${ease})`;
      x = `(${panMaxX})*(${ease})`;
      y = `(${panMaxY})*(${ease})`;
      break;

    case "DIAG_TR_BL":
      z = `${baseZoom}+0.015*(${ease})`;
      x = `(${panMaxX})*(1-(${ease}))`;
      y = `(${panMaxY})*(${ease})`;
      break;
  }

  // IMPORTANT:
  // - zoompan produit exactement "frames"
  // - s=outWxoutH fixe la sortie
  // - fps=... fixe la cadence
  return `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${outW}x${outH}:fps=${fps}`;
}

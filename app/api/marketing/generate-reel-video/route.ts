import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { supabaseServer } from "@/lib/aurik/supabaseServer";

import { loadBusinessAssetsForJob } from "@/lib/aurik/reels/businessAssets";
import { normalizeVisualMode, type VisualMode } from "@/lib/aurik/marketing/visualMode";

import { getJobDir, generateSceneImages, generateVoiceOverMp3 } from "@/lib/aurik/reels/assets";
import { uploadReelVideoAndGetPublicUrl } from "@/lib/aurik/reels/storage";
import type { RenderableScene } from "@/lib/aurik/reels/types";

import { analyzeClipQuality, isClipBad } from "@/lib/aurik/reels/quality/clipQuality";

import { summarizeRunwayRequestBody, isRetryableRunwayStatus } from "@/lib/aurik/reels/runway/runwayGuardrails";

import { renderReelFromHybridMp4, type HybridSceneInput } from "@/lib/aurik/reels/renderers/ffmpegHybridRenderer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type SupabaseServerClient = ReturnType<typeof supabaseServer>;

// =========================
// Types
// =========================
type SubtitleMode = "off" | "discreet" | "normal" | "auto";
type RendererSubtitleMode = "off" | "discreet" | "normal" | "auto";

type Body = {
  reelId: string;
  agentName: string;
  subtitleMode?: SubtitleMode;
  visualMode?: VisualMode;
};

// =========================
// Script -> Scenes
// =========================
function normalizeScenesFromScriptSteps(scriptSteps: any): RenderableScene[] {
  if (Array.isArray(scriptSteps) && scriptSteps.every((x) => typeof x === "string")) {
    return scriptSteps.slice(0, 7).map((t: string, i: number) => ({
      id: `scene-${i + 1}`,
      text: t.trim(),
      imagePrompt:
        "Vertical 9:16, cinematic, high-quality, realistic, sharp details, good lighting. " +
        "Adults only. No minors. " +
        `Scene: ${t.trim()}`,
    }));
  }

  if (Array.isArray(scriptSteps)) {
    return scriptSteps.slice(0, 7).map((s: any, i: number) => {
      const text = String(s?.voiceOverText ?? s?.onScreenText ?? s?.text ?? `Scene ${i + 1}`).trim();
      const imagePrompt = String(s?.imagePrompt ?? `Vertical 9:16, realistic. Adults only. Scene: ${text}`).trim();
      return { id: String(s?.id ?? `scene-${i + 1}`), text, imagePrompt };
    });
  }

  return [];
}

function mapSubtitleModeToRenderer(mode: SubtitleMode | undefined): RendererSubtitleMode {
  return mode ?? "discreet";
}

function sanitizeSceneTextForPrompt(t: string): string {
  return t.replace(/\b(élèves|professeur|enfants|mineur|mineurs)\b/gi, "personnes adultes").trim();
}

function truncate(s: string, max = 220): string {
  if (!s) return s;
  if (s.length <= max) return s;
  return s.slice(0, max) + `…(+${s.length - max} chars)`;
}

// =========================
// Local helpers
// =========================
async function fileExistsAndLargeEnough(p: string, minBytes: number): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isFile() && st.size >= minBytes;
  } catch {
    return false;
  }
}

async function sha256HexFromFile(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function sha256HexFromString(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function detectMimeFromPath(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function fileToDataUri(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  const mime = detectMimeFromPath(filePath);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function extractAssetImagePaths(biz: any): string[] {
  const candidates: any[] = [
    biz?.imagePaths,
    biz?.assetImagePaths,
    biz?.assets,
    biz?.files,
    biz?.paths,
    biz?.images,
  ];

  for (const c of candidates) {
    if (Array.isArray(c) && c.every((x) => typeof x === "string")) return c;
  }

  for (const c of candidates) {
    if (Array.isArray(c) && c.length && typeof c[0] === "object") {
      const paths = c
        .map((x: any) => x?.localPath ?? x?.filePath ?? x?.path ?? x?.tmpPath)
        .filter((p: any) => typeof p === "string");
      if (paths.length) return paths;
    }
  }

  return [];
}

function buildAssetsOnlyHybridScenes(params: {
  scenes: RenderableScene[];
  assetPaths: string[];
  computeSceneSec: (sceneText: string) => 4 | 6;
}): HybridSceneInput[] {
  const { scenes, assetPaths, computeSceneSec } = params;

  const out: HybridSceneInput[] = scenes.map((sc, i) => {
    const asset = assetPaths[Math.min(i, assetPaths.length - 1)];
    return { kind: "image", imagePath: asset, sceneSec: computeSceneSec(sc.text) };
  });

  return out;
}

// =========================
// GLOBAL clip cache (Supabase Storage)
// =========================
const CLIP_CACHE_BUCKET = "aurik-reel-clips-cache";
const CACHE_VERSION = "a29-v1";
const MIN_CLIP_BYTES = 50_000;

function globalCacheStoragePath(key: string) {
  return `v1/${key}.mp4`;
}

async function supabaseCacheDownloadIfExists(params: {
  supabase: SupabaseServerClient;
  key: string;
  outPath: string;
}): Promise<boolean> {
  const storagePath = globalCacheStoragePath(params.key);
  const { data, error } = await params.supabase.storage.from(CLIP_CACHE_BUCKET).download(storagePath);
  if (error || !data) return false;

  const arrayBuf = await data.arrayBuffer();
  await fs.mkdir(path.dirname(params.outPath), { recursive: true });
  await fs.writeFile(params.outPath, Buffer.from(arrayBuf));
  return fileExistsAndLargeEnough(params.outPath, MIN_CLIP_BYTES);
}

async function supabaseCacheUploadBestEffort(params: {
  supabase: SupabaseServerClient;
  key: string;
  filePath: string;
}): Promise<void> {
  const storagePath = globalCacheStoragePath(params.key);
  const buf = await fs.readFile(params.filePath);

  const { error } = await params.supabase.storage.from(CLIP_CACHE_BUCKET).upload(storagePath, buf, {
    contentType: "video/mp4",
    upsert: false,
  });

  if (error) {
    const msg = error.message ?? String(error);
    if (msg.toLowerCase().includes("exists") || msg.includes("409")) return;
    throw error;
  }
}

async function buildGlobalClipCacheKey(params: {
  model: string;
  ratio: string;
  durationSec: number;
  seed: number;
  promptText: string;
  imagePath: string;
}): Promise<string> {
  const imgHash = await sha256HexFromFile(params.imagePath);

  const raw =
    `v=${CACHE_VERSION}\n` +
    `model=${params.model}\n` +
    `ratio=${params.ratio}\n` +
    `duration=${params.durationSec}\n` +
    `seed=${params.seed}\n` +
    `img=${imgHash}\n` +
    `prompt=${params.promptText}\n`;

  return sha256HexFromString(raw);
}

// =========================
// Runway (direct API)
// =========================
const RUNWAY_BASE = "https://api.dev.runwayml.com/v1";
const RUNWAY_VERSION = "2024-11-06";
const RUNWAY_RATIO: "720:1280" = "720:1280";

function getRunwayKey(): string {
  const k = process.env.RUNWAYML_API_SECRET || process.env.RUNWAY_API_KEY;
  if (!k) throw new Error("Missing Runway API key (RUNWAYML_API_SECRET or RUNWAY_API_KEY)");
  return k;
}

function isRunwayDailyLimitError(status: number, body: any): boolean {
  if (status !== 429) return false;
  const msg = String(body?.error ?? "").toLowerCase();
  return msg.includes("daily task limit");
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

type RunwayTaskCreateResp = { id: string };
type RunwayTaskStatusResp = {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";
  output?: any;
  failure?: any;
};

async function runwayJson<T>(urlPath: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${RUNWAY_BASE}${urlPath}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Runway-Version": RUNWAY_VERSION,
      Authorization: `Bearer ${getRunwayKey()}`,
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (res.ok) return (json ?? {}) as T;

  const status = res.status;

  if (isRunwayDailyLimitError(status, json)) {
    throw new Error("RUNWAY_DAILY_LIMIT");
  }

  const details = json?.details ? ` details=${truncate(JSON.stringify(json.details), 600)}` : "";
  const msg =
    json?.error
      ? `Runway API error ${status}: ${json.error}${details}`
      : `Runway API error ${status}: ${truncate(text || res.statusText, 600)}`;

  throw new Error(msg);
}

async function runwayCreateImageToVideoTaskGuarded(params: {
  requestId: string;
  promptImage: string;
  promptText: string;
  ratio: "720:1280";
  duration: number;
  model: "gen4_turbo";
  seed?: number;
}): Promise<{ taskId: string; runwayRequestId?: string }> {
  const maxAttempts = 3;
  const url = `${RUNWAY_BASE}/image_to_video`;

  const body = {
    model: params.model,
    promptImage: params.promptImage,
    promptText: params.promptText,
    ratio: params.ratio,
    duration: params.duration,
    ...(typeof params.seed === "number" ? { seed: params.seed } : {}),
  };

  const safe = summarizeRunwayRequestBody({
    model: params.model,
    ratio: params.ratio,
    duration: params.duration,
    seed: params.seed,
    promptText: params.promptText,
    promptImage: params.promptImage,
  });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now();
    console.log("[AURIK][runway:create_task:attempt]", {
      requestId: params.requestId,
      attempt,
      maxAttempts,
      runwayVersion: RUNWAY_VERSION,
      safe,
    });

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Runway-Version": RUNWAY_VERSION,
          Authorization: `Bearer ${getRunwayKey()}`,
          "x-request-id": params.requestId,
        },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      const status = res.status;

      if (res.ok) {
        const taskId = (json as RunwayTaskCreateResp | null)?.id;
        if (!taskId) throw new Error("Runway returned no task id");

        const runwayRequestId =
          res.headers.get("x-request-id") || res.headers.get("x-runway-request-id") || taskId;

        console.log("[AURIK][runway:create_task:ok]", {
          requestId: params.requestId,
          status,
          ms: Date.now() - started,
          taskId,
          runwayRequestId,
        });

        return { taskId, runwayRequestId };
      }

      if (isRunwayDailyLimitError(status, json)) {
        throw new Error("RUNWAY_DAILY_LIMIT");
      }

      const retryable = isRetryableRunwayStatus(status);

      console.warn("[AURIK][runway:create_task:fail]", {
        requestId: params.requestId,
        status,
        retryable,
        ms: Date.now() - started,
        runwayError: json ?? truncate(text, 600),
        safe,
      });

      if (!retryable || attempt === maxAttempts) {
        const details = json?.details ? ` details=${truncate(JSON.stringify(json.details), 600)}` : "";
        const msg =
          json?.error
            ? `Runway API error ${status}: ${json.error}${details}`
            : `Runway API error ${status}: ${truncate(text || res.statusText, 600)}`;
        throw new Error(msg);
      }

      const waitMs = Math.min(3000, 800 * Math.pow(2, attempt - 1));
      await sleep(waitMs);
    } catch (e: any) {
      const msg = e?.message ?? String(e);

      if (msg === "RUNWAY_DAILY_LIMIT") throw e;

      console.warn("[AURIK][runway:create_task:network_error]", {
        requestId: params.requestId,
        attempt,
        maxAttempts,
        message: truncate(msg, 500),
      });

      if (attempt === maxAttempts) throw e;

      const waitMs = Math.min(3000, 800 * Math.pow(2, attempt - 1));
      await sleep(waitMs);
    }
  }

  throw new Error("Runway create task failed");
}

async function runwayWaitForOutputUrl(taskId: string, timeoutMs: number): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const t = await runwayJson<RunwayTaskStatusResp>(`/tasks/${taskId}`, { method: "GET" });

    if (t.status === "FAILED") {
      throw new Error(`Runway task failed: ${truncate(JSON.stringify(t.failure ?? t), 800)}`);
    }

    if (t.status === "SUCCEEDED") {
      const out = t.output;
      const candidates: string[] = [];

      if (typeof out === "string") candidates.push(out);
      if (Array.isArray(out)) for (const x of out) if (typeof x === "string") candidates.push(x);

      if (out && typeof out === "object") {
        for (const v of Object.values(out)) {
          if (typeof v === "string") candidates.push(v);
          if (Array.isArray(v)) for (const x of v) if (typeof x === "string") candidates.push(x);
        }
      }

      const url = candidates.find((u) => /^https?:\/\//.test(u));
      if (!url) {
        throw new Error(`Runway task succeeded but no output URL found: ${truncate(JSON.stringify(out), 800)}`);
      }
      return url;
    }

    await sleep(2000);
  }

  throw new Error(`Runway task timeout after ${timeoutMs}ms (taskId=${taskId})`);
}

async function downloadToFile(url: string, outPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${res.statusText}`);
  const arrayBuf = await res.arrayBuffer();
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, Buffer.from(arrayBuf));
}

async function runwayImageToVideoToFile(params: {
  requestId: string;
  imagePath: string;
  promptText: string;
  durationSec: 4 | 6 | 8;
  outPath: string;
  timeoutMs: number;
  seed?: number;
}): Promise<void> {
  const dataUri = await fileToDataUri(params.imagePath);

  const { taskId } = await runwayCreateImageToVideoTaskGuarded({
    requestId: params.requestId,
    promptImage: dataUri,
    promptText: params.promptText,
    ratio: RUNWAY_RATIO,
    duration: params.durationSec,
    model: "gen4_turbo",
    seed: params.seed,
  });

  const outUrl = await runwayWaitForOutputUrl(taskId, params.timeoutMs);
  await downloadToFile(outUrl, params.outPath);

  const ok = await fileExistsAndLargeEnough(params.outPath, MIN_CLIP_BYTES);
  if (!ok) throw new Error("Downloaded clip too small");
}

// =========================
// Deadline + perf tuning
// =========================
function getGlobalRunwayDeadlineMs(): number {
  const raw = process.env.AURIK_RUNWAY_DEADLINE_MS;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 60_000) return n;
  return 660_000;
}

function getRunwayConcurrency(): number {
  const raw = process.env.AURIK_RUNWAY_CONCURRENCY;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 3) return Math.floor(n);
  return 2;
}

function getSceneTimeoutBoundsMs(): { minMs: number; maxMs: number } {
  const rawMin = process.env.AURIK_RUNWAY_SCENE_TIMEOUT_MIN_MS;
  const rawMax = process.env.AURIK_RUNWAY_SCENE_TIMEOUT_MAX_MS;
  const min = rawMin ? Number(rawMin) : NaN;
  const max = rawMax ? Number(rawMax) : NaN;

  const minMs = Number.isFinite(min) && min > 30_000 ? min : 90_000;
  const maxMs = Number.isFinite(max) && max > minMs ? max : 300_000;
  return { minMs, maxMs };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function nowMs() {
  return Date.now();
}

function pct(n: number, d: number): string {
  if (!d) return "0%";
  const v = Math.round((n / d) * 100);
  return `${v}%`;
}

// =========================
// Route
// =========================
export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const startedAt = nowMs();
  let reelIdForErrorUpdate: string | null = null;

  try {
    const body = (await req.json()) as Body;

    const visualMode: VisualMode = normalizeVisualMode(body?.visualMode);

    const reelId = body?.reelId?.trim();
    const agentName = body?.agentName?.trim();

    console.log("[Aurik] generate-reel-video:visual-mode", {
      requestId,
      agentName,
      reelId,
      visualMode,
      defaultUsed: !body?.visualMode,
    });

    const subtitleModeInput: SubtitleMode = body?.subtitleMode ?? "discreet";
    const subtitleMode: RendererSubtitleMode = mapSubtitleModeToRenderer(subtitleModeInput);

    reelIdForErrorUpdate = reelId ?? null;

    console.log("[Aurik] generate-reel-video:start", {
      requestId,
      reelId,
      agentName,
      subtitleModeInput,
      subtitleMode,
      visualMode,
      runwayDeadlineMs: getGlobalRunwayDeadlineMs(),
      runwayConcurrency: getRunwayConcurrency(),
      runwaySceneTimeoutBounds: getSceneTimeoutBoundsMs(),
    });

    if (!reelId || !agentName) {
      return NextResponse.json({ ok: false, error: "Paramètres requis: 'reelId', 'agentName'." }, { status: 400 });
    }

    const supabase = supabaseServer();

    const { data: reelRow, error: reelErr } = await supabase
      .from("marketing_generated_reels")
      .select("id, agent_name, script_steps, status")
      .eq("id", reelId)
      .maybeSingle();

    if (reelErr || !reelRow) {
      console.error("[Aurik] generate-reel-video:reel_load_error", {
        requestId,
        message: reelErr?.message ?? "not_found",
      });
      return NextResponse.json({ ok: false, error: "Reel introuvable." }, { status: 404 });
    }

    if (reelRow.agent_name !== agentName) {
      return NextResponse.json({ ok: false, error: "agentName mismatch." }, { status: 403 });
    }

    const scenes = normalizeScenesFromScriptSteps(reelRow.script_steps);
    if (scenes.length < 3) {
      return NextResponse.json({ ok: false, error: "Script invalide (scènes insuffisantes)." }, { status: 400 });
    }

    await supabase.from("marketing_generated_reels").update({ status: "rendering", error_message: null }).eq("id", reelId);

    const jobId = crypto.randomUUID();
    const jobDir = getJobDir(jobId);
    await fs.mkdir(jobDir, { recursive: true });

    console.log("[Aurik] generate-reel-video:assets:start", {
      requestId,
      reelId,
      jobId,
      scenes: scenes.length,
      runwayRatio: RUNWAY_RATIO,
      visualMode,
    });

    const voText = scenes.map((s) => s.text).join("\n");
    const audioPath = await generateVoiceOverMp3({ jobDir, text: voText });

    const biz = await loadBusinessAssetsForJob({
      supabase,
      agentName,
      jobDir,
      maxAssets: 7,
    });

    const assetPaths = extractAssetImagePaths(biz);
    console.log("[Aurik] generate-reel-video:assets:summary", {
      requestId,
      reelId,
      jobId,
      visualMode,
      assetsFound: assetPaths.length,
      contextText: biz?.contextText ? true : false,
    });

    const mentionsPeopleRegex = /\b(dj|danse|danser|foule|gens|personnes|serveur|barman)\b/i;

    const computeSceneDurationFinal = (sceneText: string): 4 | 6 => {
      const words = sceneText.trim().split(/\s+/).filter(Boolean).length;
      const mentionsPeople = mentionsPeopleRegex.test(sceneText);
      return mentionsPeople ? 4 : words >= 14 ? 6 : 4;
    };

    if (visualMode === "assets_only") {
      if (!assetPaths.length) {
        const errMsg = "assets_only: aucun asset disponible pour cet agent. Uploade des photos puis réessaie.";

        await supabase.from("marketing_generated_reels").update({ status: "error", error_message: errMsg }).eq("id", reelId);

        return NextResponse.json({ ok: false, error: errMsg }, { status: 400 });
      }

      const hybridScenesAssetsOnly = buildAssetsOnlyHybridScenes({
        scenes,
        assetPaths: assetPaths.slice(0, 7),
        computeSceneSec: computeSceneDurationFinal,
      });

      console.log("[Aurik] generate-reel-video:visualMode:assets_only", {
        requestId,
        reelId,
        jobId,
        scenes: hybridScenesAssetsOnly.length,
        assetsUsed: Math.min(assetPaths.length, scenes.length),
        runwayCalls: 0,
      });

      const mp4Path = path.join(jobDir, "reel.mp4");
      const { stats } = await renderReelFromHybridMp4({
        scenes: hybridScenesAssetsOnly,
        audioPath,
        outPath: mp4Path,
        width: 1080,
        height: 1920,
        fps: 30,
        transitionSec: 0.25,
        zoomStart: 1.04,
        zoomEnd: 1.09,
        enableMicroPan: true,
        oversampleFactor: 2,
        logTag: "assets_only",
      });

      const mp4Buffer = fsSync.readFileSync(mp4Path);
      const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}-${jobId}.mp4`;

      const up = await uploadReelVideoAndGetPublicUrl({
        agentName,
        filename,
        fileBuffer: mp4Buffer,
      });

      const ms = nowMs() - startedAt;

      const note = `ASSETS_ONLY_OK images=${stats.total}`;

      await supabase
        .from("marketing_generated_reels")
        .update({
          status: "ready",
          video_url: up.publicUrl,
          video_storage_path: up.storagePath,
          error_message: note,
        })
        .eq("id", reelId);

      console.log("[Aurik] generate-reel-video:success", {
        requestId,
        reelId,
        ms,
        videoUrl: up.publicUrl,
        renderMode: "assets_only",
        kenburnsScenes: stats.kenburns,
        runwayScenes: stats.video,
      });

      return NextResponse.json(
        {
          ok: true,
          reelId,
          videoUrl: up.publicUrl,
          videoStoragePath: up.storagePath,
          meta: {
            requestId,
            ms,
            subtitleModeInput,
            subtitleMode,
            visualMode,
            renderMode: "assets_only",
            kenburnsScenes: stats.kenburns,
            runwayScenes: stats.video,
          },
        },
        { status: 200 }
      );
    }

    const scenesForImages =
      biz?.contextText
        ? scenes.map((s) => ({
            ...s,
            imagePrompt: `${s.imagePrompt}\n\n${biz.contextText}`,
          }))
        : scenes;

    const imagePaths = await generateSceneImages({ jobDir, scenes: scenesForImages });

    if (!imagePaths?.length) throw new Error("generateSceneImages returned empty");
    if (!audioPath) throw new Error("generateVoiceOverMp3 returned empty");

    const clipCacheDir = path.join(jobDir, "clips-cache");
    await fs.mkdir(clipCacheDir, { recursive: true });

    const globalStylePrompt =
      "PHOTOREAL live-action footage, real camera capture, documentary realism. " +
      "Adults only (no minors). " +
      "Tripod-locked shot or extremely stable handheld. " +
      "ONLY subtle natural micro-movements. No fast motion. " +
      "Real-world physics, stable geometry, stable faces, stable hands, stable bodies. " +
      "Natural skin texture, realistic lighting and shadows, realistic motion blur. " +
      "No CGI, no 3D render, no cartoon. " +
      "No warping, morphing, wobble, melting, double faces, extra fingers. " +
      "No text, no subtitles, no logos, no watermark.";

    const perSceneDirectives =
      "Camera: LOCKED OFF tripod shot. If any movement: extremely slow 1-2% drift only. " +
      "Lens: 35mm documentary, natural perspective. " +
      "Action: minimal and believable. No exaggerated gestures. " +
      "Keep identity stable across frames. Keep hands correct. Keep facial features consistent.";

    const deadlineMs = getGlobalRunwayDeadlineMs();
    const deadlineAt = startedAt + deadlineMs;

    const { minMs: sceneTimeoutMinMs, maxMs: sceneTimeoutMaxMs } = getSceneTimeoutBoundsMs();
    const runwayConcurrency = getRunwayConcurrency();

    const results: Array<HybridSceneInput | null> = new Array(imagePaths.length).fill(null);

    if (visualMode === "hybrid" && assetPaths.length) {
      const use = assetPaths.slice(0, Math.min(7, results.length));
      for (let i = 0; i < use.length; i++) {
        results[i] = { kind: "image", imagePath: use[i]!, sceneSec: computeSceneDurationFinal(scenes[i]!.text) };
      }

      console.log("[Aurik] generate-reel-video:visualMode:hybrid:prefill_assets", {
        requestId,
        reelId,
        jobId,
        assetsUsed: use.length,
        totalScenes: results.length,
      });
    }

    let runwayDailyLimitHit = false;
    let globalDeadlineHit = false;

    const remainingMs = () => deadlineAt - nowMs();

    const markDeadlineIfNeeded = (tag: string) => {
      if (!globalDeadlineHit && nowMs() >= deadlineAt) {
        globalDeadlineHit = true;
        console.warn("[Aurik] runway:global_deadline_hit -> per-scene fallback", {
          requestId,
          reelId,
          jobId,
          tag,
          elapsedMs: nowMs() - startedAt,
          deadlineMs,
        });
      }
    };

    const computeSceneTimeoutMs = () => {
      const reserveMs = 55_000;
      const rem = remainingMs() - reserveMs;
      const budget = clamp(rem, 0, sceneTimeoutMaxMs);
      return clamp(budget, sceneTimeoutMinMs, sceneTimeoutMaxMs);
    };

    const computeSceneDurationFinalForIndex = (i: number): 4 | 6 => computeSceneDurationFinal(scenes[i]!.text);

    const computePriority = (i: number) => {
      const t = scenes[i]?.text ?? "";
      const words = t.trim().split(/\s+/).filter(Boolean).length;
      const mentionsPeople = mentionsPeopleRegex.test(t);

      let score = 0;
      if (i === 0) score += 35;
      if (i === 1) score += 20;
      if (mentionsPeople) score += 30;
      score += Math.min(20, Math.floor(words / 2));
      return score;
    };

    const buildScene = async (i: number): Promise<HybridSceneInput> => {
      const imgPath = imagePaths[i]!;
      const scene = scenes[i]!;
      const durationFinal = computeSceneDurationFinal(scene.text);

      markDeadlineIfNeeded("pre_scene");
      if (runwayDailyLimitHit || globalDeadlineHit) {
        return { kind: "image", imagePath: imgPath, sceneSec: durationFinal };
      }

      const localBest = path.join(clipCacheDir, `scene-${i + 1}-best.mp4`);
      if (await fileExistsAndLargeEnough(localBest, MIN_CLIP_BYTES)) {
        return { kind: "video", videoPath: localBest, sceneSec: durationFinal };
      }

      const sceneText = sanitizeSceneTextForPrompt(scene.text);
      const seedBase = (i + 1) * 1000;

      const MAX_ATTEMPTS = 2;
      let bestPath: string | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        markDeadlineIfNeeded("mid_scene");
        if (runwayDailyLimitHit || globalDeadlineHit) break;

        const strictness = attempt === 1 ? "" : "EXTREMELY realistic. Camera locked. Zero deformation. Zero warp.";

        const promptText = `${globalStylePrompt} ${perSceneDirectives} ${strictness} Scene: ${sceneText}`;
        const seed = seedBase + attempt * 17;

        const clipAttemptOut = path.join(clipCacheDir, `scene-${i + 1}-try${attempt}.mp4`);

        const cacheKey = await buildGlobalClipCacheKey({
          model: "gen4_turbo",
          ratio: RUNWAY_RATIO,
          durationSec: durationFinal,
          seed,
          promptText,
          imagePath: imgPath,
        });

        let haveClip = await supabaseCacheDownloadIfExists({
          supabase,
          key: cacheKey,
          outPath: clipAttemptOut,
        });

        if (!haveClip) {
          const timeoutMs = computeSceneTimeoutMs();

          try {
            await runwayImageToVideoToFile({
              requestId,
              imagePath: imgPath,
              promptText,
              durationSec: durationFinal,
              outPath: clipAttemptOut,
              timeoutMs,
              seed,
            });

            haveClip = await fileExistsAndLargeEnough(clipAttemptOut, MIN_CLIP_BYTES);

            if (haveClip) {
              try {
                await supabaseCacheUploadBestEffort({
                  supabase,
                  key: cacheKey,
                  filePath: clipAttemptOut,
                });
              } catch (e: any) {
                console.warn("[Aurik] runway:global_cache_put_failed", {
                  requestId,
                  reelId,
                  jobId,
                  sceneIndex: i,
                  attempt,
                  cacheKey,
                  message: e?.message ?? String(e),
                });
              }
            }
          } catch (e: any) {
            const msg = e?.message ?? String(e);

            if (msg === "RUNWAY_DAILY_LIMIT") {
              runwayDailyLimitHit = true;
              console.warn("[Aurik] runway:daily_limit_hit -> per-scene fallback", { requestId, reelId, jobId });
              break;
            }

            if (String(msg).toLowerCase().includes("timeout")) {
              console.warn("[Aurik] runway:scene_timeout -> fallback_this_scene", {
                requestId,
                reelId,
                jobId,
                sceneIndex: i,
                attempt,
                timeoutMs,
                remainingMs: remainingMs(),
              });
              break;
            }

            console.warn("[Aurik] runway:gen_try_failed", {
              requestId,
              reelId,
              jobId,
              sceneIndex: i,
              attempt,
              maxGenTries: MAX_ATTEMPTS,
              msg: truncate(msg, 600),
            });

            continue;
          }
        }

        if (!haveClip) continue;

        const q = await analyzeClipQuality(clipAttemptOut);
        const motionPart = q.motionMeanYDif != null ? q.motionMeanYDif * 1.25 : 0;
        const score = q.flickerMeanAbsDiff + motionPart;
        const bad = isClipBad(q, { allowMoreMotion: false });

        if (score < bestScore) {
          bestScore = score;
          bestPath = clipAttemptOut;
        }

        if (!bad) break;
      }

      if (runwayDailyLimitHit || globalDeadlineHit || !bestPath) {
        return { kind: "image", imagePath: imgPath, sceneSec: durationFinal };
      }

      await fs.copyFile(bestPath, localBest);
      return { kind: "video", videoPath: localBest, sceneSec: durationFinal };
    };

    const queue: number[] = Array.from({ length: imagePaths.length }, (_, i) => i)
      .filter((i) => results[i] == null || visualMode === "ai_only")
      .sort((a, b) => computePriority(b) - computePriority(a));

    console.log("[Aurik] runway:plan", {
      requestId,
      reelId,
      jobId,
      visualMode,
      scenes: queue.length,
      deadlineMs,
      concurrency: runwayConcurrency,
      timeoutBounds: { sceneTimeoutMinMs, sceneTimeoutMaxMs },
      order: queue.map((i) => ({
        i,
        p: computePriority(i),
        text: truncate(scenes[i]?.text ?? "", 80),
      })),
    });

    let nextQ = 0;

    const worker = async (workerId: number) => {
      while (true) {
        const qi = nextQ;
        nextQ++;
        if (qi >= queue.length) return;

        const i = queue[qi]!;
        markDeadlineIfNeeded(`worker_${workerId}_before`);

        if (runwayDailyLimitHit || globalDeadlineHit) {
          const imgPath = imagePaths[i]!;
          results[i] = { kind: "image", imagePath: imgPath, sceneSec: computeSceneDurationFinalForIndex(i) };
          continue;
        }

        try {
          const out = await buildScene(i);
          results[i] = out;
        } catch (e: any) {
          const msg = e?.message ?? String(e);
          console.warn("[Aurik] runway:scene_unexpected_error -> fallback_this_scene", {
            requestId,
            reelId,
            jobId,
            sceneIndex: i,
            message: truncate(msg, 600),
          });

          const imgPath = imagePaths[i]!;
          results[i] = { kind: "image", imagePath: imgPath, sceneSec: computeSceneDurationFinalForIndex(i) };
        }
      }
    };

    await Promise.all(new Array(runwayConcurrency).fill(null).map((_, idx) => worker(idx + 1)));

    const hybridScenes: HybridSceneInput[] = results.map((x, i) => {
      if (x) return x;
      const imgPath = imagePaths[i]!;
      return { kind: "image", imagePath: imgPath, sceneSec: computeSceneDurationFinalForIndex(i) };
    });

    const runwayVideos = hybridScenes.filter((s) => s.kind === "video").length;
    const kenburnsScenes = hybridScenes.filter((s) => s.kind === "image").length;

    console.log("[Aurik] runway:summary", {
      requestId,
      reelId,
      jobId,
      visualMode,
      runwayDailyLimitHit,
      globalDeadlineHit,
      video: runwayVideos,
      kenburns: kenburnsScenes,
      total: hybridScenes.length,
      ratio: `${runwayVideos}/${hybridScenes.length} (${pct(runwayVideos, hybridScenes.length)})`,
      elapsedMs: nowMs() - startedAt,
      remainingMs: remainingMs(),
    });

    const mp4Path = path.join(jobDir, "reel.mp4");

    console.log("[Aurik] generate-reel-video:render_hybrid:start", {
      requestId,
      reelId,
      jobId,
      totalScenes: hybridScenes.length,
      runwayVideos,
      kenburnsScenes,
      visualMode,
      reason: runwayDailyLimitHit
        ? "runway_daily_limit"
        : globalDeadlineHit
        ? "timeout"
        : kenburnsScenes > 0
        ? "partial_fallback"
        : "all_runway",
      elapsedMs: nowMs() - startedAt,
      deadlineMs,
      remainingMs: remainingMs(),
    });

    const { stats } = await renderReelFromHybridMp4({
      scenes: hybridScenes,
      audioPath,
      outPath: mp4Path,
      width: 1080,
      height: 1920,
      fps: 30,
      transitionSec: 0.25,
      zoomStart: 1.04,
      zoomEnd: 1.09,
      enableMicroPan: true,
      oversampleFactor: 2,
      logTag: visualMode === "hybrid" ? "hybrid" : "ai_only",
    });

    const mp4Buffer = fsSync.readFileSync(mp4Path);
    const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}-${jobId}.mp4`;

    const up = await uploadReelVideoAndGetPublicUrl({
      agentName,
      filename,
      fileBuffer: mp4Buffer,
    });

    const ms = nowMs() - startedAt;

    const fallbackNote =
      stats.kenburns > 0
        ? `HYBRID_OK runway=${stats.video}/${stats.total} kenburns=${stats.kenburns}/${stats.total} visualMode=${visualMode} reason=${
            runwayDailyLimitHit ? "runway_daily_limit" : globalDeadlineHit ? "timeout" : "partial_fallback"
          }`
        : `RUNWAY_OK all_scenes_video visualMode=${visualMode}`;

    await supabase
      .from("marketing_generated_reels")
      .update({
        status: "ready",
        video_url: up.publicUrl,
        video_storage_path: up.storagePath,
        error_message: fallbackNote,
      })
      .eq("id", reelId);

    console.log("[Aurik] generate-reel-video:success", {
      requestId,
      reelId,
      ms,
      videoUrl: up.publicUrl,
      visualMode,
      renderMode: stats.kenburns > 0 ? "hybrid" : "runway",
      kenburnsScenes: stats.kenburns,
      runwayScenes: stats.video,
      fallbackReason: runwayDailyLimitHit
        ? "runway_daily_limit"
        : globalDeadlineHit
        ? "timeout"
        : stats.kenburns > 0
        ? "partial_fallback"
        : null,
    });

    return NextResponse.json(
      {
        ok: true,
        reelId,
        videoUrl: up.publicUrl,
        videoStoragePath: up.storagePath,
        meta: {
          requestId,
          ms,
          subtitleModeInput,
          subtitleMode,
          visualMode,
          runwayRatio: RUNWAY_RATIO,
          renderMode: stats.kenburns > 0 ? "hybrid" : "runway",
          kenburnsScenes: stats.kenburns,
          runwayScenes: stats.video,
          fallbackReason: runwayDailyLimitHit
            ? "runway_daily_limit"
            : globalDeadlineHit
            ? "timeout"
            : stats.kenburns > 0
            ? "partial_fallback"
            : null,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    const ms = nowMs() - startedAt;
    const msg = err?.message ?? String(err);

    console.error("[Aurik] generate-reel-video:error", {
      requestId,
      ms,
      message: msg,
    });

    try {
      if (reelIdForErrorUpdate) {
        const supabase = supabaseServer();
        await supabase.from("marketing_generated_reels").update({ status: "error", error_message: msg }).eq("id", reelIdForErrorUpdate);
      }
    } catch (e: any) {
      console.warn("[Aurik] generate-reel-video:error:update_status_failed", {
        requestId,
        message: e?.message ?? String(e),
      });
    }

    return NextResponse.json({ ok: false, error: msg || "Erreur lors de la génération vidéo." }, { status: 500 });
  }
}
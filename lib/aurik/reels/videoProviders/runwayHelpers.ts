import fs from "node:fs/promises";
import path from "node:path";
import { RunwayProvider } from "./runway";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fileToDataImageUri(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // Runway accepts data:image/...; keep it simple
  let mime = "image/png";
  if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
  if (ext === ".webp") mime = "image/webp";

  // Guardrail: docs indicate data:image inputs have limits; keep under ~5MB typical
  const max = 5 * 1024 * 1024;
  if (buf.length > max) {
    throw new Error(
      `Image too large for data URI (${Math.round(buf.length / 1024)}KB). Reduce size or use HTTPS upload approach.`
    );
  }

  const b64 = buf.toString("base64");
  return `data:${mime};base64,${b64}`;
}

export async function runwayImageToVideoToFile(opts: {
  imageDataUri: string;
  promptText: string;
  durationSec: number; // will be clamped to 4/6/8
  aspectRatio: "9:16" | "16:9" | "1:1";
  outPath: string;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 12 * 60 * 1000; // 12 min safety
  const started = Date.now();

  const { jobId } = await RunwayProvider.createVideoFromImage({
    imageUrl: opts.imageDataUri,
    prompt: opts.promptText,
    durationSec: opts.durationSec,
    aspectRatio: opts.aspectRatio,
  });

  // Poll
  while (true) {
    const status = await RunwayProvider.getJobStatus(jobId);

    if (status === "completed") break;
    if (status === "failed") {
      // will throw more detail
      await RunwayProvider.downloadResult(jobId);
      throw new Error("Runway job failed");
    }

    if (Date.now() - started > timeoutMs) {
      throw new Error(`Runway timeout after ${Math.round(timeoutMs / 1000)}s (jobId=${jobId})`);
    }

    await sleep(4000);
  }

  const { videoUrl } = await RunwayProvider.downloadResult(jobId);

  // Download mp4 to outPath (Runway URLs are ephemeral; download & store) :contentReference[oaicite:1]{index=1}
  const res = await fetch(videoUrl);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to download Runway output: ${res.status} ${txt}`);
  }

  const arr = new Uint8Array(await res.arrayBuffer());
  await fs.mkdir(path.dirname(opts.outPath), { recursive: true });
  await fs.writeFile(opts.outPath, arr);
}

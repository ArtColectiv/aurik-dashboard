import {
  VideoProvider,
  CreateVideoFromImageInput,
  VideoJobStatus,
} from "./types";

const RUNWAY_API_BASE = "https://api.dev.runwayml.com/v1";
const RUNWAY_VERSION = "2024-11-06"; // required by Runway

function getApiKey(): string {
  const key = process.env.RUNWAY_API_KEY;
  if (!key) throw new Error("RUNWAY_API_KEY is missing");
  return key;
}

async function runwayFetch<T>(path: string, options: RequestInit): Promise<T> {
  const res = await fetch(`${RUNWAY_API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Runway-Version": RUNWAY_VERSION,
      Authorization: `Bearer ${getApiKey()}`,
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Runway API error ${res.status}: ${txt}`);
  }

  return (await res.json()) as T;
}

function mapAspectRatioToRatio(r: CreateVideoFromImageInput["aspectRatio"]): string {
  // Image-to-video ratios differ from text-to-video; 9:16 maps to 720:1280 in docs.
  if (r === "9:16") return "720:1280";
  if (r === "16:9") return "1280:720";
  return "960:960"; // 1:1
}

function clampDurationToAccepted(d: number): 4 | 6 | 8 {
  // Runway accepts 4/6/8 seconds
  if (d <= 5) return 4;
  if (d <= 7) return 6;
  return 8;
}

export const RunwayProvider: VideoProvider = {
  name: "runway",

  async createVideoFromImage(input: CreateVideoFromImageInput) {
    const ratio = mapAspectRatioToRatio(input.aspectRatio);
    const duration = clampDurationToAccepted(input.durationSec);

    // Runway image_to_video uses promptImage + position=first + promptText
    const payload = {
      model: "gen4_turbo",
      promptImage: input.imageUrl, // can be https://, runway://, or data:image/...
      position: "first",
      ratio,
      duration,
      // optional
      ...(input.prompt ? { promptText: input.prompt } : {}),
    };

    const data = await runwayFetch<{ id: string }>(`/image_to_video`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return { jobId: data.id };
  },

  async getJobStatus(jobId: string): Promise<VideoJobStatus> {
    const data = await runwayFetch<{ status: string; failureCode?: string }>(
      `/tasks/${jobId}`,
      { method: "GET" }
    );

    // statuses are typically: QUEUED, RUNNING, SUCCEEDED, FAILED (case varies by docs/version)
    const s = String(data.status || "").toUpperCase();

    if (s === "SUCCEEDED") return "completed";
    if (s === "FAILED") return "failed";
    if (s === "QUEUED") return "queued";
    if (s === "RUNNING" || s === "PROCESSING") return "running";

    // fallback
    return "running";
  },

  async downloadResult(jobId: string) {
    const data = await runwayFetch<{
      status: string;
      output?: string[];
      failureCode?: string;
    }>(`/tasks/${jobId}`, { method: "GET" });

    const s = String(data.status || "").toUpperCase();
    if (s === "FAILED") {
      throw new Error(`Runway task failed${data.failureCode ? `: ${data.failureCode}` : ""}`);
    }

    const url = data.output?.[0];
    if (!url) throw new Error("Runway result not ready or missing output[0]");

    return { videoUrl: url };
  },
};

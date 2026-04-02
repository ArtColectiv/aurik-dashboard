export type VideoJobStatus = "queued" | "running" | "completed" | "failed";

export interface CreateVideoFromImageInput {
  imageUrl: string;      // URL publique de l'image source
  prompt?: string;       // prompt optionnel (style / mouvement)
  durationSec: number;   // durée cible (ex: 4–6s)
  aspectRatio: "9:16" | "16:9" | "1:1";
}

export interface VideoProvider {
  name: string;

  createVideoFromImage(
    input: CreateVideoFromImageInput
  ): Promise<{ jobId: string }>;

  getJobStatus(jobId: string): Promise<VideoJobStatus>;

  downloadResult(jobId: string): Promise<{
    videoUrl: string; // URL publique ou signée
  }>;
}

// lib/aurik/marketing/visualMode.ts

export type VisualMode = "ai_only" | "assets_only" | "hybrid";

export const VISUAL_MODE_DEFAULT: VisualMode = "hybrid";

export function normalizeVisualMode(input: unknown): VisualMode {
  if (typeof input !== "string") return VISUAL_MODE_DEFAULT;

  const v = input.trim().toLowerCase();
  if (v === "ai_only" || v === "assets_only" || v === "hybrid") return v;

  return VISUAL_MODE_DEFAULT;
}

export function isVisualMode(input: unknown): input is VisualMode {
  return (
    typeof input === "string" &&
    (input === "ai_only" || input === "assets_only" || input === "hybrid")
  );
}

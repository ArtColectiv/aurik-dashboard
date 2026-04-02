import fs from "fs";
import path from "path";
import OpenAI from "openai";
import type { RenderableScene } from "./types";

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function getJobDir(jobId: string) {
  return path.join(process.cwd(), ".tmp", "aurik-reels", jobId);
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");
  return new OpenAI({ apiKey });
}

export async function generateVoiceOverMp3(args: {
  jobDir: string;
  text: string;
}): Promise<string> {
  ensureDir(args.jobDir);
  const openai = getOpenAIClient();

  const outPath = path.join(args.jobDir, "voice.mp3");

  console.log("[Aurik] reels/assets:tts:start", { chars: args.text.length });

  // TTS OpenAI via SDK (audio.speech.create)
  // Si ton compte n'a pas accès à ce modèle, l'erreur sera capturée par la route (status=error).
const speech = await openai.audio.speech.create({
  model: "gpt-4o-mini-tts",
  voice: "alloy",
  format: "mp3",
  input: args.text,
} as any);

  const arrayBuffer = await speech.arrayBuffer();
  fs.writeFileSync(outPath, Buffer.from(arrayBuffer));

  console.log("[Aurik] reels/assets:tts:ok", { outPath });
  return outPath;
}

export async function generateSceneImages(args: {
  jobDir: string;
  scenes: RenderableScene[];
}): Promise<string[]> {
  ensureDir(args.jobDir);
  const openai = getOpenAIClient();

  console.log("[Aurik] reels/assets:images:start", { scenes: args.scenes.length });

  const outPaths: string[] = [];

  for (let i = 0; i < args.scenes.length; i++) {
    const scene = args.scenes[i];
    const outPath = path.join(args.jobDir, `scene-${String(i + 1).padStart(2, "0")}.png`);

    // IMPORTANT: ne PAS utiliser response_format (contrainte connue)
    const img = await openai.images.generate({
      model: "gpt-image-1",
      prompt: scene.imagePrompt,
      size: "1024x1536", // vertical
    });

    const b64 = img.data?.[0]?.b64_json;
    if (!b64) {
      console.error("[Aurik] reels/assets:images:no_b64", { index: i });
      throw new Error("Image generation failed (no b64_json)");
    }

    fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
    outPaths.push(outPath);
  }

  console.log("[Aurik] reels/assets:images:ok", { count: outPaths.length });
  return outPaths;
}

import crypto from "node:crypto";
import * as OpenAIClient from "@/lib/aurik/openaiClient";

// IMPORTANT:
// On ne dépend PAS d'un type "ReelDraftResult" qui n'existe plus.
// On définit des types locaux stables ici.
export type ReelDraftScene = {
  id: string;
  text: string;
  imagePrompt: string;
};

export type ReelDraft = {
  jobId: string;
  scenes: ReelDraftScene[];
  caption?: string;
  callToAction?: string;
  hashtags?: string[];
  coverPrompt?: string;
  meta?: {
    music?: { enabled: boolean; mood?: string; ducking?: boolean };
  };
};

function safeString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

function safeStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const arr = v
    .filter((x) => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length ? arr : undefined;
}

function normalizeScenes(raw: any): ReelDraftScene[] {
  // 1) déjà bon format
  if (Array.isArray(raw) && raw.every((x) => x && typeof x === "object")) {
    const out: ReelDraftScene[] = [];
    for (let i = 0; i < raw.length; i++) {
      const s = raw[i];
      const text = safeString(s.text ?? s.voiceOverText ?? s.onScreenText) ?? `Scene ${i + 1}`;
      const imagePrompt =
        safeString(s.imagePrompt) ??
        `Vertical 9:16, cinematic, photorealistic, documentary realism, adults only. Scene: ${text}`;
      const id = safeString(s.id) ?? `scene-${i + 1}`;
      out.push({ id, text, imagePrompt });
    }
    return out;
  }

  // 2) tableau de strings
  if (Array.isArray(raw) && raw.every((x) => typeof x === "string")) {
    return raw.map((t: string, i: number) => ({
      id: `scene-${i + 1}`,
      text: t.trim(),
      imagePrompt:
        "Vertical 9:16, cinematic, photoreal live-action, documentary realism, stable faces/hands, adults only. " +
        `Scene: ${t.trim()}`,
    }));
  }

  return [];
}

function clampScenes(scenes: ReelDraftScene[], min = 6, max = 8): ReelDraftScene[] {
  if (scenes.length >= min && scenes.length <= max) return scenes;
  if (scenes.length > max) return scenes.slice(0, max);

  const out = [...scenes];
  while (out.length < min) {
    const base = scenes[out.length % Math.max(1, scenes.length)]?.text ?? `Scene ${out.length + 1}`;
    out.push({
      id: `scene-${out.length + 1}`,
      text: base,
      imagePrompt:
        "Vertical 9:16, cinematic, photoreal live-action, documentary realism, adults only. " +
        `Scene: ${base}`,
    });
  }
  return out;
}

// Appelle ton client OpenAI existant sans supposer son API exacte.
async function callOpenAIText(prompt: string): Promise<string> {
  // Patterns probables selon tes fichiers:
  // - OpenAIClient.openaiText({ prompt, ... })
  // - OpenAIClient.generateText({ prompt, ... })
  // - OpenAIClient.completeText({ prompt, ... })
  // - OpenAIClient.runText({ prompt, ... })
  // - OpenAIClient.openaiClient.chat.completions.create(...) etc.
  const anyClient = OpenAIClient as any;

  if (typeof anyClient.openaiText === "function") {
    return await anyClient.openaiText({
      purpose: "aurik_reel_script",
      prompt,
      temperature: 0.7,
    });
  }

  if (typeof anyClient.generateText === "function") {
    return await anyClient.generateText({
      purpose: "aurik_reel_script",
      prompt,
      temperature: 0.7,
    });
  }

  if (typeof anyClient.completeText === "function") {
    return await anyClient.completeText({
      prompt,
      temperature: 0.7,
    });
  }

  // Fallback ultime: si ton openaiClient expose directement le SDK
  // et qu’on peut faire un chat.completions.create
  const client = anyClient.openai ?? anyClient.client ?? anyClient.openaiClient;
  if (client?.chat?.completions?.create) {
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [{ role: "user", content: prompt }],
    });
    const txt = resp?.choices?.[0]?.message?.content;
    if (typeof txt === "string" && txt.trim()) return txt.trim();
  }

  throw new Error(
    "Aurik openaiClient: aucune fonction texte compatible trouvée (openaiText/generateText/completeText ou SDK client.chat.completions.create)."
  );
}

/**
 * Génère un brouillon de Reel (script + meta)
 */
export async function generateReelDraft(params: {
  subject: string;
  platform?: string;
  tone?: string;
}): Promise<ReelDraft> {
  const jobId = crypto.randomUUID();

  const subject = (params.subject ?? "").trim();
  const platform = (params.platform ?? "instagram").trim();
  const tone = (params.tone ?? "uplifting").trim();

  const prompt = `
Tu es un expert marketing vidéo.
Génère un script de Reel vertical 9:16 sur le sujet suivant : "${subject}"
Plateforme: ${platform}
Ton: ${tone}

Contraintes OBLIGATOIRES:
- 6 à 8 scènes
- chaque scène: une phrase de voice-over (FR) + un prompt image (FR) photoréaliste (adults only).
- format JSON STRICT avec les clés:
{
  "scenes": [{"text": "...", "imagePrompt": "..."}],
  "caption": "...",
  "callToAction": "...",
  "hashtags": ["..."],
  "coverPrompt": "..."
}
AUCUN texte hors JSON.
`.trim();

  const raw = await callOpenAIText(prompt);

  // parse JSON le plus safe possible
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
    else parsed = {};
  }

  const scenes = clampScenes(normalizeScenes(parsed?.scenes), 6, 8);

  const draft: ReelDraft = {
    jobId,
    scenes,
    caption: safeString(parsed?.caption),
    callToAction: safeString(parsed?.callToAction ?? parsed?.call_to_action),
    hashtags: safeStringArray(parsed?.hashtags),
    coverPrompt: safeString(parsed?.coverPrompt ?? parsed?.cover_prompt),
    meta: {
      music: { enabled: false, mood: tone, ducking: true },
    },
  };

  console.log("[Aurik] generateReelDraft:success", {
    jobId,
    scenes: draft.scenes.length,
    hashtags: draft.hashtags?.length ?? 0,
  });

  return draft;
}

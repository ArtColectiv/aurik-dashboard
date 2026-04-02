import { NextRequest, NextResponse } from "next/server";
import { safeChatCompletion } from "@/lib/aurik/openaiClient";

type ActionPlan = {
  title: string;
  description: string;
  channel: string;
  payload: Record<string, unknown>;
  expectedImpact: number;
};

type ActionRunBody = {
  agentName?: string;
  objective?: string;
};

const TEXT_MODEL =
  process.env.OPENAI_MARKETING_MODEL || "gpt-4.1-mini";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safeTrim(value: unknown): string | null {
  if (!isNonEmptyString(value)) return null;
  return value.trim();
}

function normalizeExpectedImpact(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0.01, Math.min(0.95, value));
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0.01, Math.min(0.95, parsed));
    }
  }

  return 0.15;
}

function normalizePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ActionRunBody;

    const agentName = safeTrim(body.agentName);
    const objective = safeTrim(body.objective);

    if (!agentName || !objective) {
      return NextResponse.json(
        { ok: false, error: "agentName et objective requis" },
        { status: 400 }
      );
    }

    const userPrompt = `
Tu es un expert en opérations commerciales, acquisition client et exécution business.

Ta mission :
proposer UNE action concrète, réaliste et directement exploitable selon l’objectif fourni.

[Agent]
Nom: ${agentName}

[Objectif utilisateur]
${objective}

Consignes :
- L’action doit être cohérente avec l’objectif exact.
- Ne parle pas de brunch, DJ, clinique ou Instagram sauf si l’objectif l’implique clairement.
- Choisis le canal le plus logique selon le contexte.
- Le payload doit être simple, concret et exploitable.
- expectedImpact doit être un nombre entre 0.01 et 0.95.
- Réponds STRICTEMENT en JSON.

Format JSON attendu :
{
  "title": "...",
  "description": "...",
  "channel": "...",
  "payload": {
    "target": "...",
    "messageTemplate": "...",
    "offer": "...",
    "cta": "..."
  },
  "expectedImpact": 0.22
}
`.trim();

    const completion = await safeChatCompletion({
      model: TEXT_MODEL,
      system:
        "Tu es un assistant spécialisé en action planning business. Tu respectes strictement le format JSON demandé.",
      userPrompt,
      response_format: { type: "json_object" },
    });

    let parsed: Record<string, unknown> = {};

    try {
      parsed = JSON.parse(completion) as Record<string, unknown>;
    } catch (err) {
      console.error("[Aurik] action skill pack parse error:", err, completion);

      return NextResponse.json(
        {
          ok: false,
          error: "Réponse IA invalide pour Action Skill Pack",
        },
        { status: 500 }
      );
    }

    const action: ActionPlan = {
      title:
        typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title.trim()
          : "Action recommandée",
      description:
        typeof parsed.description === "string" && parsed.description.trim()
          ? parsed.description.trim()
          : `Proposer une action concrète pour atteindre cet objectif: ${objective}`,
      channel:
        typeof parsed.channel === "string" && parsed.channel.trim()
          ? parsed.channel.trim()
          : "Canal à confirmer",
      payload: normalizePayload(parsed.payload),
      expectedImpact: normalizeExpectedImpact(parsed.expectedImpact),
    };

    return NextResponse.json({
      ok: true,
      agentName,
      action,
      meta: {
        createdAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur Action Skill Pack";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
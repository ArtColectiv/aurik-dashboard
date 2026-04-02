import { safeChatCompletion } from "../openaiClient";
import { normalizeBrandProfile, BrandProfile } from "../marketing/brandProfile";

const TEXT_MODEL =
  process.env.OPENAI_MARKETING_MODEL || "gpt-4.1-mini";

type GenerateLeadActionOptions = {
  agentName: string;
  brandProfile: BrandProfile;
  goalDescription: string;
  targetAudience?: string;
  preferences?: any;
};

export async function generateLeadAction(
  options: GenerateLeadActionOptions,
) {
  const normalizedBrand = normalizeBrandProfile(options.brandProfile);

  const userPrompt = `
Tu es un expert en génération de leads et acquisition client.

Ton rôle est de proposer UNE action concrète qui génère des leads rapidement.

[Marque]
Nom: ${normalizedBrand.brandName || options.agentName}
Description: ${normalizedBrand.description || "—"}
Ton: ${normalizedBrand.toneOfVoice || "standard"}

[Audience cible]
${options.targetAudience || normalizedBrand.targetAudience || "non précisé"}

[Objectif]
${options.goalDescription}

[Préférences]
${JSON.stringify(options.preferences ?? {}, null, 2)}

Tâche :
- Propose une action simple et efficace pour générer des leads
- Donne un message / hook
- Donne un call-to-action
- Donne un canal recommandé (DM, landing page, email, etc.)

Répond STRICTEMENT en JSON :

{
  "action": "...",
  "hook": "...",
  "callToAction": "...",
  "channel": "...",
  "expectedConversionLift": 0.1
}
`.trim();

  const completion = await safeChatCompletion({
    model: TEXT_MODEL,
    system:
      "Tu es un assistant spécialisé en génération de leads. Tu respectes strictement le format JSON.",
    userPrompt,
    response_format: { type: "json_object" },
  });

  let parsed: any = {};

  try {
    parsed = JSON.parse(completion);
  } catch (err) {
    console.error("[Aurik] leadGeneration parse error:", err, completion);
  }

  return {
    action: parsed.action ?? "",
    hook: parsed.hook ?? "",
    callToAction: parsed.callToAction ?? "",
    channel: parsed.channel ?? "unknown",
    expectedConversionLift:
      typeof parsed.expectedConversionLift === "number"
        ? parsed.expectedConversionLift
        : 0.05,
  };
}

export const leadGenerationSkillPack = {
  generateLeadAction,
};
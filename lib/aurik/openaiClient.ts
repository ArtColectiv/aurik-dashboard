// lib/aurik/openaiClient.ts
import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('[Aurik] OPENAI_API_KEY manquant dans les variables d’environnement.');
}

export const openai = new OpenAI({
  apiKey: apiKey ?? '',
});

export type SafeChatCompletionParams = {
  model: string;
  system: string;
  /**
   * Texte envoyé au modèle. Tu peux utiliser `user` ou `userPrompt`,
   * l’un des deux doit être défini.
   */
  user?: string;
  userPrompt?: string;
  /**
   * Optionnel : JSON mode, etc.
   */
  response_format?: { type: 'json_object' } | undefined;
};

export async function safeChatCompletion(
  params: SafeChatCompletionParams,
): Promise<string> {
  const { model, system, user, userPrompt, response_format } = params;

  const content = user ?? userPrompt;

  if (!content) {
    console.error('[Aurik] safeChatCompletion appelé sans contenu user.', {
      content,
      params,
    });
    throw new Error(
      "safeChatCompletion: paramètre 'user' ou 'userPrompt' manquant.",
    );
  }

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content },
    ],
    ...(response_format ? { response_format } : {}),
  });

  const message = response.choices[0]?.message?.content;

  if (!message) {
    console.error('[Aurik] safeChatCompletion: réponse vide', response);
    throw new Error('Réponse vide du modèle OpenAI.');
  }

  return message;
}

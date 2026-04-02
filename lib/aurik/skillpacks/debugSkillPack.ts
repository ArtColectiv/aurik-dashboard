// lib/aurik/skillpacks/debugSkillPack.ts

import { registerSkillPack } from "./registry";
import type {
  SkillPack,
  SkillPackResult,
  SkillPackTaskContext,
} from "./types";

/**
 * Skill Pack de test pour vérifier que :
 *  - le registre fonctionne
 *  - la route API peut exécuter un Skill Pack
 */
const debugSkillPack: SkillPack = {
  id: "debug",
  name: "Debug Skill Pack",
  description: "Skill pack de test pour vérifier le pipeline des tâches.",
  supportedTaskTypes: ["debug_message"],

  canHandle(task: SkillPackTaskContext): boolean {
    return task.type === "debug_message";
  },

  async runTask(task: SkillPackTaskContext): Promise<SkillPackResult> {
    const payload = task.payload as any;

    let inputMessage: string | undefined;

    // On essaie de récupérer un champ "message" dans le payload si présent
    if (
      payload &&
      typeof payload === "object" &&
      typeof payload.message === "string"
    ) {
      inputMessage = payload.message;
    }

    const resultMessage = inputMessage
      ? `DebugSkillPack a reçu le message: "${inputMessage}" pour l'agent ${task.agentId}.`
      : `DebugSkillPack a reçu une tâche de type "${task.type}" pour l'agent ${task.agentId}.`;

    const result: SkillPackResult = {
      success: true,
      message: resultMessage,
      data: {
        agentId: task.agentId,
        taskType: task.type,
        payload,
      },
    };

    return result;
  },
};

// Enregistré automatiquement dans le registre au moment de l'import du fichier
registerSkillPack(debugSkillPack);

export { debugSkillPack };

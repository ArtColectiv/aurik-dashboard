// lib/aurik/skillpacks/types.ts

// Type générique pour représenter un type de tâche.
// Exemple : "debug_message", "generate_post", "analyze_campaign", etc.
export type SkillPackTaskType = string;

/**
 * Contexte envoyé à un Skill Pack quand on lui demande d'exécuter une tâche.
 * Ce type pourra évoluer plus tard, mais on garde déjà une base propre.
 */
export interface SkillPackTaskContext {
  // ID de l'agent Aurik qui exécute la tâche
  agentId: string;

  // ID de la tâche en base (optionnel pour l'instant, mais utile si dispo)
  taskId?: string;

  // Type logique de la tâche (ex: "debug_message", "marketing.generate_ad", etc.)
  type: SkillPackTaskType;

  // Données brutes envoyées par le front ou la route API
  // Exemple : { message: "..." } ou { campaignId: "..." }
  payload: unknown;

  // Métadonnées optionnelles (ex: userId, source, etc.)
  metadata?: Record<string, unknown>;
}

/**
 * Résultat standard renvoyé par un Skill Pack après exécution d'une tâche.
 */
export interface SkillPackResult {
  // Indique si la tâche a réussi ou non
  success: boolean;

  // Message humain lisible résumant le résultat
  message: string;

  // Données optionnelles renvoyées par le Skill Pack (ex: analyse, contenu généré, etc.)
  data?: unknown;

  // Message d'erreur détaillé en cas d'échec
  error?: string;
}

/**
 * Contrat minimal pour tous les Skill Packs.
 * Chaque Skill Pack est une sorte de "plugin" qui sait traiter certains types de tâches.
 */
export interface SkillPack {
  // Identifiant unique du Skill Pack (ex: "debug", "marketing-basic", "finance-analyzer")
  id: string;

  // Nom lisible (ex: "Debug Skill Pack", "Marketing Basic Pack")
  name: string;

  // Description courte de ce que fait ce Skill Pack
  description?: string;

  // Liste des types de tâches supportés de façon déclarative (optionnelle)
  // Exemple : ["debug_message", "marketing.generate_post"]
  supportedTaskTypes?: SkillPackTaskType[];

  /**
   * Fonction optionnelle permettant au Skill Pack de décider lui-même
   * s'il peut gérer une tâche donnée (en plus ou à la place de supportedTaskTypes).
   */
  canHandle?(task: SkillPackTaskContext): boolean;

  /**
   * Méthode principale : exécuter une tâche donnée pour un agent.
   * C'est cette fonction que la route API appellera via le registre.
   */
  runTask(task: SkillPackTaskContext): Promise<SkillPackResult>;
}

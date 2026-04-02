// lib/aurik/skillpacks/registry.ts

import type {
  SkillPack,
  SkillPackTaskContext,
} from "./types";

/**
 * Registre interne des Skill Packs.
 * On utilise un Map pour des lookups rapides par id.
 */
const skillPackRegistry = new Map<string, SkillPack>();

/**
 * Enregistre un Skill Pack dans le registre global.
 * À appeler typiquement au moment de l'import du Skill Pack.
 */
export function registerSkillPack(skillPack: SkillPack): void {
  if (skillPackRegistry.has(skillPack.id)) {
    console.warn(
      `[Aurik][SkillPackRegistry] Skill pack avec l'id "${skillPack.id}" est déjà enregistré. Il sera écrasé.`
    );
  }

  skillPackRegistry.set(skillPack.id, skillPack);
}

/**
 * Récupère un Skill Pack par son identifiant.
 */
export function getSkillPackById(id: string): SkillPack | undefined {
  return skillPackRegistry.get(id);
}

/**
 * Retourne tous les Skill Packs enregistrés.
 * Utile pour du debug ou plus tard pour afficher une "marketplace" interne.
 */
export function getAllSkillPacks(): SkillPack[] {
  return Array.from(skillPackRegistry.values());
}

/**
 * Trouve un Skill Pack capable de gérer une tâche donnée.
 * Logique simple pour l'instant :
 *  1. On regarde d'abord les canHandle(...) personnalisés.
 *  2. Sinon, on regarde supportedTaskTypes.
 *  3. Sinon, on renvoie undefined.
 *
 * Cette fonction pourra être raffinée plus tard (priorités, plusieurs packs, etc.).
 */
export function findSkillPackForTask(
  task: SkillPackTaskContext
): SkillPack | undefined {
  const all = getAllSkillPacks();

  // 1) D'abord ceux qui définissent une fonction canHandle(...)
  for (const pack of all) {
    if (typeof pack.canHandle === "function") {
      try {
        if (pack.canHandle(task)) {
          return pack;
        }
      } catch (error) {
        console.error(
          `[Aurik][SkillPackRegistry] Erreur dans canHandle() du pack "${pack.id}" :`,
          error
        );
      }
    }
  }

  // 2) Ensuite ceux qui ont supportedTaskTypes déclarés
  for (const pack of all) {
    if (Array.isArray(pack.supportedTaskTypes)) {
      if (pack.supportedTaskTypes.includes(task.type)) {
        return pack;
      }
    }
  }

  // 3) Aucun Skill Pack trouvé
  return undefined;
}

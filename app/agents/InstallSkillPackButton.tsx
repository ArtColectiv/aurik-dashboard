"use client";

import { useEffect, useState } from "react";

interface InstallSkillPackButtonProps {
  agentName: string;
}

type SkillPack = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  category?: string | null;
  version?: string | null;
  tags?: string[] | null;
  is_public?: boolean | null;
};

export function InstallSkillPackButton({ agentName }: InstallSkillPackButtonProps) {
  const [skillPacks, setSkillPacks] = useState<SkillPack[]>([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [skillPackId, setSkillPackId] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // 🔹 Charger la liste des Skill Packs disponibles
  useEffect(() => {
    async function loadSkillPacks() {
      setPacksLoading(true);
      setStatus(null);

      try {
        const res = await fetch("/api/skill-packs");
        const data = await res.json().catch(() => null);

        if (!res.ok || !data) {
          console.error("Erreur /api/skill-packs:", data);
          setStatus("Erreur lors du chargement des Skill Packs.");
          return;
        }

        const packs: SkillPack[] = data.skillPacks ?? [];
        setSkillPacks(packs);

        // Si on a au moins un pack, on pré-sélectionne le premier
        if (packs.length > 0 && !skillPackId) {
          setSkillPackId(packs[0].id);
        }
      } catch (error) {
        console.error("loadSkillPacks error:", error);
        setStatus("Erreur technique lors du chargement des Skill Packs.");
      } finally {
        setPacksLoading(false);
      }
    }

    loadSkillPacks();
    // on ne met pas skillPackId dans les deps pour ne pas relancer le fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleInstall() {
    setStatus(null);

    if (!skillPackId.trim()) {
      setStatus("Veuillez sélectionner un Skill Pack ou entrer un ID valide.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/install-skill-pack", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentName,
          skillPackId: skillPackId.trim(),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        console.error("Erreur install-skill-pack:", data);
        setStatus(
          (data?.error || "Erreur lors de l'installation du Skill Pack.") +
            (data?.details ? ` : ${data.details}` : "")
        );
        return;
      }

      if (data.error) {
        setStatus(
          data.error + (data.details ? ` : ${data.details}` : "")
        );
        return;
      }

      setStatus(
        data.message ||
          `Skill Pack installé avec succès sur l'agent "${agentName}".`
      );
    } catch (error) {
      console.error("Erreur handleInstall:", error);
      setStatus("Erreur technique lors de l'installation.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 p-4 rounded-xl border border-slate-800 bg-slate-900/70">
      <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
        Installer un Skill Pack
      </h3>
      <p className="text-xs text-slate-500 mt-1">
        Sélectionne un Skill Pack existant pour l’installer sur cet agent.
      </p>

      {/* Sélecteur de Skill Pack */}
      <div className="mt-3 space-y-2">
        <label className="text-[11px] text-slate-400 uppercase tracking-[0.16em]">
          Skill Pack disponible
        </label>

        <select
          value={skillPackId}
          onChange={(e) => setSkillPackId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          disabled={packsLoading || loading || skillPacks.length === 0}
        >
          {packsLoading && <option>Chargement...</option>}

          {!packsLoading && skillPacks.length === 0 && (
            <option>Aucun Skill Pack disponible</option>
          )}

          {!packsLoading &&
            skillPacks.length > 0 &&
            skillPacks.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.name} {pack.version ? `(${pack.version})` : ""}
              </option>
            ))}
        </select>

        {/* Champ ID (toujours visible / éditable au cas où) */}
        <div className="flex gap-2 items-center mt-2">
          <input
            type="text"
            value={skillPackId}
            onChange={(e) => setSkillPackId(e.target.value)}
            placeholder="Skill Pack ID (UUID)"
            className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={handleInstall}
            disabled={loading || !skillPackId.trim()}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-900 disabled:cursor-wait text-xs font-medium text-white transition"
          >
            {loading ? "Installation..." : "Installer"}
          </button>
        </div>
      </div>

      {status && (
        <p className="mt-2 text-xs text-slate-400">
          <span className="text-emerald-400">• </span>
          {status}
        </p>
      )}
    </div>
  );
}

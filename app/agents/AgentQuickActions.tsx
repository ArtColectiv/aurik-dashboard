"use client";

import { useState } from "react";
import Link from "next/link";

type AgentQuickActionsProps = {
  agentId: string; // UUID (source of truth)
  agentName?: string; // optional display/compat
};

type Preset = {
  id: string;
  label: string;
  prompt: string;
};

const PRESETS: Preset[] = [
  {
    id: "summary",
    label: "Résumé des 3 dernières tâches",
    prompt:
      "Fais un résumé clair et structuré des 3 dernières tâches que tu as effectuées pour ce client. Explique ce que tu as appris et quelles actions tu recommanderais ensuite.",
  },
  {
    id: "next-move",
    label: "Prochaine action intelligente",
    prompt:
      "En te basant sur l'historique récent et ce que tu sais de ce client, propose la prochaine action la plus utile à exécuter pour créer de la valeur business concrète.",
  },
  {
    id: "risk",
    label: "Analyse de risque / opportunités",
    prompt:
      "Analyse les risques et opportunités actuels pour ce client dans ton domaine d'expertise. Classe-les par priorité et suggère un plan d'action.",
  },
];

export default function AgentQuickActions({
  agentId,
  agentName,
}: AgentQuickActionsProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!agentId) return null;

  async function runPreset(preset: Preset) {
    setLoadingId(preset.id);
    setError(null);
    setLastResult(null);

    try {
      const res = await fetch("/api/run-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          // compat pour l'ancien backend (si encore utilisé)
          agentName,
          task: preset.prompt,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("API /api/run-task error:", text);
        setError(`Erreur API (${res.status})`);
        return;
      }

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      const resultText =
        (data && typeof data.result === "string"
          ? data.result
          : data && typeof data.message === "string"
          ? data.message
          : "Tâche envoyée à l'agent. Le détail est dans agent_events.") ?? "";

      setLastResult(resultText);
    } catch (e) {
      console.error(e);
      setError("Erreur réseau ou serveur");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
          Actions intelligentes
        </p>

        <p className="text-[11px] text-slate-500">
          Agent :{" "}
          <span className="font-mono text-emerald-300">
            {agentName ?? agentId}
          </span>
        </p>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
        <p className="text-xs text-slate-300">
          Clique sur une action pour envoyer une tâche à cet agent. Le résultat
          est enregistré dans <code className="font-mono">agent_events</code>.
        </p>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => runPreset(preset)}
              disabled={loadingId === preset.id}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                loadingId === preset.id
                  ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-200 cursor-wait"
                  : "bg-slate-950/60 border-slate-700 text-slate-100 hover:border-emerald-400/60 hover:text-emerald-200"
              }`}
            >
              {loadingId === preset.id ? "En cours…" : preset.label}
            </button>
          ))}

          <Link
            href={`/marketing/assets?agentId=${encodeURIComponent(agentId)}`}
            className="text-xs px-3 py-1.5 rounded-full border transition-colors bg-slate-950/60 border-slate-700 text-slate-100 hover:border-emerald-400/60 hover:text-emerald-200"
          >
            Upload Assets
          </Link>
        </div>

        {error && (
          <p className="text-xs text-red-400 border border-red-500/40 rounded-md px-3 py-2 bg-red-950/30">
            {error}
          </p>
        )}

        {lastResult && !error && (
          <div className="mt-2 border-t border-slate-800 pt-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-1">
              Dernier résultat
            </p>
            <pre className="text-[11px] text-slate-200 bg-slate-950/60 border border-slate-800 rounded-lg p-3 max-h-56 overflow-auto whitespace-pre-wrap">
              {lastResult}
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}
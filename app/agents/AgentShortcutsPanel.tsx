"use client";

import { useState } from "react";

export type Shortcut = {
  id: string;
  label: string;
  prompt: string;
};

interface AgentShortcutsPanelProps {
  agentId: string; // UUID (source of truth)
  agentName?: string; // optional display
  shortcuts?: Shortcut[];
}

export default function AgentShortcutsPanel({
  agentId,
  agentName,
  shortcuts = [],
}: AgentShortcutsPanelProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  if (!agentId) return null;

  async function runShortcut(sc: Shortcut) {
    setLoadingId(sc.id);
    setStatus(null);
    setLastResult(null);

    try {
      const res = await fetch("/api/run-task", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId,
          // compat temporaire si backend lit encore agentName
          agentName,
          task: sc.prompt,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        throw new Error(`HTTP ${res.status}`);
      }

      setStatus(`Tâche envoyée: "${sc.label}"`);

      if (typeof data.result === "string" && data.result.trim().length > 0) {
        setLastResult(data.result.trim());
      } else {
        setLastResult(null);
      }
    } catch {
      setStatus("Erreur lors de l'envoi de la tâche.");
      setLastResult(null);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="p-6 bg-slate-900/80 rounded-2xl border border-slate-800">
      <div className="mb-3 flex justify-between items-center">
        <h2 className="text-sm font-semibold text-slate-100">
          Actions rapides
        </h2>
        <span className="text-xs text-slate-500 font-mono">
          {agentName ?? agentId}
        </span>
      </div>

      {shortcuts.length === 0 && (
        <p className="text-sm text-slate-500">
          Aucun raccourci disponible.
        </p>
      )}

      {shortcuts.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-3">
          {shortcuts.map((sc) => (
            <button
              key={sc.id}
              type="button"
              onClick={() => runShortcut(sc)}
              disabled={loadingId === sc.id}
              className="px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-900 disabled:cursor-wait text-xs font-medium text-white transition"
            >
              {loadingId === sc.id ? "Exécution..." : sc.label}
            </button>
          ))}
        </div>
      )}

      {status && (
        <p className="text-xs text-slate-400 mt-3">
          <span className="text-emerald-400">• </span>
          {status}
        </p>
      )}

      {lastResult && (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
            Dernière sortie
          </h3>
          <p className="mt-2 text-sm text-slate-100 whitespace-pre-wrap">
            {lastResult}
          </p>
        </div>
      )}
    </div>
  );
}
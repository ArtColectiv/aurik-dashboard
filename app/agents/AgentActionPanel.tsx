"use client";

import React, { useState } from "react";

type AgentActionPanelProps = {
  agentId: string;
  agentName: string;
};

type ActionPlan = {
  title: string;
  description: string;
  channel: string;
  payload: Record<string, unknown>;
  expectedImpact: number;
};

type ActionRunSuccessResponse = {
  ok: true;
  agentName?: string;
  action?: ActionPlan;
  meta?: {
    createdAt?: string;
  };
  debug?: string;
  received?: Record<string, unknown>;
};

type ActionRunErrorResponse = {
  ok: false;
  error?: string;
};

type ActionRunResponse = ActionRunSuccessResponse | ActionRunErrorResponse;

async function safeReadJson(res: Response): Promise<unknown | null> {
  try {
    const txt = await res.text();
    if (!txt) return null;
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function fmtPct(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${(value * 100).toFixed(0)}%`;
}

function hasAction(
  result: ActionRunResponse | null
): result is ActionRunSuccessResponse & { action: ActionPlan } {
  return Boolean(
    result &&
      result.ok &&
      result.action &&
      typeof result.action.title === "string" &&
      typeof result.action.description === "string" &&
      typeof result.action.channel === "string"
  );
}

export default function AgentActionPanel({
  agentId,
  agentName,
}: AgentActionPanelProps) {
  const [objective, setObjective] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<ActionRunResponse | null>(null);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);

  async function handleGenerateAction(e: React.FormEvent) {
    e.preventDefault();

    const trimmedObjective = objective.trim();

    if (!trimmedObjective) {
      setError("Entre un objectif d’action.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setExecutionMessage(null);

    try {
      const res = await fetch("/api/skillpacks/action/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentName,
          objective: trimmedObjective,
        }),
      });

      const json = (await safeReadJson(res)) as ActionRunResponse | null;

      if (!res.ok || !json?.ok) {
        throw new Error(
          (json && "error" in json && json.error) ||
            "Erreur lors de la génération de l’action."
        );
      }

      setResult(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleMockExecute() {
    if (!hasAction(result)) return;

    setExecutionMessage(
      `Action prête à exécuter: "${result.action.title}" via ${result.action.channel}.`
    );
  }

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xs uppercase text-slate-400">
            SKILL PACK ACTION
          </h2>
          <p className="text-[11px] text-slate-500 mt-1">
            Prépare une action concrète prête à exécuter. V1 = validation
            humaine obligatoire.
          </p>
        </div>

        <div className="text-[10px] text-slate-500">
          agent_id: <span className="text-slate-400">{agentId}</span>
        </div>
      </div>

      <form onSubmit={handleGenerateAction} className="space-y-4">
        <div>
          <label className="block text-[11px] uppercase text-slate-400 mb-1">
            Objectif d’action
          </label>
          <input
            type="text"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="ex: générer une action concrète pour relancer les nouveaux followers Instagram"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-black text-sm font-medium hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Génération en cours…" : "Generate Action Plan"}
          </button>
        </div>
      </form>

      <div className="mt-4 border-t border-slate-800 pt-4 space-y-3">
        <h3 className="text-[11px] uppercase text-slate-400">RESULTAT</h3>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {!error && !result && !loading && (
          <p className="text-[11px] text-slate-500">
            Aucun plan d’action généré pour l’instant.
          </p>
        )}

        {loading && (
          <p className="text-[11px] text-slate-400">
            Aurik prépare une action exploitable…
          </p>
        )}

        {hasAction(result) && (
          <div className="space-y-3">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 text-sm">
              <p className="text-[11px] uppercase text-slate-400">
                Action proposée
              </p>

              <p className="font-semibold text-slate-50">
                {result.action.title}
              </p>

              <p className="text-slate-300 whitespace-pre-line">
                {result.action.description}
              </p>

              <div className="text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Canal:</span>{" "}
                {result.action.channel}
              </div>

              <div className="text-xs text-slate-400">
                <span className="font-semibold text-slate-300">
                  Impact attendu:
                </span>{" "}
                {fmtPct(result.action.expectedImpact)}
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs space-y-2">
              <p className="text-[11px] uppercase text-slate-400">Payload</p>

              <pre className="whitespace-pre-wrap break-words text-slate-300">
                {JSON.stringify(result.action.payload, null, 2)}
              </pre>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleMockExecute}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 text-black text-sm font-medium hover:bg-white"
              >
                Execute Action (mock)
              </button>

              {result.meta?.createdAt && (
                <span className="text-[11px] text-slate-500">
                  créé le {new Date(result.meta.createdAt).toLocaleString()}
                </span>
              )}
            </div>

            {executionMessage && (
              <div className="bg-emerald-950/40 border border-emerald-800 rounded-xl p-3 text-xs text-emerald-300">
                {executionMessage}
              </div>
            )}
          </div>
        )}

        {result?.ok && !hasAction(result) && (
          <div className="space-y-3">
            <div className="bg-amber-950/30 border border-amber-800 rounded-xl p-3 text-xs text-amber-200">
              Route de debug active. Pas encore de plan d’action exploitable.
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs space-y-2">
              <p className="text-[11px] uppercase text-slate-400">Debug</p>

              <pre className="whitespace-pre-wrap break-words text-slate-300">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
"use client";

import React, { useState } from "react";

type AgentLeadGenerationPanelProps = {
  agentId: string;
  agentName: string;
};

type LeadActionResult = {
  action: string;
  hook: string;
  callToAction: string;
  channel: string;
  expectedConversionLift: number;
};

type MultiImpactResult = {
  metric: string;
  actionType: string;
  impactId: string | null;
  nextPostValue: number | null;
};

type LeadGenerationResponse =
  | {
      ok: true;
      agentId: string;
      agentName: string;
      anchorId: string;
      leadAction: LeadActionResult;
      multiImpactResults: MultiImpactResult[];
      nextExperienceCapital: number | null;
      meta?: {
        requestId?: string;
        ms?: number;
      };
    }
  | {
      ok: false;
      error?: string;
      meta?: {
        requestId?: string;
        ms?: number;
      };
    };

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
  return `${(value * 100).toFixed(1)}%`;
}

export default function AgentLeadGenerationPanel({
  agentId,
  agentName,
}: AgentLeadGenerationPanelProps) {
  const [goalDescription, setGoalDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<LeadGenerationResponse | null>(null);

  async function handleRunLeadGeneration(e: React.FormEvent) {
    e.preventDefault();

    const trimmedGoal = goalDescription.trim();
    const trimmedAudience = targetAudience.trim();

    if (!trimmedGoal) {
      setError("Entre un objectif de génération de leads.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/skillpacks/lead-generation/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentName,
          goalDescription: trimmedGoal,
          targetAudience: trimmedAudience || undefined,
        }),
      });

      const json = (await safeReadJson(res)) as LeadGenerationResponse | null;

      if (!res.ok || !json?.ok) {
        throw new Error(
          (json && "error" in json && json.error) ||
            "Erreur lors de l’exécution du skill pack lead generation."
        );
      }

      setResult(json);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erreur inconnue";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xs uppercase text-slate-400">
            SKILL PACK LEAD GENERATION
          </h2>
          <p className="text-[11px] text-slate-500 mt-1">
            Génère une action concrète d’acquisition, puis alimente
            automatiquement les impacts leads, clicks, conversion_rate
            et appointments.
          </p>
        </div>

        <div className="text-[10px] text-slate-500">
          agent_id: <span className="text-slate-400">{agentId}</span>
        </div>
      </div>

      <form onSubmit={handleRunLeadGeneration} className="space-y-4">
        <div>
          <label className="block text-[11px] uppercase text-slate-400 mb-1">
            Objectif lead generation
          </label>
          <input
            type="text"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="ex: trouver une action simple pour générer des leads pour un brunch électro à Montréal"
            value={goalDescription}
            onChange={(e) => setGoalDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase text-slate-400 mb-1">
            Audience cible
          </label>
          <input
            type="text"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="ex: 25-40 ans, Montréal, brunch, musique house, sorties de jour"
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-black text-sm font-medium hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Exécution en cours…" : "Run Lead Generation Skill Pack"}
          </button>
        </div>
      </form>

      <div className="mt-4 border-t border-slate-800 pt-4 space-y-3">
        <h3 className="text-[11px] uppercase text-slate-400">
          RESULTAT
        </h3>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {!error && !result && !loading && (
          <p className="text-[11px] text-slate-500">
            Aucun résultat pour l’instant. Lance une action lead generation.
          </p>
        )}

        {loading && (
          <p className="text-[11px] text-slate-400">
            Aurik prépare une action d’acquisition…
          </p>
        )}

        {result && result.ok && (
          <div className="space-y-3">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 text-sm">
              <p className="text-[11px] uppercase text-slate-400">
                Action recommandée
              </p>

              <div>
                <p className="font-semibold text-slate-50">
                  {result.leadAction.action}
                </p>
              </div>

              <div>
                <p className="text-slate-300 whitespace-pre-line">
                  <span className="font-semibold text-slate-200">Hook:</span>{" "}
                  {result.leadAction.hook}
                </p>
              </div>

              <div>
                <p className="text-emerald-400 font-medium whitespace-pre-line">
                  {result.leadAction.callToAction}
                </p>
              </div>

              <div className="text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Canal:</span>{" "}
                {result.leadAction.channel}
              </div>

              <div className="text-xs text-slate-400">
                <span className="font-semibold text-slate-300">
                  Lift attendu:
                </span>{" "}
                {fmtPct(result.leadAction.expectedConversionLift)}
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 text-sm">
              <p className="text-[11px] uppercase text-slate-400">
                Multi-impact généré
              </p>

              {result.multiImpactResults.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  Aucun impact retourné.
                </p>
              ) : (
                <div className="space-y-2">
                  {result.multiImpactResults.map((impact) => (
                    <div
                      key={`${impact.metric}-${impact.actionType}`}
                      className="rounded-lg border border-slate-800 bg-slate-900 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-slate-100 font-medium">
                            {impact.metric}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {impact.actionType}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-emerald-400 font-semibold">
                            {impact.nextPostValue ?? "—"}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            post_value
                          </p>
                        </div>
                      </div>

                      <div className="mt-2 text-[11px] text-slate-500 break-all">
                        impact_id: {impact.impactId ?? "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs space-y-1">
              <p className="text-[11px] uppercase text-slate-400">
                Debug exécution
              </p>
              <p className="text-slate-400 break-all">
                anchorId: {result.anchorId}
              </p>
              <p className="text-slate-400">
                experience après run: {result.nextExperienceCapital ?? "—"}
              </p>
              <p className="text-slate-400">
                requestId: {result.meta?.requestId ?? "—"}
              </p>
              <p className="text-slate-400">
                durée: {result.meta?.ms ?? "—"} ms
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
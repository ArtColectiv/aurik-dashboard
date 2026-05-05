import { supabase } from "@/lib/supabaseClient";
import { CreateAutoAgentPanel } from "./CreateAutoAgentPanel";
import { AgentTaskConsole } from "./AgentTaskConsole";
import Link from "next/link";

export default async function AgentsPage() {
  // 1) On récupère la vue combinée agents + métriques
  const { data: agentsData, error: metricsError } = await supabase
    .from("agent_overview")
    .select("*")
    .order("aurik_score", { ascending: false });

  if (metricsError) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="bg-red-900/40 border border-red-500/40 px-8 py-6 rounded-2xl shadow-xl max-w-lg w-full">
          <h1 className="text-2xl font-semibold mb-3">Aurik Dashboard</h1>
          <p className="text-red-200 text-sm">
            Erreur en lisant{" "}
            <code className="font-mono">agent_overview</code> :{" "}
            <span className="font-mono">{metricsError.message}</span>
          </p>
        </div>
      </div>
    );
  }

  const agents = agentsData ?? [];
  const primaryAgent = agents[0] ?? null;

  // 2) On va chercher les derniers événements pour l'agent principal
  let events: any[] = [];
  let eventsErrorMessage: string | null = null;

  if (primaryAgent) {
    const { data: evts, error: eventsError } = await supabase
      .from("agent_events")
      .select("*")
      .eq("agent_name", primaryAgent.agent_name)
      .order("created_at", { ascending: false })
      .limit(10);

    if (eventsError) {
      eventsErrorMessage = eventsError.message;
    } else {
      events = evts ?? [];
    }
  }

  // 3) Utilitaire pour afficher les dates
  const formatDateTime = (value: string | null) => {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              <span className="text-emerald-400">Aurik</span>{" "}
              <span className="text-slate-100">Dashboard</span>
            </h1>
            <p className="text-xs text-slate-400">
              Vue d&apos;ensemble de tes agents apprenants
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
              Mode
            </p>
            <p className="text-xs font-medium text-slate-200">Observation</p>
          </div>
        </div>
      </header>

      {/* Contenu */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Cas aucun agent */}
        {agents.length === 0 && (
          <div className="border border-dashed border-slate-700 rounded-2xl p-8 text-center text-slate-400">
            <p className="text-sm">
              Aucun agent trouvé dans{" "}
              <code className="font-mono">agent_overview</code>.
            </p>
            <p className="text-xs mt-2 text-slate-500">
              Crée ton premier agent Aurik pour voir la valeur évoluer ici.
            </p>
          </div>
        )}

        {/* Si on a des agents */}
        {agents.length > 0 && (
          <>
            {/* Résumé */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-1">
                  Agents
                </p>
                <p className="text-2xl font-semibold text-slate-50">
                  {agents.length}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Entités actives dans ton écosystème Aurik
                </p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-1">
                  Score moyen
                </p>
                <p className="text-2xl font-semibold text-emerald-400">
                  {(
                    agents.reduce(
                      (sum: number, a: any) =>
                        sum + Number(a.aurik_score ?? 0),
                      0
                    ) / agents.length
                  ).toFixed(2)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Indicateur global de maturité des agents
                </p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-1">
                  Tâches totales
                </p>
                <p className="text-2xl font-semibold text-slate-50">
                  {agents.reduce(
                    (sum: number, a: any) => sum + (a.tasks_count ?? 0),
                    0
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Volume de travail traité par tes agents
                </p>
              </div>
            </section>

            {/* Liste des agents */}
            <section className="space-y-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-1">
                Agents
              </p>
              <div className="space-y-3">
                {agents.map((agent: any) => {
                  const score = Number(agent.aurik_score ?? 0);
                  let badgeLabel = "Bronze";
                  let badgeColor =
                    "bg-amber-500/10 text-amber-300 border-amber-500/40";

                  if (score >= 5) {
                    badgeLabel = "Platine";
                    badgeColor =
                      "bg-sky-500/10 text-sky-300 border-sky-500/40";
                  } else if (score >= 3) {
                    badgeLabel = "Or";
                    badgeColor =
                      "bg-emerald-500/10 text-emerald-300 border-emerald-500/40";
                  } else if (score >= 1.5) {
                    badgeLabel = "Argent";
                    badgeColor =
                      "bg-slate-200/10 text-slate-100 border-slate-400/40";
                  }

                  const tasksCount = agent.tasks_count ?? 0;

                  return (
                    <div
                      key={agent.agent_name}
                      className="bg-slate-900/80 border border-slate-800 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:border-emerald-500/40 transition-colors"
                    >
                      <div>
                        <div className="flex items-center flex-wrap gap-2">
                          <p className="text-sm font-semibold text-slate-50">
                            {agent.agent_name}
                          </p>

                          {/* Badge niveau (Bronze / Argent / Or / Platine) */}
                          <span
                            className={
                              "inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-medium " +
                              badgeColor
                            }
                          >
                            {badgeLabel}
                          </span>

                          {/* Badge "Nouveau" si aucune tâche encore */}
                          {(!tasksCount || tasksCount === 0) && (
                            <span className="inline-flex items-center rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-[2px] text-[10px] font-medium text-emerald-300">
                              Nouveau
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-500 mt-1">
                          Tâches: {tasksCount} · Longueur moyenne:{" "}
                          {agent.avg_output_length != null
                            ? Math.round(Number(agent.avg_output_length))
                            : "—"}{" "}
                          caractères
                        </p>
                        {agent.last_activity && (
                          <p className="text-[11px] text-slate-500 mt-1">
                            Dernière activité:{" "}
                            {formatDateTime(agent.last_activity)}
                          </p>
                        )}
                      </div>

                      <div className="text-right">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          Aurik Score
                        </p>
                        <p className="text-2xl font-semibold text-emerald-400 leading-none">
                          {score.toFixed(2)}
                        </p>
                        <Link
                          href={`/agents/${encodeURIComponent(
                            agent.agent_name
                          )}`}
                          className="mt-2 inline-block text-[11px] text-emerald-300 hover:text-emerald-200 underline underline-offset-4"
                        >
                          Voir le détail
                        </Link>
                      </div>

                    </div>
                  );
                })}
              </div>
            </section>

            {/* Détail rapide pour l'agent principal */}
            {primaryAgent && (
              <section className="mt-10">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-3">
                  Détail rapide
                </p>
                <div className="border border-slate-800 rounded-2xl p-5 bg-slate-900/80 mb-4">
                  <p className="text-sm text-slate-200 mb-2">
                    Fiche express de{" "}
                    <span className="text-emerald-400 font-semibold">
                      {primaryAgent.agent_name}
                    </span>
                  </p>
                  <ul className="text-sm text-slate-400 list-disc list-inside space-y-1">
                    <li>
                      Tâches totales:{" "}
                      <span className="text-slate-100">
                        {primaryAgent.tasks_count ?? 0}
                      </span>
                    </li>
                    <li>
                      Score actuel:{" "}
                      <span className="text-emerald-400 font-semibold">
                        {Number(primaryAgent.aurik_score ?? 0).toFixed(2)}
                      </span>
                    </li>
                    <li>
                      Longueur moyenne de sortie:{" "}
                      <span className="text-slate-100">
                        {primaryAgent.avg_output_length != null
                          ? Math.round(
                              Number(primaryAgent.avg_output_length)
                            )
                          : "—"}{" "}
                        caractères
                      </span>
                    </li>
                    <li>
                      Dernière activité:{" "}
                      <span className="text-slate-100">
                        {formatDateTime(primaryAgent.last_activity)}
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="border border-slate-800 rounded-2xl p-5 bg-slate-900/80">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-slate-200">
                      Derniers événements (agent_events)
                    </p>
                    {eventsErrorMessage && (
                      <p className="text-xs text-red-400">
                        Erreur: {eventsErrorMessage}
                      </p>
                    )}
                  </div>

                  {events.length === 0 && !eventsErrorMessage && (
                    <p className="text-xs text-slate-500">
                      Aucun événement trouvé pour cet agent dans{" "}
                      <code className="font-mono">agent_events</code>.
                    </p>
                  )}

                  {events.length > 0 && (
                    <ul className="divide-y divide-slate-800 text-sm">
                      {events.map((evt: any) => (
                        <li key={evt.id} className="py-2 flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono text-slate-400">
                              {formatDateTime(evt.created_at)}
                            </span>
                            <span className="text-[11px] px-2 py-[1px] rounded-full border border-slate-700 text-slate-300">
                              {evt.event_type ?? "event"}
                            </span>
                          </div>
                          {evt.payload && (
                            <p className="text-xs text-slate-400 line-clamp-2">
                              {typeof evt.payload === "string"
                                ? evt.payload
                                : JSON.stringify(evt.payload)}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}
          </>
        )}

        {/* Panneau création auto + console de tâches */}
        <section className="space-y-6">
          <CreateAutoAgentPanel />
          <AgentTaskConsole agentId={agents[0]?.id} />
        </section>
      </main>
    </div>
  );
}

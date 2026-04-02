"use client";

import { useEffect, useMemo, useState } from "react";

type AgentLite = {
  id: string;
  agent_name: string;
};

type Props = {
  agentId: string; // UUID source of truth
};

export function AgentTaskConsole({ agentId }: Props) {
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [agentName, setAgentName] = useState<string>(""); // legacy display / fallback
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Always safe
  const agentsSafe = useMemo(() => agents ?? [], [agents]);

  useEffect(() => {
    let cancelled = false;

    async function loadAgents() {
      setLoadingAgents(true);
      setError(null);

      try {
        // NOTE: si tu as déjà un endpoint pour lister les agents, remplace l’URL ici.
        // Pour l’instant on n’empêche pas l’app de fonctionner si ça fail.
        const res = await fetch("/api/agents", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { ok?: boolean; agents?: AgentLite[] };

        if (cancelled) return;

        const list = Array.isArray(json.agents) ? json.agents : [];
        setAgents(list);

        // Si l’agent courant est dans la liste, set le agentName (pour compat UI existante)
        const current = list.find((a) => a.id === agentId);
        if (current) setAgentName(current.agent_name);
      } catch (e) {
        if (cancelled) return;
        // On log l’erreur sans casser la page
        setError(e instanceof Error ? e.message : "Unknown error");
        setAgents([]); // safe default
      } finally {
        if (!cancelled) setLoadingAgents(false);
      }
    }

    loadAgents();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  return (
    <div className="space-y-3">
      <div className="text-xl font-semibold">Task Console</div>

      <div className="text-sm text-gray-500">
        Current Agent ID: {agentId}
      </div>

      {error && (
        <div className="text-sm text-red-600">
          Agent list error: {error}
        </div>
      )}

      <label className="block text-sm font-medium">Agent</label>
      <select
        className="border rounded px-3 py-2 w-full"
        value={agentName}
        onChange={(e) => setAgentName(e.target.value)}
        disabled={loadingAgents}
      >
        {agentsSafe.length === 0 && (
          <option value="">Aucun agent</option>
        )}

        {agentsSafe.map((a) => (
          <option key={a.id} value={a.agent_name}>
            {a.agent_name}
          </option>
        ))}
      </select>

      {/* Placeholder : garde ton UI tasks ici si tu en avais */}
      <div className="text-sm text-gray-600">
        (Tasks UI continues here…)
      </div>
    </div>
  );
}
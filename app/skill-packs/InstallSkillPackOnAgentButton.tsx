"use client";

import { useState } from "react";

interface InstallSkillPackOnAgentButtonProps {
  skillPackId: string;
}

export function InstallSkillPackOnAgentButton({
  skillPackId,
}: InstallSkillPackOnAgentButtonProps) {
  const [agentName, setAgentName] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleInstall() {
    setStatus(null);

    const trimmedName = agentName.trim();
    if (!trimmedName) {
      setStatus("Veuillez entrer un nom d'agent.");
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
          agentName: trimmedName,
          skillPackId,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        console.error("Erreur install-skill-pack (detail page):", data);
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
          `Skill Pack installé avec succès sur l'agent "${trimmedName}".`
      );
    } catch (error) {
      console.error("Erreur handleInstall (detail page):", error);
      setStatus("Erreur technique lors de l'installation.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <label className="text-[11px] text-slate-400 uppercase tracking-[0.16em]">
        Installer sur un agent
      </label>
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          placeholder='Nom exact de l’agent (ex: "Aurik-Marketing")'
          className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <button
          type="button"
          onClick={handleInstall}
          disabled={loading || !agentName.trim()}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-900 disabled:cursor-wait text-xs font-medium text-white transition"
        >
          {loading ? "Installation..." : "Installer"}
        </button>
      </div>

      {status && (
        <p className="text-[11px] text-slate-400">
          <span className="text-emerald-400">• </span>
          {status}
        </p>
      )}
    </div>
  );
}

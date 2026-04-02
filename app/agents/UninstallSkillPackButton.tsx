"use client";

import { useState } from "react";

interface UninstallSkillPackButtonProps {
  agentName: string;
  skillPackId: string;
}

export function UninstallSkillPackButton({
  agentName,
  skillPackId,
}: UninstallSkillPackButtonProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleUninstall() {
    setStatus(null);
    setLoading(true);

    try {
      const res = await fetch("/api/uninstall-skill-pack", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentName,
          skillPackId,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        console.error("Erreur uninstall-skill-pack:", data);
        setStatus(
          (data?.error ||
            "Erreur lors de la désinstallation du Skill Pack.") +
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
          `Skill Pack désinstallé de l'agent "${agentName}".`
      );
    } catch (error) {
      console.error("Erreur handleUninstall:", error);
      setStatus("Erreur technique lors de la désinstallation.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={handleUninstall}
        disabled={loading}
        className="px-3 py-1.5 rounded-lg bg-red-700/80 hover:bg-red-700 disabled:bg-red-900 disabled:cursor-wait text-[11px] font-medium text-white transition"
      >
        {loading ? "Suppression..." : "Désinstaller"}
      </button>

      {status && (
        <p className="mt-1 text-[11px] text-slate-400 max-w-xs text-right">
          <span className="text-red-400">• </span>
          {status}
        </p>
      )}
    </div>
  );
}

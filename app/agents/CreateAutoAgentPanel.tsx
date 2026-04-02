"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export function CreateAutoAgentPanel() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setResultMsg(null);

    try {
      const res = await fetch("/api/spawn-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erreur inconnue côté serveur");
      }

      setResultMsg(
        `✅ Nouvel agent créé: ${data.name}\nRôle: ${data.role}\nStyle: ${data.style}`
      );
      setPrompt("");
      // On rafraîchit la page pour recharger la liste des agents
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-slate-800 rounded-2xl p-4 bg-slate-900/80 mb-8">
      <h2 className="text-sm font-semibold text-slate-100 mb-2">
        Création automatique d&apos;un agent Aurik
      </h2>
      <p className="text-xs text-slate-400 mb-3">
        Décris le type d&apos;agent que tu veux (rôle, domaine, style), et
        Aurik-Builder proposera un nouvel agent qui sera enregistré
        automatiquement.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-500/70 min-h-[80px]"
          placeholder="Ex: Un agent expert en analyse de performance des campagnes TikTok pour DJs à Montréal, ton professionnel mais dynamique..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />

        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Création en cours..." : "Créer automatiquement l'agent"}
        </button>
      </form>

      {resultMsg && (
        <pre className="mt-3 text-xs text-emerald-300 whitespace-pre-wrap bg-slate-950/60 border border-emerald-800/40 rounded-xl p-3">
          {resultMsg}
        </pre>
      )}

      {errorMsg && (
        <p className="mt-3 text-xs text-red-400">
          ⚠️ Erreur: {errorMsg}
        </p>
      )}
    </div>
  );
}

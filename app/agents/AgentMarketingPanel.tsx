"use client";

import React, { useEffect, useMemo, useState } from "react";

type VisualMode = "none" | "library" | "ai";
type SubtitleMode = "off" | "discreet" | "normal" | "auto";

type GeneratedImageIdea = {
  prompt?: string;
  altText?: string;
  imageUrl?: string | null;
};

type GeneratedPost = {
  hook: string;
  caption: string;
  callToAction?: string;
  hashtags: string[];
  image?: GeneratedImageIdea;
};

type HistoryPost = {
  id: string;
  created_at: string;
  post_type: string;
  prompt_subject: string | null;
  content_hook: string | null;
  content_caption: string | null;
  content_cta: string | null;
  content_hashtags: string[] | null;
  visual_mode: string | null;
  visual_prompt: string | null;
  visual_alt: string | null;
};

type HistoryReel = {
  id: string;
  created_at: string;
  agent_id: string | null;
  agent_name: string | null;
  prompt_subject: string | null;
  platform: string | null;
  goal_type: string | null;
  goal_description: string | null;
  script_steps: unknown | null;
  caption: string | null;
  call_to_action: string | null;
  hashtags: string[] | null;
  cover_prompt: string | null;
  video_url: string | null;
  status: string | null;
  error_message: string | null;
};

type AgentMarketingPanelProps = {
  agentId: string;
  agentName: string;
};

const REEL_MIN_SCENES = 5;
const REEL_MAX_SCENES = 8;

function safeJsonArrayLength(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  return null;
}

function extractStepsArray(maybeReel: unknown): unknown[] | null {
  if (!maybeReel || typeof maybeReel !== "object") return null;

  const reelObj = maybeReel as Record<string, unknown>;

  const direct =
    reelObj.script_steps ??
    reelObj.scriptSteps ??
    reelObj.steps ??
    reelObj.script ??
    reelObj.storyboard ??
    null;

  if (Array.isArray(direct)) return direct;

  const nestedReel = reelObj.reel;
  if (nestedReel && typeof nestedReel === "object") {
    const nestedObj = nestedReel as Record<string, unknown>;
    const nested =
      nestedObj.script_steps ??
      nestedObj.scriptSteps ??
      nestedObj.steps ??
      null;

    if (Array.isArray(nested)) return nested;
  }

  if (direct && typeof direct === "object") {
    const directObj = direct as Record<string, unknown>;
    const inner = directObj.steps ?? directObj.scenes ?? null;
    if (Array.isArray(inner)) return inner;
  }

  return null;
}

async function safeReadJson(res: Response): Promise<unknown | null> {
  try {
    const txt = await res.text();
    if (!txt) return null;
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

export function AgentMarketingPanel({
  agentId,
  agentName,
}: AgentMarketingPanelProps) {
  const [subject, setSubject] = useState("");
  const [visualMode, setVisualMode] = useState<VisualMode>("none");

  const [result, setResult] = useState<GeneratedPost | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryPost[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [reelSubject, setReelSubject] = useState("");
  const [reelDraft, setReelDraft] = useState<unknown | null>(null);
  const [reelRowId, setReelRowId] = useState<string | null>(null);

  const [isGeneratingReelVideo, setIsGeneratingReelVideo] = useState(false);
  const [reelVideoError, setReelVideoError] = useState<string | null>(null);

  const [reelDraftError, setReelDraftError] = useState<string | null>(null);
  const [isGeneratingReelScript, setIsGeneratingReelScript] = useState(false);

  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>("auto");

  const [reelHistory, setReelHistory] = useState<HistoryReel[]>([]);
  const [reelHistoryLoading, setReelHistoryLoading] = useState(false);
  const [reelHistoryError, setReelHistoryError] = useState<string | null>(null);

  const [reelStepsCount, setReelStepsCount] = useState<number | null>(null);

  const reelIsValid = useMemo(() => {
    if (reelStepsCount == null) return null;
    return reelStepsCount >= REEL_MIN_SCENES && reelStepsCount <= REEL_MAX_SCENES;
  }, [reelStepsCount]);

  async function loadHistory() {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const res = await fetch(
        `/api/marketing/generated-posts?agentId=${encodeURIComponent(agentId)}`,
        { method: "GET" }
      );

      if (res.status === 404) {
        setHistory([]);
        return;
      }

      if (!res.ok) {
        const txt = await res.text();
        console.error("[Aurik] Erreur API /generated-posts:", res.status, txt);
        setHistoryError("Impossible de charger les posts générés.");
        return;
      }

      const data = await safeReadJson(res);
      const payload = (data ?? {}) as { posts?: HistoryPost[] };
      setHistory(Array.isArray(payload.posts) ? payload.posts : []);
    } catch (err) {
      console.error("[Aurik] Erreur inattendue /generated-posts:", err);
      setHistoryError("Erreur inattendue lors du chargement de l’historique.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadReelHistory(): Promise<HistoryReel[]> {
    setReelHistoryLoading(true);
    setReelHistoryError(null);

    try {
      const res = await fetch(
        `/api/marketing/generated-reels?agentId=${encodeURIComponent(agentId)}`,
        { method: "GET" }
      );

      if (res.status === 404) {
        setReelHistory([]);
        return [];
      }

      if (!res.ok) {
        const txt = await res.text();
        console.error("[Aurik] Erreur API /generated-reels:", res.status, txt);
        setReelHistoryError("Impossible de charger l’historique des reels.");
        return [];
      }

      const data = await safeReadJson(res);
      const payload = (data ?? {}) as { reels?: HistoryReel[] };
      const reels = Array.isArray(payload.reels) ? payload.reels : [];
      setReelHistory(reels);
      return reels;
    } catch (err) {
      console.error("[Aurik] Erreur inattendue /generated-reels:", err);
      setReelHistoryError("Erreur inattendue lors du chargement d’historique reels.");
      return [];
    } finally {
      setReelHistoryLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory();
    void loadReelHistory();
  }, [agentId]);

  useEffect(() => {
    if (!reelRowId) {
      setReelStepsCount(null);
      return;
    }

    const draftSteps = extractStepsArray(reelDraft);
    const fromDraft = safeJsonArrayLength(draftSteps);
    if (fromDraft != null) {
      setReelStepsCount(fromDraft);
      return;
    }

    const row = reelHistory.find((r) => r.id === reelRowId);
    if (row) {
      const len = safeJsonArrayLength(row.script_steps);
      if (len != null) {
        setReelStepsCount(len);
        return;
      }
    }

    setReelStepsCount(null);
  }, [reelRowId, reelDraft, reelHistory]);

  async function generateAiImageFromPrompt(
    ideaPrompt: string | undefined,
    currentPost: GeneratedPost
  ) {
    if (!ideaPrompt) {
      setImageError("Pas de prompt d’image à partir du post.");
      return;
    }

    try {
      const res = await fetch("/api/marketing/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          agentName,
          platform: "instagram",
          goalType: "event_promotion",
          goalDescription: subject || currentPost.caption,
          prompt: ideaPrompt,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error("[Aurik] Erreur API /marketing/generate-image:", res.status, txt);
        setImageError("Erreur lors de la génération de l'image IA.");
        return;
      }

      const json = (await safeReadJson(res)) as
        | {
            image?: {
              prompt?: string;
              altText?: string;
              imageUrl?: string | null;
            };
          }
        | null;

      if (!json?.image || !json.image.imageUrl) {
        console.warn("[Aurik] Réponse IA sans image exploitable:", json);
        setImageError("Réponse IA sans image exploitable.");
        return;
      }

      setResult({
        ...currentPost,
        image: {
          prompt: json.image.prompt ?? ideaPrompt,
          altText:
            json.image.altText ??
            currentPost.image?.altText ??
            "Visuel généré par IA",
          imageUrl: json.image.imageUrl,
        },
      });

      setImageError(null);
    } catch (err) {
      console.error("Erreur inattendue /marketing/generate-image:", err);
      setImageError("Erreur inattendue lors de la génération de l'image IA.");
    }
  }

  async function handleGeneratePost(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setError(null);
    setResult(null);
    setImageError(null);
    setImageLoading(false);

    try {
      const res = await fetch("/api/marketing/generate-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          agentName,
          platform: "instagram",
          goalType: "event_promotion",
          goalDescription: subject,
          visualMode,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[Aurik] Erreur API generate-post:", res.status, text);
        setError("Erreur lors de la génération du post.");
        return;
      }

      const data = (await safeReadJson(res)) as
        | {
            post?: unknown;
            result?: unknown;
          }
        | null;

      const post = data?.post ?? data?.result ?? data ?? {};
      const postObj = post as Record<string, unknown>;
      const copy = (postObj.copy as Record<string, unknown> | undefined) ?? postObj;
      const image = postObj.image as Record<string, unknown> | undefined;

      const nextResult: GeneratedPost = {
        hook: typeof copy.hook === "string" ? copy.hook : "",
        caption: typeof copy.caption === "string" ? copy.caption : "",
        callToAction:
          typeof copy.callToAction === "string"
            ? copy.callToAction
            : typeof copy.call_to_action === "string"
            ? copy.call_to_action
            : undefined,
        hashtags: Array.isArray(copy.hashtags)
          ? copy.hashtags.filter((x): x is string => typeof x === "string")
          : [],
        image: image
          ? {
              prompt: typeof image.prompt === "string" ? image.prompt : undefined,
              altText: typeof image.altText === "string" ? image.altText : undefined,
              imageUrl: typeof image.imageUrl === "string" ? image.imageUrl : undefined,
            }
          : undefined,
      };

      setResult(nextResult);

      if (visualMode === "ai" && nextResult.image?.prompt) {
        setImageLoading(true);
        await generateAiImageFromPrompt(nextResult.image.prompt, nextResult);
        setImageLoading(false);
      }

      await loadHistory();
    } catch (err) {
      console.error("[Aurik] Erreur inattendue generate-post:", err);
      setError("Erreur inattendue lors de la génération du post.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateReelScript() {
    const goalDescription = reelSubject.trim();
    if (!goalDescription) {
      setReelDraftError("Entre un sujet (goal) pour le Reel.");
      return;
    }

    setIsGeneratingReelScript(true);
    setReelDraftError(null);
    setReelDraft(null);
    setReelRowId(null);
    setReelVideoError(null);
    setReelStepsCount(null);

    try {
      const res = await fetch("/api/marketing/generate-reel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName,
          platform: "instagram",
          goalDescription,
          goalType: "engagement",
          formatDescription: `Reel ${REEL_MIN_SCENES}-${REEL_MAX_SCENES} scènes, hook fort, rythme rapide, CTA clair.`,
        }),
      });

      const data = (await safeReadJson(res)) as
        | {
            ok?: boolean;
            error?: string;
            reel?: unknown;
            reelRowId?: string | null;
          }
        | null;

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Erreur lors de la génération du script Reel");
      }

      setReelDraft(data.reel ?? null);
      setReelRowId(data.reelRowId ?? null);

      const steps = extractStepsArray(data.reel);
      const len = safeJsonArrayLength(steps);
      if (len != null) setReelStepsCount(len);

      await loadReelHistory();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur inconnue";
      setReelDraftError(message);
    } finally {
      setIsGeneratingReelScript(false);
    }
  }

  async function fetchLatestStepsCountForReelId(id: string): Promise<number | null> {
    try {
      const res = await fetch(
        `/api/marketing/generated-reels?agentId=${encodeURIComponent(agentId)}`,
        { method: "GET" }
      );

      if (!res.ok) return null;

      const data = (await safeReadJson(res)) as { reels?: HistoryReel[] } | null;
      const reels: HistoryReel[] = Array.isArray(data?.reels) ? data.reels : [];
      const row = reels.find((r) => r.id === id);
      if (!row) return null;

      const len = safeJsonArrayLength(row.script_steps);
      return len != null ? len : null;
    } catch {
      return null;
    }
  }

  async function handleGenerateReelVideo() {
    if (!reelRowId) {
      setReelVideoError("Aucun reelId. Génère le script d’abord.");
      return;
    }

    setIsGeneratingReelVideo(true);
    setReelVideoError(null);

    try {
      const latestCount = await fetchLatestStepsCountForReelId(reelRowId);

      const fallbackDraftCount = (() => {
        const steps = extractStepsArray(reelDraft);
        const len = safeJsonArrayLength(steps);
        return len != null ? len : null;
      })();

      const count = latestCount ?? fallbackDraftCount;

      if (count != null) setReelStepsCount(count);

      if (count == null) {
        throw new Error(
          "Impossible de vérifier le nombre de scènes. Réessaie après avoir rechargé l’historique."
        );
      }

      if (count < REEL_MIN_SCENES || count > REEL_MAX_SCENES) {
        throw new Error(
          `Script invalide (min ${REEL_MIN_SCENES} scènes, max ${REEL_MAX_SCENES}). Actuel: ${count}.`
        );
      }

      const finalSubtitleMode: SubtitleMode = subtitlesEnabled ? subtitleMode : "off";

      const res = await fetch("/api/marketing/generate-reel-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reelId: reelRowId,
          agentId,
          agentName,
          subtitleMode: finalSubtitleMode,
        }),
      });

      const data = (await safeReadJson(res)) as
        | {
            ok?: boolean;
            error?: string;
            videoUrl?: string | null;
          }
        | null;

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Erreur génération vidéo");
      }

      await loadReelHistory();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur inconnue";
      setReelVideoError(message);
    } finally {
      setIsGeneratingReelVideo(false);
    }
  }

  function formatDate(dateStr: string) {
    try {
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return dateStr;
      return d.toLocaleString();
    } catch {
      return dateStr;
    }
  }

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xs uppercase text-slate-400">
            SKILL PACK MARKETING – POST INSTAGRAM
          </h2>
          <p className="text-[11px] text-slate-500 mt-1">
            Génère un post Instagram basé sur un sujet (promo, événement, offre, etc.). Le texte est généré ici; le visuel peut être soit ignoré, soit choisi dans ta médiathèque, soit généré par IA.
          </p>
        </div>
      </div>

      <form onSubmit={handleGeneratePost} className="space-y-4">
        <div>
          <label className="block text-[11px] uppercase text-slate-400 mb-1">
            Sujet / promo
          </label>
          <input
            type="text"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="ex: promo 2 pour 1 sur les cocktails vendredi soir"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase text-slate-400 mb-1">
            Mode visuel pour ce post :
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setVisualMode("none")}
              className={`px-3 py-1 rounded-full text-xs border transition ${
                visualMode === "none"
                  ? "bg-emerald-500 text-black border-emerald-400"
                  : "bg-slate-950 text-slate-200 border-slate-700 hover:border-emerald-400"
              }`}
            >
              Aucun visuel spécifique
            </button>

            <button
              type="button"
              onClick={() => setVisualMode("library")}
              className={`px-3 py-1 rounded-full text-xs border transition ${
                visualMode === "library"
                  ? "bg-emerald-500 text-black border-emerald-400"
                  : "bg-slate-950 text-slate-200 border-slate-700 hover:border-emerald-400"
              }`}
            >
              Utiliser une image de la médiathèque
            </button>

            <button
              type="button"
              onClick={() => setVisualMode("ai")}
              className={`px-3 py-1 rounded-full text-xs border transition ${
                visualMode === "ai"
                  ? "bg-emerald-500 text-black border-emerald-400"
                  : "bg-emerald-600 text-black border-emerald-500 hover:bg-emerald-500"
              }`}
            >
              Laisser Aurik imaginer une image IA
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            En mode IA, Aurik propose un prompt de visuel et tente de générer une vraie image à partir de celui-ci.
          </p>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-black text-sm font-medium hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Génération en cours…" : "Générer un post Instagram"}
          </button>
        </div>
      </form>

      <div className="mt-4 border-t border-slate-800 pt-4 space-y-3">
        <h3 className="text-[11px] uppercase text-slate-400">
          PREVIEW DU POST GÉNÉRÉ
        </h3>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {imageError && <p className="text-xs text-red-400">{imageError}</p>}

        {!error && !result && !loading && (
          <p className="text-[11px] text-slate-500">
            Aucun post généré pour l&apos;instant. Entre un sujet ci-dessus puis clique sur « Générer un post Instagram ».
          </p>
        )}

        {loading && (
          <p className="text-[11px] text-slate-400">
            L&apos;agent réfléchit et prépare ton post…
          </p>
        )}
        {imageLoading && (
          <p className="text-[11px] text-slate-400">
            Génération de l&apos;image IA en cours…
          </p>
        )}

        {result && !loading && (
          <>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 text-sm">
              {result.hook && (
                <p className="font-semibold text-slate-50">{result.hook}</p>
              )}
              <p className="text-slate-200 whitespace-pre-line">{result.caption}</p>
              {result.callToAction && (
                <p className="text-emerald-400 font-medium">
                  {result.callToAction}
                </p>
              )}
              {result.hashtags.length > 0 && (
                <p className="text-xs text-slate-400">
                  {result.hashtags.join(" ")}
                </p>
              )}
            </div>

            {result.image &&
              (result.image.prompt ||
                result.image.altText ||
                result.image.imageUrl) && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs space-y-2">
                  <p className="text-[11px] uppercase text-slate-400">
                    Idée de visuel IA imaginée par Aurik
                  </p>

                  {result.image.imageUrl && (
                    <div className="w-full flex justify-center">
                      <img
                        src={result.image.imageUrl}
                        alt={result.image.altText || "Visuel généré par IA"}
                        className="max-w-full max-h-64 rounded-lg border border-slate-700"
                      />
                    </div>
                  )}

                  {result.image.prompt && (
                    <p className="text-slate-200">
                      <span className="font-semibold text-slate-300">
                        Prompt :
                      </span>{" "}
                      {result.image.prompt}
                    </p>
                  )}
                  {result.image.altText && (
                    <p className="text-slate-400">
                      <span className="font-semibold text-slate-300">
                        Alt&nbsp;text :
                      </span>{" "}
                      {result.image.altText}
                    </p>
                  )}
                </div>
              )}
          </>
        )}
      </div>

      <div className="mt-6 border-t border-slate-800 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] uppercase text-slate-400">REELS</h3>
          {isGeneratingReelScript && (
            <span className="text-[10px] text-slate-500">Génération…</span>
          )}
        </div>

        <div>
          <label className="block text-[11px] uppercase text-slate-400 mb-1">
            Sujet Reel
          </label>
          <input
            type="text"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="ex: Espresso Electro samedi 11h – brunch + deep house + vibe soleil"
            value={reelSubject}
            onChange={(e) => setReelSubject(e.target.value)}
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Génère le script ({REEL_MIN_SCENES}–{REEL_MAX_SCENES} scènes) puis la vidéo MP4 (images + voix off + montage).
          </p>
        </div>

        <div className="pt-1 flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleGenerateReelScript}
            disabled={isGeneratingReelScript}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-black text-sm font-medium hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isGeneratingReelScript ? "Génération en cours…" : "Générer script Reel"}
          </button>

          <button
            type="button"
            onClick={handleGenerateReelVideo}
            disabled={isGeneratingReelVideo || !reelRowId || reelIsValid === false}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 text-black text-sm font-medium hover:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
            title={
              reelIsValid === false && reelStepsCount != null
                ? `Script invalide: ${reelStepsCount} scènes (min ${REEL_MIN_SCENES}, max ${REEL_MAX_SCENES}).`
                : undefined
            }
          >
            {isGeneratingReelVideo ? "Montage vidéo en cours…" : "Générer Reel vidéo"}
          </button>
        </div>

        {reelRowId && (
          <div className="text-[11px] text-slate-500">
            <span className="text-slate-400">Script scenes:</span>{" "}
            {reelStepsCount == null ? (
              <span>—</span>
            ) : reelIsValid ? (
              <span className="text-emerald-400 font-medium">
                {reelStepsCount} ✅
              </span>
            ) : (
              <span className="text-red-400 font-medium">
                {reelStepsCount} (min {REEL_MIN_SCENES}, max {REEL_MAX_SCENES})
              </span>
            )}
          </div>
        )}

        <div className="mt-3 bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase text-slate-400">Sous-titres</p>
              <p className="text-[10px] text-slate-500">
                ON/OFF + mode. <span className="text-slate-400">Auto</span> = Aurik décide quand afficher du texte
                (recommandé).
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSubtitlesEnabled((v) => !v)}
              className={`px-3 py-1 rounded-full text-xs border transition ${
                subtitlesEnabled
                  ? "bg-emerald-500 text-black border-emerald-400"
                  : "bg-slate-900 text-slate-200 border-slate-700 hover:border-emerald-400"
              }`}
              aria-pressed={subtitlesEnabled}
            >
              {subtitlesEnabled ? "ON" : "OFF"}
            </button>
          </div>

          <div>
            <label className="block text-[11px] uppercase text-slate-400 mb-1">
              Mode d’affichage
            </label>

            <select
              value={subtitleMode}
              onChange={(e) => setSubtitleMode(e.target.value as SubtitleMode)}
              disabled={!subtitlesEnabled}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="auto">Auto (Aurik décide) ✅</option>
              <option value="discreet">Discret</option>
              <option value="normal">Normal</option>
            </select>

            {!subtitlesEnabled ? (
              <p className="text-[10px] text-slate-500 mt-1">
                Sous-titres <span className="text-slate-300 font-medium">désactivés</span> (la vidéo sera rendue sans
                texte).
              </p>
            ) : subtitleMode === "auto" ? (
              <p className="text-[10px] text-slate-500 mt-1">
                Auto = sous-titres plus rares et texte plus court.
              </p>
            ) : subtitleMode === "discreet" ? (
              <p className="text-[10px] text-slate-500 mt-1">
                Discret = texte petit, bas-centre, lisible sans envahir.
              </p>
            ) : (
              <p className="text-[10px] text-slate-500 mt-1">
                Normal = texte plus présent (plus gros et plus fréquent).
              </p>
            )}
          </div>
        </div>

        {reelDraftError && <p className="text-xs text-red-400">{reelDraftError}</p>}
        {reelVideoError && <p className="text-xs text-red-400">{reelVideoError}</p>}

        {Boolean(reelDraft) && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs space-y-2">
            <p className="text-[11px] uppercase text-slate-400">
              Script Reel (debug JSON)
            </p>
            <pre className="whitespace-pre-wrap break-words max-h-[360px] overflow-auto text-slate-200">
              {JSON.stringify(reelDraft, null, 2)}
            </pre>
          </div>
        )}

        <div className="mt-4 border-t border-slate-800 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase text-slate-400">
              Historique des reels
            </p>
            {reelHistoryLoading && (
              <span className="text-[10px] text-slate-500">Chargement…</span>
            )}
          </div>

          {reelHistoryError && (
            <p className="text-[11px] text-red-400">{reelHistoryError}</p>
          )}

          {!reelHistoryError && !reelHistoryLoading && reelHistory.length === 0 && (
            <p className="text-[11px] text-slate-500">
              Aucun reel enregistré pour le moment.
            </p>
          )}

          {!reelHistoryError && reelHistory.length > 0 && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {reelHistory.map((r) => (
                <div
                  key={r.id}
                  className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      {formatDate(r.created_at)}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {r.platform ?? "?"} • {r.status ?? "?"}
                    </span>
                  </div>

                  {r.prompt_subject && (
                    <p className="text-[11px] text-slate-200">
                      <span className="font-semibold text-slate-300">Sujet:</span>{" "}
                      {r.prompt_subject}
                    </p>
                  )}

                  {r.caption && (
                    <p className="text-[11px] text-slate-300 line-clamp-2">
                      {r.caption}
                    </p>
                  )}

{r.video_url && (
  <div className="pt-2">
    <div className="w-full rounded-xl border border-slate-800 bg-black overflow-hidden flex items-center justify-center">
      <video
        src={r.video_url}
        controls
        className="w-full max-h-64 object-contain rounded-xl"
      />
    </div>
  </div>
)}

                  {r.error_message && (
                    <p className="text-[11px] text-red-400">{r.error_message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 border-t border-slate-800 pt-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] uppercase text-slate-400">
            Historique des posts générés
          </h3>
          {historyLoading && (
            <span className="text-[10px] text-slate-500">Chargement…</span>
          )}
        </div>

        {historyError && <p className="text-[11px] text-red-400">{historyError}</p>}

        {!historyError && history.length === 0 && !historyLoading && (
          <p className="text-[11px] text-slate-500">
            Aucun post généré enregistré pour le moment.
          </p>
        )}

        {!historyError && history.length > 0 && (
          <div className="space-y-2">
            {history.map((post) => (
              <div
                key={post.id}
                className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">
                    {formatDate(post.created_at)}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {post.post_type}
                    {post.visual_mode ? ` • visuel: ${post.visual_mode}` : ""}
                  </span>
                </div>

                {post.prompt_subject && (
                  <p className="text-[11px] text-slate-200">
                    <span className="font-semibold text-slate-300">Sujet:</span>{" "}
                    {post.prompt_subject}
                  </p>
                )}

                {post.content_caption && (
                  <p className="text-[11px] text-slate-300 line-clamp-2">
                    {post.content_caption}
                  </p>
                )}

                {post.visual_prompt && (
                  <p className="text-[10px] text-slate-500 line-clamp-1">
                    <span className="font-semibold">Visuel IA:</span>{" "}
                    {post.visual_prompt}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
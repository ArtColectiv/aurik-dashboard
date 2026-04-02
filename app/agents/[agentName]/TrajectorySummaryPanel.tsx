"use client";

import { useEffect, useMemo, useState } from "react";

type TrajectorySummary = {
  ok: boolean;
  impactId: string;
  window: { n: number; minValue: number | null; maxValue: number | null };
  score: {
    baseline: number;
    current: number;
    growth: number;
    momentum: number;
    stability: number;
    compositeScore: number;
  };
  points: Array<{
    measured_at: string;
    measured_value: number;
    source: string;
    meta: Record<string, unknown>;
  }>;
  error?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function fmtPct(x: number) {
  const pct = x * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

function stabilityLabel(stability: number) {
  if (stability < 0.25) return "faible";
  if (stability < 0.75) return "moyenne";
  return "élevée";
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

function fallbackErrorData(impactId: string, n: number, error: string): TrajectorySummary {
  return {
    ok: false,
    impactId,
    window: { n, minValue: null, maxValue: null },
    score: {
      baseline: 0,
      current: 0,
      growth: 0,
      momentum: 0,
      stability: 0,
      compositeScore: 0,
    },
    points: [],
    error,
  };
}

export default function TrajectorySummaryPanel(props: {
  impactId: string;
  n?: number;
}) {
  const { impactId, n = 10 } = props;

  const [data, setData] = useState<TrajectorySummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);

      try {
        const res = await fetch(
          `/api/internal/trajectory-summary?impactId=${encodeURIComponent(
            impactId
          )}&n=${encodeURIComponent(String(n))}`,
          { cache: "no-store" }
        );

        const json = (await safeReadJson(res)) as TrajectorySummary | null;

        if (!res.ok) {
          const message =
            json?.error ||
            `HTTP ${res.status} ${res.statusText || "fetch failed"}`;

          if (!cancelled) {
            setData(fallbackErrorData(impactId, n, message));
          }
          return;
        }

        if (!json || typeof json !== "object") {
          if (!cancelled) {
            setData(
              fallbackErrorData(
                impactId,
                n,
                "Réponse invalide de /api/internal/trajectory-summary"
              )
            );
          }
          return;
        }

        if (!cancelled) {
          setData(json);
        }
      } catch (e) {
        if (!cancelled) {
          setData(
            fallbackErrorData(
              impactId,
              n,
              e instanceof Error ? e.message : "Unknown error"
            )
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [impactId, n]);

  const pointsAsc = useMemo(() => {
    const pts = data?.points ?? [];
    return [...pts].sort(
      (a, b) =>
        new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime()
    );
  }, [data]);

  const spark = useMemo(() => {
    const vals = pointsAsc.map((p) => p.measured_value);
    if (vals.length < 2) return "—";

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = Math.max(1e-9, max - min);

    const blocks = "▁▂▃▄▅▆▇█";

    return vals
      .map((v) => {
        const t = (v - min) / range;
        const idx = clamp(
          Math.round(t * (blocks.length - 1)),
          0,
          blocks.length - 1
        );
        return blocks[idx];
      })
      .join("");
  }, [pointsAsc]);

  if (loading && !data) {
    return (
      <div className="rounded-xl border p-4">
        <div className="text-sm opacity-70">Trajectory</div>
        <div className="mt-2 text-sm">Chargement…</div>
      </div>
    );
  }

  if (!data || !data.ok) {
    return (
      <div className="rounded-xl border p-4">
        <div className="text-sm opacity-70">Trajectory</div>
        <div className="mt-2 text-sm text-red-600">
          {data?.error ?? "Aucune donnée"}
        </div>
      </div>
    );
  }

  const { score, window } = data;
  const momentumDir = score.momentum > 0 ? "↑" : score.momentum < 0 ? "↓" : "→";

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm opacity-70">Trajectory</div>
        <div className="text-xs opacity-70">
          n={window.n} • min={window.minValue ?? "—"} • max={window.maxValue ?? "—"}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-black/5 p-3">
          <div className="text-xs opacity-70">Score</div>
          <div className="mt-1 text-2xl font-semibold">
            {score.compositeScore.toFixed(1)} / 5
          </div>
        </div>

        <div className="rounded-lg bg-black/5 p-3">
          <div className="text-xs opacity-70">Sparkline</div>
          <div className="mt-2 font-mono text-xl leading-none">{spark}</div>
        </div>

        <div className="rounded-lg bg-black/5 p-3">
          <div className="text-xs opacity-70">Growth (vs baseline)</div>
          <div className="mt-1 text-lg font-semibold">{fmtPct(score.growth)}</div>
          <div className="text-xs opacity-70">
            baseline={score.baseline} → current={score.current}
          </div>
        </div>

        <div className="rounded-lg bg-black/5 p-3">
          <div className="text-xs opacity-70">Momentum / Stabilité</div>
          <div className="mt-1 text-lg font-semibold">
            {momentumDir} {score.momentum.toFixed(2)}
          </div>
          <div className="text-xs opacity-70">
            stabilité: {stabilityLabel(score.stability)} ({score.stability.toFixed(2)})
          </div>
        </div>
      </div>
    </div>
  );
}
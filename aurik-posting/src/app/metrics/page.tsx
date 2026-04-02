"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";
import AppNav from "@/app/components/AppNav";

type MetricRow = {
  id: string;
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
  fetched_at: string;
};

export default function MetricsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [runningWorker, setRunningWorker] = useState(false);
  const [email, setEmail] = useState<string>("loading...");
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPage() {
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setEmail(user.email ?? "no-email");
      await loadMetrics(user.id);
      setLoading(false);
    }

    void loadPage();
  }, [router]);

  async function loadMetrics(userId: string) {
    const { data: publishedData, error: publishedError } = await supabaseClient
      .from("posting_published_posts")
      .select("id")
      .eq("user_id", userId);

    if (publishedError) {
      setError(publishedError.message);
      return;
    }

    const publishedIds = (publishedData ?? []).map((post) => post.id);

    if (publishedIds.length === 0) {
      setMetrics([]);
      return;
    }

    const { data, error } = await supabaseClient
      .from("posting_post_metrics")
      .select(
        "id, impressions, reach, likes, comments, shares, saves, clicks, fetched_at"
      )
      .in("published_post_id", publishedIds)
      .order("fetched_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    setMetrics((data ?? []) as MetricRow[]);
  }

  async function handleRunMetricsWorker() {
    setRunningWorker(true);
    setError(null);

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const response = await fetch("/api/worker/metrics", {
      method: "POST",
    });

    const json = (await response.json()) as {
      ok?: boolean;
      error?: string;
    };

    if (!response.ok || json.ok === false) {
      setError(json.error ?? "Metrics worker failed.");
      setRunningWorker(false);
      return;
    }

    await loadMetrics(user.id);
    setRunningWorker(false);
  }

  if (loading) {
    return (
      <main className="p-10">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <AppNav />

        <div className="rounded-2xl border border-black/10 p-8 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-black/50">
                Aurik Push
              </p>

              <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                Metrics
              </h1>

              <p className="mt-2 text-sm text-black/60">{email}</p>
            </div>

            <button
              onClick={handleRunMetricsWorker}
              disabled={runningWorker}
              className="rounded-lg border border-black/10 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {runningWorker ? "Running..." : "Run metrics worker"}
            </button>
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          ) : metrics.length === 0 ? (
            <div className="mt-6 rounded-xl border border-black/10 p-5">
              <p className="text-sm text-black/60">
                Aucune metric pour le moment.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {metrics.map((metric) => (
                <div
                  key={metric.id}
                  className="rounded-xl border border-black/10 p-4"
                >
                  <p className="text-sm font-medium">
                    Impressions: {metric.impressions ?? 0} · Reach: {metric.reach ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-black/60">
                    Likes: {metric.likes ?? 0} · Comments: {metric.comments ?? 0} ·
                    Shares: {metric.shares ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-black/50">
                    Saves: {metric.saves ?? 0} · Clicks: {metric.clicks ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-black/50">
                    Fetched at: {metric.fetched_at}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
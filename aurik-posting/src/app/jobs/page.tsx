"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";
import AppNav from "@/app/components/AppNav";

type JobRow = {
  id: string;
  publish_mode: string;
  status: string;
  scheduled_for: string | null;
  created_at: string;
  draft_id: string;
  channel_connection_id: string;
};

export default function JobsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [runningWorker, setRunningWorker] = useState(false);
  const [publishingJobId, setPublishingJobId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("loading...");
  const [jobs, setJobs] = useState<JobRow[]>([]);
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
      await loadJobs(user.id);
      setLoading(false);
    }

    void loadPage();
  }, [router]);

  async function loadJobs(userId: string) {
    const { data, error } = await supabaseClient
      .from("posting_post_jobs")
      .select(
        "id, publish_mode, status, scheduled_for, created_at, draft_id, channel_connection_id"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    setJobs((data ?? []) as JobRow[]);
  }

  async function handleSimulatePublish(job: JobRow) {
    setPublishingJobId(job.id);
    setError(null);

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const fakePostId = `ig-sim-${Date.now()}`;

    const { error: insertError } = await supabaseClient
      .from("posting_published_posts")
      .insert({
        user_id: user.id,
        job_id: job.id,
        draft_id: job.draft_id,
        channel_connection_id: job.channel_connection_id,
        platform: "instagram",
        platform_post_id: fakePostId,
        platform_permalink: `https://instagram.com/p/${fakePostId}`,
        published_at: new Date().toISOString(),
        status: "published",
        raw_response: {},
      });

    if (insertError) {
      setError(insertError.message);
      setPublishingJobId(null);
      return;
    }

    const { error: updateError } = await supabaseClient
      .from("posting_post_jobs")
      .update({ status: "published" })
      .eq("id", job.id);

    if (updateError) {
      setError(updateError.message);
      setPublishingJobId(null);
      return;
    }

    await loadJobs(user.id);
    setPublishingJobId(null);
  }

  async function handleRunWorker() {
    setRunningWorker(true);
    setError(null);

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const response = await fetch("/api/worker/publish", {
      method: "POST",
    });

    const json = (await response.json()) as {
      ok?: boolean;
      error?: string;
    };

    if (!response.ok || json.ok === false) {
      setError(json.error ?? "Worker failed.");
      setRunningWorker(false);
      return;
    }

    await loadJobs(user.id);
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
                Jobs
              </h1>

              <p className="mt-2 text-sm text-black/60">{email}</p>
            </div>

            <button
              onClick={handleRunWorker}
              disabled={runningWorker}
              className="rounded-lg border border-black/10 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {runningWorker ? "Running..." : "Run worker"}
            </button>
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          ) : jobs.length === 0 ? (
            <div className="mt-6 rounded-xl border border-black/10 p-5">
              <p className="text-sm text-black/60">
                Aucun job pour le moment.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-xl border border-black/10 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">
                        Job {job.id.slice(0, 8)}
                      </p>
                      <p className="mt-1 text-xs text-black/60">
                        Mode: {job.publish_mode}
                      </p>
                      <p className="mt-1 text-xs text-black/50">
                        Status: {job.status}
                      </p>
                    </div>

                    <button
                      onClick={() => handleSimulatePublish(job)}
                      disabled={
                        publishingJobId === job.id || job.status === "published"
                      }
                      className="rounded-lg border border-black/10 px-3 py-2 text-xs font-medium disabled:opacity-50"
                    >
                      {job.status === "published"
                        ? "Already published"
                        : publishingJobId === job.id
                        ? "Publishing..."
                        : "Simulate publish"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
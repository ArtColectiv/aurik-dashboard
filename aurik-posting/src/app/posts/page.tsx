"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";
import AppNav from "@/app/components/AppNav";

type DraftRow = {
  id: string;
  title: string | null;
  caption: string;
  media_type: string;
  platform: string;
  status: string;
  channel_connection_id: string;
};

export default function PostsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [creatingJobForId, setCreatingJobForId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("loading...");
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
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
      await loadDrafts(user.id);
      setLoading(false);
    }

    void loadPage();
  }, [router]);

  async function loadDrafts(userId: string) {
    const { data, error } = await supabaseClient
      .from("posting_post_drafts")
      .select("id, title, caption, media_type, platform, status, channel_connection_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    setDrafts((data ?? []) as DraftRow[]);
  }

  async function handleCreateJob(draft: DraftRow) {
    setCreatingJobForId(draft.id);
    setError(null);

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { error } = await supabaseClient
      .from("posting_post_jobs")
      .insert({
        user_id: user.id,
        draft_id: draft.id,
        channel_connection_id: draft.channel_connection_id,
        publish_mode: "now",
        status: "queued",
      });

    if (error) {
      setError(error.message);
      setCreatingJobForId(null);
      return;
    }

    setCreatingJobForId(null);
    router.push("/jobs");
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
                Posts
              </h1>

              <p className="mt-2 text-sm text-black/60">{email}</p>
            </div>

            <button
              onClick={() => router.push("/posts/new")}
              className="rounded-lg border border-black/10 px-4 py-2 text-sm font-medium"
            >
              New Post
            </button>
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          ) : drafts.length === 0 ? (
            <div className="mt-6 rounded-xl border border-black/10 p-5">
              <p className="text-sm text-black/60">
                Aucun draft pour le moment.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="rounded-xl border border-black/10 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">
                        {draft.title ?? "Untitled draft"}
                      </p>
                      <p className="mt-1 text-xs text-black/60">
                        {draft.platform} · {draft.media_type}
                      </p>
                      <p className="mt-2 text-xs text-black/50">
                        Status: {draft.status}
                      </p>
                    </div>

                    <button
                      onClick={() => handleCreateJob(draft)}
                      disabled={creatingJobForId === draft.id}
                      className="rounded-lg border border-black/10 px-3 py-2 text-xs font-medium disabled:opacity-50"
                    >
                      {creatingJobForId === draft.id ? "Creating..." : "Create job"}
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
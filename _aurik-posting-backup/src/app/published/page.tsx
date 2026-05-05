"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";
import AppNav from "@/app/components/AppNav";

type PublishedRow = {
  id: string;
  platform: string;
  platform_post_id: string | null;
  platform_permalink: string | null;
  status: string;
  published_at: string | null;
};

export default function PublishedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("loading...");
  const [posts, setPosts] = useState<PublishedRow[]>([]);
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
      await loadPublished(user.id);
      setLoading(false);
    }

    void loadPage();
  }, [router]);

  async function loadPublished(userId: string) {
    const { data, error } = await supabaseClient
      .from("posting_published_posts")
      .select(
        "id, platform, platform_post_id, platform_permalink, status, published_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    setPosts((data ?? []) as PublishedRow[]);
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
                Published
              </h1>

              <p className="mt-2 text-sm text-black/60">{email}</p>
            </div>
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          ) : posts.length === 0 ? (
            <div className="mt-6 rounded-xl border border-black/10 p-5">
              <p className="text-sm text-black/60">
                Aucun post publié pour le moment.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="rounded-xl border border-black/10 p-4"
                >
                  <p className="text-sm font-medium">
                    {post.platform} · {post.platform_post_id ?? "pending"}
                  </p>
                  <p className="mt-1 text-xs text-black/60 break-all">
                    {post.platform_permalink ?? "No permalink"}
                  </p>
                  <p className="mt-2 text-xs text-black/50">
                    Status: {post.status}
                  </p>
                  <p className="mt-1 text-xs text-black/50">
                    Published at: {post.published_at ?? "N/A"}
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
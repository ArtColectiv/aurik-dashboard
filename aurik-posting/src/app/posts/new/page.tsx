"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";
import AppNav from "@/app/components/AppNav";

type ConnectionRow = {
  id: string;
  platform: string;
  platform_account_name: string | null;
};

export default function NewPostPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [mediaUrl, setMediaUrl] = useState("https://example.com/test.jpg");
  const [mediaType, setMediaType] = useState("image");
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

      const { data, error } = await supabaseClient
        .from("posting_channel_connections")
        .select("id, platform, platform_account_name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as ConnectionRow[];
      setConnections(rows);

      if (rows.length > 0) {
        setConnectionId(rows[0].id);
      }

      setLoading(false);
    }

    void loadPage();
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const selectedConnection = connections.find((c) => c.id === connectionId);

    if (!selectedConnection) {
      setError("Choisis une connexion.");
      setSaving(false);
      return;
    }

    const { error } = await supabaseClient.from("posting_post_drafts").insert({
      user_id: user.id,
      channel_connection_id: selectedConnection.id,
      title: title || null,
      caption,
      media_url: mediaUrl,
      media_type: mediaType,
      platform: selectedConnection.platform,
      status: "draft",
      metadata: {},
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    router.push("/posts");
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
      <div className="mx-auto max-w-4xl px-6 py-16">
        <AppNav />

        <div className="rounded-2xl border border-black/10 p-8 shadow-sm">
          <p className="text-sm uppercase tracking-[0.2em] text-black/50">
            Aurik Push
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            New Draft
          </h1>

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">Connection</label>
              <select
                value={connectionId}
                onChange={(e) => setConnectionId(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm"
              >
                {connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.platform} ·{" "}
                    {connection.platform_account_name ?? "Unnamed account"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm"
                placeholder="Mon post"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Caption</label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="min-h-32 w-full rounded-lg border border-black/10 px-4 py-3 text-sm"
                placeholder="Écris ton caption ici..."
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Media URL</label>
              <input
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Media type</label>
              <select
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm"
              >
                <option value="image">image</option>
                <option value="video">video</option>
                <option value="reel">reel</option>
                <option value="carousel">carousel</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Création..." : "Create draft"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
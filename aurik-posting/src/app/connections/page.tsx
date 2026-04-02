"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";
import AppNav from "@/app/components/AppNav";

type ConnectionRow = {
  id: string;
  platform: string;
  platform_account_name: string | null;
  status: string;
};

export default function ConnectionsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("loading...");
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
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
      await loadConnections(user.id);
      setLoading(false);
    }

    void loadPage();
  }, [router]);

  async function loadConnections(userId: string) {
    const { data, error } = await supabaseClient
      .from("posting_channel_connections")
      .select("id, platform, platform_account_name, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    setConnections((data ?? []) as ConnectionRow[]);
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
                Connections
              </h1>

              <p className="mt-2 text-sm text-black/60">{email}</p>
            </div>
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          ) : connections.length === 0 ? (
            <div className="mt-6 rounded-xl border border-black/10 p-5">
              <p className="text-sm text-black/60">
                Aucune connexion sociale pour le moment.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {connections.map((connection) => (
                <div
                  key={connection.id}
                  className="rounded-xl border border-black/10 p-4"
                >
                  <p className="text-sm font-medium">{connection.platform}</p>
                  <p className="mt-1 text-xs text-black/60">
                    {connection.platform_account_name ?? "Unnamed account"}
                  </p>
                  <p className="mt-2 text-xs text-black/50">
                    Status: {connection.status}
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
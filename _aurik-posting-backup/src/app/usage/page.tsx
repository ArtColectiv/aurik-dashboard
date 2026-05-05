"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";
import AppNav from "@/app/components/AppNav";

type UsageRow = {
  id: string;
  event_type: string;
  event_count: number;
  created_at: string;
};

export default function UsagePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("loading...");
  const [events, setEvents] = useState<UsageRow[]>([]);
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

      const { data, error } = await supabaseClient
        .from("posting_usage_events")
        .select("id, event_type, event_count, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setEvents((data ?? []) as UsageRow[]);
      setLoading(false);
    }

    void loadPage();
  }, [router]);

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
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-black/50">
              Aurik Push
            </p>

            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Usage
            </h1>

            <p className="mt-2 text-sm text-black/60">{email}</p>
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          ) : events.length === 0 ? (
            <div className="mt-6 rounded-xl border border-black/10 p-5">
              <p className="text-sm text-black/60">
                Aucun événement d’usage pour le moment.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border border-black/10 p-4"
                >
                  <p className="text-sm font-medium">{event.event_type}</p>
                  <p className="mt-1 text-xs text-black/60">
                    Count: {event.event_count}
                  </p>
                  <p className="mt-1 text-xs text-black/50">
                    Created at: {event.created_at}
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
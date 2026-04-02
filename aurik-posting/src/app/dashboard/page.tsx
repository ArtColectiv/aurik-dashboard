"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";
import AppNav from "@/app/components/AppNav";

type UsageSummaryRow = {
  event_type: string;
  event_count: number;
  created_at?: string;
};

type PostingUserRow = {
  plan_code: string;
};

type PlanRow = {
  monthly_limit: number;
};

function getMonthStartIso() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)
  ).toISOString();
}

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("loading...");
  const [planCode, setPlanCode] = useState<string>("loading...");
  const [monthlyLimit, setMonthlyLimit] = useState<number>(0);
  const [monthlyUsage, setMonthlyUsage] = useState<number>(0);
  const [status, setStatus] = useState<"loading" | "ok" | "redirecting">(
    "loading"
  );
  const [loggingOut, setLoggingOut] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const [lastEventType, setLastEventType] = useState<string>("none");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSession() {
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();

      if (!user) {
        setStatus("redirecting");
        router.push("/login");
        return;
      }

      setEmail(user.email ?? "no-email");

      const { data: postingUser, error: postingUserError } = await supabaseClient
        .from("posting_users")
        .select("plan_code")
        .eq("id", user.id)
        .single();

      if (postingUserError || !postingUser) {
        setError(postingUserError?.message ?? "Posting user not found");
        setStatus("ok");
        return;
      }

      const postingUserRow = postingUser as PostingUserRow;
      setPlanCode(postingUserRow.plan_code);

      const { data: plan, error: planError } = await supabaseClient
        .from("posting_plans")
        .select("monthly_limit")
        .eq("code", postingUserRow.plan_code)
        .single();

      if (planError || !plan) {
        setError(planError?.message ?? "Plan not found");
        setStatus("ok");
        return;
      }

      const planRow = plan as PlanRow;
      setMonthlyLimit(planRow.monthly_limit);

      const { data: usageRows, error: usageError } = await supabaseClient
        .from("posting_usage_events")
        .select("event_type, event_count, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (usageError) {
        setError(usageError.message);
        setStatus("ok");
        return;
      }

      const rows = (usageRows ?? []) as UsageSummaryRow[];

      const total = rows.reduce((sum, row) => sum + (row.event_count ?? 0), 0);
      setUsageCount(total);
      setLastEventType(rows[0]?.event_type ?? "none");

      const monthStartIso = getMonthStartIso();
      const monthRows = rows.filter(
        (row) => (row.created_at ?? "") >= monthStartIso
      );
      const monthTotal = monthRows.reduce(
        (sum, row) => sum + (row.event_count ?? 0),
        0
      );
      setMonthlyUsage(monthTotal);

      setStatus("ok");
    }

    void loadSession();
  }, [router]);

  async function handleLogout() {
    setLoggingOut(true);
    await supabaseClient.auth.signOut();
    router.push("/login");
  }

  if (status === "loading") {
    return (
      <main className="p-10">
        <p>Loading session...</p>
      </main>
    );
  }

  if (status === "redirecting") {
    return (
      <main className="p-10">
        <p>Redirecting...</p>
      </main>
    );
  }

  const usagePercent =
    monthlyLimit > 0 ? Math.min(100, (monthlyUsage / monthlyLimit) * 100) : 0;

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <AppNav />

        <div className="rounded-2xl border border-black/10 p-8 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-black/50">
                Aurik Push
              </p>

              <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                Dashboard
              </h1>
            </div>

            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-lg border border-black/10 px-4 py-2 text-sm"
            >
              Logout
            </button>
          </div>

          <div className="mt-6">
            <p className="text-sm text-black/60">{email}</p>
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          ) : (
            <>
              <div className="mt-8 grid gap-4 md:grid-cols-4">
                <div className="rounded-xl border border-black/10 p-5">
                  <p className="text-sm text-black/50">Current plan</p>
                  <p className="mt-2 text-2xl font-semibold">{planCode}</p>
                </div>

                <div className="rounded-xl border border-black/10 p-5">
                  <p className="text-sm text-black/50">Monthly limit</p>
                  <p className="mt-2 text-2xl font-semibold">{monthlyLimit}</p>
                </div>

                <div className="rounded-xl border border-black/10 p-5">
                  <p className="text-sm text-black/50">Monthly usage</p>
                  <p className="mt-2 text-2xl font-semibold">{monthlyUsage}</p>
                </div>

                <div className="rounded-xl border border-black/10 p-5">
                  <p className="text-sm text-black/50">Latest event</p>
                  <p className="mt-2 text-2xl font-semibold">{lastEventType}</p>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-black/10 p-5">
                <div className="flex items-center justify-between text-sm">
                  <p className="text-black/50">Monthly usage progress</p>
                  <p className="font-medium">
                    {monthlyUsage} / {monthlyLimit}
                  </p>
                </div>

                <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-black/10">
                  <div
                    className="h-full rounded-full bg-black transition-all"
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>

                <p className="mt-3 text-xs text-black/50">
                  Total historical events: {usageCount}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
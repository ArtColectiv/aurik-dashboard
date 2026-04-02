"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";
import AppNav from "@/app/components/AppNav";

type PlanRow = {
  id: string;
  code: string;
  name: string;
  monthly_limit: number;
};

export default function BillingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [currentPlanCode, setCurrentPlanCode] = useState<string>("loading...");
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

      const { data: postingUser, error: postingUserError } = await supabaseClient
        .from("posting_users")
        .select("plan_code")
        .eq("id", user.id)
        .single();

      if (postingUserError || !postingUser) {
        setError(postingUserError?.message ?? "Posting user not found");
        setLoading(false);
        return;
      }

      setCurrentPlanCode(postingUser.plan_code);

      const { data, error } = await supabaseClient
        .from("posting_plans")
        .select("id, code, name, monthly_limit")
        .order("monthly_limit", { ascending: true });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setPlans((data ?? []) as PlanRow[]);
      setLoading(false);
    }

    void loadPage();
  }, [router]);

  async function handleSwitchToPro() {
    setSwitching(true);
    setError(null);

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { error } = await supabaseClient
      .from("posting_users")
      .update({ plan_code: "pro" })
      .eq("id", user.id);

    if (error) {
      setError(error.message);
      setSwitching(false);
      return;
    }

    setCurrentPlanCode("pro");
    setSwitching(false);
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
                Billing
              </h1>
            </div>

            <button
              onClick={handleSwitchToPro}
              disabled={switching || currentPlanCode === "pro"}
              className="rounded-lg border border-black/10 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {currentPlanCode === "pro"
                ? "Already Pro"
                : switching
                ? "Switching..."
                : "Switch to Pro"}
            </button>
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {plans.map((plan) => {
                const isCurrent = plan.code === currentPlanCode;

                return (
                  <div
                    key={plan.id}
                    className={
                      isCurrent
                        ? "rounded-xl border-2 border-black p-5"
                        : "rounded-xl border border-black/10 p-5"
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-black/50">{plan.code}</p>
                      {isCurrent && (
                        <span className="rounded-full bg-black px-2 py-1 text-xs text-white">
                          Current
                        </span>
                      )}
                    </div>

                    <h2 className="mt-2 text-xl font-semibold">{plan.name}</h2>

                    <p className="mt-3 text-sm text-black/60">
                      Monthly limit: {plan.monthly_limit}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
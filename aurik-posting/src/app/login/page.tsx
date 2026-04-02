"use client";

import { useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setLoading(true);
    setError(null);

    const { error: signInError, data } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    const user = data.user;

    if (!user) {
      setError("Utilisateur introuvable après connexion.");
      setLoading(false);
      return;
    }

    const { error: upsertError } = await supabaseClient
      .from("posting_users")
      .upsert({
        id: user.id,
        email: user.email ?? null,
      });

    if (upsertError) {
      setError(upsertError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6 py-16">
        <div className="w-full rounded-2xl border border-black/10 p-8 shadow-sm">
          <p className="text-sm uppercase tracking-[0.2em] text-black/50">
            Aurik Push
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Login
          </h1>

          <div className="mt-6 space-y-4">
            <input
              type="email"
              placeholder="Email"
              className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              type="password"
              placeholder="Password"
              className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full rounded-lg bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
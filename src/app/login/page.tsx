"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Surface the ?error=auth that the OAuth callback redirects back with.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("error")) {
      setError("Sign-in failed. Please try again.");
    }
  }, []);

  async function signInWithGoogle() {
    setError(null);
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // On success the browser is redirected to Google, so we only get here on error.
    if (error) {
      setError(error.message);
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-black/[.08] p-8 text-center dark:border-white/[.145]">
        <h1 className="text-2xl font-semibold tracking-tight">World Cup Predictor</h1>
        <p className="mt-2 text-sm text-zinc-500">Sign in to make your predictions.</p>
        <button
          onClick={signInWithGoogle}
          disabled={pending}
          className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Redirecting…" : "Continue with Google"}
        </button>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

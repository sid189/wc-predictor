"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces in server logs (Vercel) / browser console for debugging.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-zinc-500">
        An unexpected error occurred{error.digest ? ` (ref ${error.digest})` : ""}.
      </p>
      <button
        onClick={reset}
        className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background"
      >
        Try again
      </button>
    </div>
  );
}

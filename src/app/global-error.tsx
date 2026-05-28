"use client";

import { useEffect } from "react";

// Catches errors thrown in the root layout itself; must render its own <html>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center font-sans">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <button
          onClick={reset}
          className="rounded-full border px-5 py-2 text-sm font-medium"
        >
          Try again
        </button>
      </body>
    </html>
  );
}

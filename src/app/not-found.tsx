import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-zinc-500">That page doesn&apos;t exist.</p>
      <Link
        href="/matches"
        className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background"
      >
        Back to matches
      </Link>
    </div>
  );
}

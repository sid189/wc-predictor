export default function NotInvitedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-black/[.08] p-8 text-center dark:border-white/[.145]">
        <h1 className="text-xl font-semibold tracking-tight">You&apos;re not on the guest list</h1>
        <p className="mt-2 text-sm text-zinc-500">
          This is a private pool. Ask the admin to add your email, then sign in again.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button className="rounded-full border border-black/[.12] px-4 py-2 text-sm hover:bg-black/[.04] dark:border-white/[.2] dark:hover:bg-white/[.06]">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

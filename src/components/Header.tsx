import Link from "next/link";
import { getSessionUser } from "@/lib/server/auth";
import { authConfigured } from "@/lib/env";

export async function Header() {
  const user = authConfigured() ? await getSessionUser() : null;
  return (
    <header className="border-b border-navy-100 bg-white">
      <div className="container-page flex h-14 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 text-navy" aria-label="Camp Check by The Athlete Market — home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/athlete-market-mark.webp" alt="" width={40} height={32} className="h-8 w-auto" />
          <span className="flex flex-col leading-none">
            <span className="text-lg font-bold tracking-tight">Camp Check</span>
            <span className="mt-0.5 text-[11px] font-medium text-navy-500">by The Athlete Market</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/search" className="btn-ghost hidden px-3 sm:inline-flex">Browse</Link>
          <Link href="/compare" className="btn-ghost hidden px-3 sm:inline-flex">Compare</Link>
          <Link href="/pricing" className="btn-ghost px-3">Insider</Link>
          {user ? (
            <>
              {(user.role === "admin" || user.role === "moderator") && <Link href="/admin" className="btn-ghost px-3">Admin</Link>}
              <Link href="/account" className="btn-secondary px-3 py-2">Account</Link>
            </>
          ) : (
            <Link href="/login" className="btn-secondary px-3 py-2">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}

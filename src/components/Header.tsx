import Link from "next/link";
import { getSessionUser } from "@/lib/server/auth";
import { authConfigured } from "@/lib/env";

export async function Header() {
  const user = authConfigured() ? await getSessionUser() : null;
  return (
    <header className="border-b border-navy-100 bg-white">
      <div className="container-page flex h-14 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-navy">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-navy text-xs font-black text-white">CG</span>
          <span className="text-lg">CampGrade</span>
        </Link>
        <a href="https://theathletemarket.com" target="_blank" rel="noopener" className="hidden text-xs muted hover:text-brand md:inline">Powered by The Athlete Market</a>
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

"use client";
import Link from "next/link";
import { useViewer } from "@/lib/client/viewer";

/** Account links, resolved in the browser so the header (and every page) can be cached. */
export function HeaderAccount() {
  const viewer = useViewer();
  if (viewer?.signedIn) {
    return (
      <>
        {viewer.staff && <Link href="/admin" className="btn-ghost px-3">Admin</Link>}
        <Link href="/account" className="btn-secondary px-3 py-2">Account</Link>
      </>
    );
  }
  // Signed out (or still loading): same markup the server used to render for visitors.
  return <Link href="/login" className="btn-secondary px-3 py-2">Sign in</Link>;
}

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page max-w-xl py-20 text-center">
      <h1 className="text-2xl font-bold">We couldn&apos;t find that page</h1>
      <p className="mt-2 muted">The camp may have been removed or the link is wrong.</p>
      <Link href="/search" className="btn-primary mt-6">Search camps</Link>
    </div>
  );
}

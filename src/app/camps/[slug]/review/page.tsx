import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewForm } from "@/components/ReviewForm";
import { getPublicRepository } from "@/lib/data";
import { supabaseConfigured } from "@/lib/env";
import { getSessionUser } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Write a review", robots: { index: false } };

export default async function ReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await getPublicRepository().getCampBySlug(slug);
  if (!camp) notFound();
  const user = await getSessionUser();
  return (
    <div className="container-page max-w-2xl py-8">
      <Link href={`/camps/${camp.slug}`} className="text-sm muted hover:text-brand">← {camp.name}</Link>
      <h1 className="mt-2 text-2xl font-bold">Review {camp.name}</h1>
      <p className="mt-1 text-sm muted">Your honest experience helps families spend wisely. Reviews are moderated and must be first-hand.</p>
      <div className="mt-6">
        <ReviewForm camp={{ id: camp.id, slug: camp.slug, name: camp.name }} signedIn={!!user} enabled={supabaseConfigured() && !camp.isSample} />
      </div>
    </div>
  );
}

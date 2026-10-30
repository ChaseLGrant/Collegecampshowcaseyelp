import type { Metadata } from "next";
import { LeadCaptureForm } from "@/components/LeadCaptureForm";
import { databaseConfigured } from "@/lib/env";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompareButton } from "@/components/CompareButton";
import { ProvenanceTag } from "@/components/ProvenanceTag";
import { RatingBadge } from "@/components/RatingBadge";
import { EditorialRatingBadge, EditorsPickBadge } from "@/components/EditorialRating";
import { EDITORIAL_EXPLAINER, hasEditorialRating } from "@/lib/editorial";
import { ReportReview } from "@/components/ReportReview";
import { SampleBanner } from "@/components/SampleBanner";
import { Stars } from "@/components/Stars";
import { getVisitorRepository } from "@/lib/data";
import { hasFeature } from "@/lib/billing/entitlements";
import { saveCamp } from "@/lib/actions/saved-lists";
import { provenanceLabel } from "@/lib/external-reviews/rights";
import { formatDate, formatDateRange, formatPrice, locationLabel } from "@/lib/format";
import { RATING_CATEGORIES, ratingDisplay } from "@/lib/ratings";
import { safeHttpUrl } from "@/lib/security/urls";
import { getCurrentAccess } from "@/lib/server/access";
import { campJsonLd, campPageTitle, jsonLdScript } from "@/lib/seo/jsonld";
import { directoryPath, eventTypeLabel, sportLabel } from "@/lib/sports";
import { OrgLogo } from "@/components/OrgLogo";

type Params = { slug: string };

const SENTIMENT_LABEL = { positive: "Mostly positive", mixed: "Mixed", negative: "Mostly negative", neutral: "Neutral" } as const;
const SENTIMENT_CLASS = {
  positive: "font-medium text-emerald-800", mixed: "font-medium text-amber-900",
  negative: "font-medium text-red-700", neutral: "font-medium text-navy-500",
} as const;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const camp = await (await getVisitorRepository()).getCampBySlug((await params).slug);
  if (!camp) return { title: "Camp not found" };
  const rd = ratingDisplay(camp.stats);
  return {
    title: campPageTitle(camp),
    description: `${camp.name}: ${formatDateRange(camp.startDate, camp.endDate)} in ${locationLabel(camp.city, camp.state)}. ${formatPrice(camp.priceCents)}. ${rd.kind === "none" ? "Be the first to review it." : `Community rating ${rd.label}.`}`,
    alternates: { canonical: `/camps/${camp.slug}` },
    robots: camp.isSample ? { index: false, follow: false } : undefined,
  };
}

export default async function CampPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const repo = await getVisitorRepository();
  const camp = await repo.getCampBySlug(slug);
  if (!camp) notFound();
  const { access } = await getCurrentAccess();
  const [reviews, external, research] = await Promise.all([
    repo.listReviews(camp.id),
    repo.listExternalReviews(camp.id),
    repo.getResearchSummary(camp.id, access.tier),
  ]);
  const canSeeResearch = hasFeature(access, "premium_research");
  const ld = campJsonLd(camp);
  const reg = safeHttpUrl(camp.registrationUrl);
  const src = safeHttpUrl(camp.sourceUrl);
  const s = camp.stats;
  const catAvg: Record<string, number | null> = { value: s.avgValue, instruction: s.avgInstruction, exposure: s.avgExposure, organization: s.avgOrganization, overall: s.avgOverall };
  const factKind = camp.verificationStatus === "verified" ? "verified" : "advertised";

  return (
    <>
      <SampleBanner mode={repo.mode} />
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />}
      <div className="container-page py-6">
        <nav aria-label="Breadcrumb" className="text-sm muted">
          <Link href="/" className="hover:text-brand">Home</Link> /{" "}
          {camp.sport !== "other" ? <Link href={directoryPath(camp.sport)} className="hover:text-brand">{sportLabel(camp.sport)} camps</Link> : "Other sports"} / {camp.name}
        </nav>

        <header className="mt-3 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="flex flex-wrap gap-1.5">
              <EditorsPickBadge pick={camp.editorial.pick} />
              <span className="tag bg-brand-50 text-brand">{eventTypeLabel(camp.eventType)}</span>
              <span className="tag bg-navy-50 text-navy-700">{sportLabel(camp.sport)}</span>
              {camp.status === "cancelled" && <span className="tag bg-red-50 text-red-700">Cancelled</span>}
              {camp.verificationStatus === "verified" && <span className="tag bg-emerald-50 text-emerald-800">Verified {formatDate(camp.lastVerifiedAt)}</span>}
              {camp.verificationStatus === "stale" && <span className="tag bg-amber-50 text-amber-900">May be outdated — last verified {formatDate(camp.lastVerifiedAt)}</span>}
              {camp.verificationStatus === "unverified" && <span className="tag bg-navy-50 text-navy-500">Not yet verified</span>}
            </div>
            <div className="mt-2 flex items-start gap-3 sm:gap-4">
              <OrgLogo camp={camp} size="lg" className="mt-1" />
              <div className="min-w-0 flex-1">
                <h1 className="h1">{camp.name}</h1>
                <p className="mt-1 muted">
                  {camp.institutionName ?? "Independent event"}
                  {camp.association && camp.classificationVerified ? ` · ${camp.association}${camp.division ? ` ${camp.division}` : ""}` : ""}
                  {camp.organizerName && camp.organizerName !== camp.institutionName ? ` · Organized by ${camp.organizerName}` : ""}
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              <EditorialRatingBadge editorial={camp.editorial} size="md" showExplainer />
              <div><span className="sr-only">Parent reviews: </span><RatingBadge stats={camp.stats} size="md" reviewHref={`/camps/${camp.slug}/review`} /></div>
            </div>
          </div>
          <div className="space-y-4">
          <div className="card p-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="muted">Cost</dt><dd className="font-semibold">{formatPrice(camp.priceCents, camp.priceNotes)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="muted">Dates</dt><dd className="text-right">{formatDateRange(camp.startDate, camp.endDate)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="muted">Location</dt><dd className="text-right">{[camp.venue, locationLabel(camp.city, camp.state)].filter(Boolean).join(" · ")}</dd></div>
              {camp.eligibility && <div className="flex justify-between gap-3"><dt className="muted">Eligibility</dt><dd className="text-right">{camp.eligibility}</dd></div>}
            </dl>
            <div className="mt-4 grid gap-2">
              {reg ? (
                <a href={reg} target="_blank" rel="noopener noreferrer nofollow" className="btn-primary">Official registration ↗</a>
              ) : (
                <p className="text-xs muted">No official registration link on file.</p>
              )}
              <Link href={`/camps/${camp.slug}/review`} className="btn-secondary">Write a review</Link>
              <CompareButton slug={camp.slug} />
              {hasFeature(access, "saved_lists") && !camp.isSample && (
                <form action={saveCamp}>
                  <input type="hidden" name="campId" value={camp.id} />
                  <input type="hidden" name="slug" value={camp.slug} />
                  <button className="btn-ghost w-full">☆ Save to my camps</button>
                </form>
              )}
            </div>
            <p className="mt-3 text-xs muted">
              Facts are {factKind === "verified" ? "verified against" : "as advertised by"} the source{src ? <> — <a className="link" href={src} target="_blank" rel="noopener noreferrer nofollow">view source</a></> : ""}. Confirm details with the organizer before paying.
            </p>
          </div>
          <LeadCaptureForm variant="coach_call" sport={camp.sport} campSlug={camp.isSample ? null : camp.slug} sourcePage={`/camps/${camp.slug}`} enabled={databaseConfigured()} />
          </div>
        </header>

        {(camp.description || camp.positions.length > 0 || camp.participatingColleges.length > 0 || camp.coaches.length > 0) && (
          <section className="mt-8 max-w-3xl">
            <h2 className="h2">About this event</h2>
            {camp.description && <p className="mt-2 leading-relaxed">{camp.description}</p>}
            {camp.positions.length > 0 && <p className="mt-3 text-sm"><span className="font-semibold">Positions:</span> {camp.positions.join(", ")}</p>}
            {camp.participatingColleges.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold">Participating colleges</p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {camp.participatingColleges.map((c) => (
                    <li key={c.name} className="tag gap-1 bg-navy-50 text-navy-700">{c.name}<ProvenanceTag kind={c.verified ? "verified" : "advertised"} /></li>
                  ))}
                </ul>
                <p className="mt-1 text-xs muted">&ldquo;Advertised&rdquo; means the organizer lists the school; Camp Check has not confirmed attendance.</p>
              </div>
            )}
            {camp.coaches.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold">Advertised coaching staff</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {camp.coaches.map((c) => <li key={c.name}>{c.name}{c.title ? ` — ${c.title}` : ""} <ProvenanceTag kind={c.verified ? "verified" : "advertised"} /></li>)}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Camp Check editorial rating — staff opinion, kept separate from parent reviews */}
        {(hasEditorialRating(camp.editorial) || camp.editorial.pick || camp.editorial.rationale) && (
          <section className="mt-10 max-w-3xl" aria-labelledby="editorial-h">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="editorial-h" className="h2">Camp Check Editor Rating</h2>
              <EditorsPickBadge pick={camp.editorial.pick} />
            </div>
            <p className="text-sm muted">{EDITORIAL_EXPLAINER}</p>
            <div className="card mt-4 p-5">
              {hasEditorialRating(camp.editorial) && (
                <p className="flex items-center gap-2">
                  <Stars value={camp.editorial.score} size="md" label={`Editor rating ${camp.editorial.score.toFixed(1)} out of 5`} />
                  <span className="text-lg font-semibold">{camp.editorial.score.toFixed(1)}</span>
                  <span className="text-sm muted">/ 5</span>
                </p>
              )}
              {camp.editorial.rationale && (
                <p className="mt-3 whitespace-pre-line leading-relaxed">{camp.editorial.rationale}</p>
              )}
              <p className="mt-3 text-xs muted">Not included in the parent review average or review count.</p>
            </div>
          </section>
        )}

        {/* 1. Camp Check Community Reviews */}
        <section id="reviews" className="mt-10" aria-labelledby="community-h">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="community-h" className="h2">Camp Check Community Reviews</h2>
              <p className="text-sm muted">Authentic, first-hand reviews from parents and attendees. Separate from the Camp Check Editor Rating.</p>
            </div>
            <Link href={`/camps/${camp.slug}/review`} className="btn-primary">Write a review</Link>
          </div>
          {s.reviewCount > 0 ? (
            <div className="mt-4 grid gap-6 lg:grid-cols-[280px_1fr]">
              <div className="card h-fit p-4">
                <RatingBadge stats={s} size="md" reviewHref={`/camps/${camp.slug}/review`} />
                <ul className="mt-3 space-y-2 text-sm">
                  {RATING_CATEGORIES.map((c) => (
                    <li key={c.key} className="flex items-center justify-between gap-2">
                      <span>{c.label}</span>
                      <span className="flex items-center gap-1">{catAvg[c.key] != null && <><Stars value={catAvg[c.key]!} /><span className="w-7 text-right">{catAvg[c.key]!.toFixed(1)}</span></>}</span>
                    </li>
                  ))}
                </ul>
                {s.verifiedCount > 0 && <p className="mt-3 text-xs muted">{s.verifiedCount} with verified attendance</p>}
              </div>
              <ul className="space-y-4">
                {reviews.map((r) => (
                  <li key={r.id} className="card p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Stars value={r.ratings.overall} />
                      <p className="font-semibold">{r.title}</p>
                    </div>
                    <p className="mt-1 text-xs muted">
                      {r.authorName && <span className="font-medium text-navy-700">{r.authorName} · </span>}
                      <span className="tag mr-1 bg-navy-50 text-navy-700">{r.isGuest ? "Guest" : "Member"}</span>
                      {r.attendeeRole === "parent" ? "Parent" : r.attendeeRole === "athlete" ? "Athlete" : r.attendeeRole === "coach" ? "Coach" : "Attendee"}
                      {r.attendedYear ? ` · attended ${r.attendedYear}` : ""} · {formatDate(r.createdAt)}
                      {r.verified && <span className="ml-1 tag bg-emerald-50 text-emerald-800">Verified attendance</span>}
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{r.body}</p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs muted">
                      <span>Value {r.ratings.value} · Instruction {r.ratings.instruction} · Exposure {r.ratings.exposure} · Organization {r.ratings.organization}{r.wouldRecommend != null ? ` · ${r.wouldRecommend ? "Would recommend" : "Would not recommend"}` : ""}</span>
                      <ReportReview reviewId={r.id} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="card mt-4 p-6">
              <p className="font-semibold">No parent reviews yet — <Link href={`/camps/${camp.slug}/review`} className="link">be the first</Link>.</p>
              <p className="mt-1 text-sm muted">Attended this event? Your review helps other families decide. It takes about two minutes.</p>
            </div>
          )}
        </section>

        {/* 2. External Review Sources */}
        <section className="mt-10" aria-labelledby="external-h">
          <h2 id="external-h" className="h2">External Review Sources</h2>
          <p className="text-sm muted">Third-party information with source attribution. Not included in Camp Check&apos;s star rating.</p>
          {external.length ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {external.map((e) => (
                <li key={e.id} className="card p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{e.platformName}</span>
                    <span className="tag bg-navy-50 text-navy-700">{provenanceLabel(e.provenanceType)}</span>
                  </div>
                  {(e.reviewDate || e.sentiment) && (
                    <p className="mt-1 text-xs muted">
                      {e.reviewDate ? formatDate(e.reviewDate) : ""}
                      {e.reviewDate && e.sentiment ? " · " : ""}
                      {e.sentiment ? <span className={SENTIMENT_CLASS[e.sentiment]}>{SENTIMENT_LABEL[e.sentiment]}</span> : null}
                    </p>
                  )}
                  {e.rating != null && e.ratingScale && <p className="mt-1">Rated {e.rating} / {e.ratingScale} on {e.platformName}</p>}
                  {e.excerpt && (e.paraphrased ? (
                    <p className="mt-2 leading-relaxed"><span className="sr-only">Summary: </span>{e.excerpt}</p>
                  ) : (
                    <blockquote className="mt-2 border-l-2 border-navy-100 pl-3 italic">&ldquo;{e.excerpt}&rdquo;</blockquote>
                  ))}
                  {e.reviewerDisplay && <p className="mt-1 text-xs muted">— {e.reviewerDisplay}</p>}
                  <p className="mt-2 text-xs muted">
                    {e.attribution}{e.paraphrased ? " (Camp Check's summary, not a quote)" : ""}
                    {e.referencedName !== camp.name ? ` · refers to “${e.referencedName}”` : ""}
                  </p>
                  <a href={safeHttpUrl(e.sourceUrl) ?? "#"} target="_blank" rel="noopener noreferrer nofollow" className="link mt-2 inline-block text-xs">
                    Read on {e.platformName} ↗
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm muted">No permitted external sources on file for this event yet.</p>
          )}
        </section>

        {/* 3. Camp Check Research Summary */}
        <section className="mt-10" aria-labelledby="research-h">
          <h2 id="research-h" className="h2">Camp Check Research Summary</h2>
          <p className="text-sm muted">AI-assisted synthesis of verifiable information, reviewed by Camp Check staff. This is research, not a first-hand review.</p>
          {research ? (
            <div className="card mt-4 p-5">
              <p className="leading-relaxed">{research.summary.replace(/\s*\[F\d+\]/g, "")}</p>
              {research.considerations.length > 0 && (
                <>
                  <p className="mt-4 font-semibold">Things to weigh</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{research.considerations.map((c) => <li key={c}>{c}</li>)}</ul>
                </>
              )}
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer font-medium">Sources used ({research.facts.length})</summary>
                <ul className="mt-2 space-y-1">
                  {research.facts.map((f) => (
                    <li key={f.id} className="text-xs">
                      <span className="font-mono text-navy-300">{f.id}</span> {f.text}{" "}
                      {f.sourceUrl && safeHttpUrl(f.sourceUrl) && <a className="link" href={safeHttpUrl(f.sourceUrl)!} target="_blank" rel="noopener noreferrer nofollow">source</a>}
                    </li>
                  ))}
                </ul>
              </details>
              <p className="mt-3 text-xs muted">{research.method === "ai_assisted" ? "Drafted with AI from the cited facts and approved by Camp Check staff" : "Compiled from the cited facts"} · {formatDate(research.generatedAt)}</p>
            </div>
          ) : canSeeResearch ? (
            <p className="mt-3 text-sm muted">Research for this event is in progress.</p>
          ) : (
            <div className="card mt-4 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">Premium research summaries — tradeoffs, verified college attendance and cost context — are included with <span className="font-semibold">Recruiting Insider</span>.</p>
              <Link href="/pricing" className="btn-secondary shrink-0">See Insider</Link>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

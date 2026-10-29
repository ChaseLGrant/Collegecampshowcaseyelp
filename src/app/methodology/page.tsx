import type { Metadata } from "next";
import { MIN_REVIEWS_FOR_ESTABLISHED, RATING_CATEGORIES } from "@/lib/ratings";
import { STALE_AFTER_DAYS } from "@/lib/ingestion/staleness";

export const metadata: Metadata = {
  title: "How CampGrade ratings and research work",
  description: "How CampGrade collects camp listings, moderates community reviews, attributes external sources, and labels AI-assisted research.",
};

export default function MethodologyPage() {
  return (
    <article className="container-page max-w-3xl space-y-6 py-10 leading-relaxed">
      <h1 className="h1">How CampGrade works</h1>
      <p>CampGrade is independent. Camps cannot pay to change their rating, remove reviews, or appear higher in search results.</p>
      <section>
        <h2 className="h2">Camp listings</h2>
        <p className="mt-2">Listings come from official college athletics sites, camp and showcase organizers, licensed data providers, structured feeds, and community submissions. Every listing records its source. Our team approves each new listing before it is published. We follow website terms and robots.txt, and we never get around logins, paywalls or bot protections.</p>
        <p className="mt-2">If a detail isn&apos;t published by the source, we leave it blank rather than guess. Listings not re-checked in {STALE_AFTER_DAYS} days are marked &ldquo;may be outdated&rdquo;.</p>
      </section>
      <section>
        <h2 className="h2">CampGrade Community Reviews</h2>
        <p className="mt-2">Reviews are written by parents, athletes (18+) and coaches who attended. Each review rates five categories:</p>
        <ul className="mt-2 list-disc pl-5">{RATING_CATEGORIES.map((c) => <li key={c.key}>{c.label}</li>)}</ul>
        <p className="mt-2">The star rating is the average &ldquo;Overall Experience&rdquo; score of published community reviews only. Camps with no reviews show &ldquo;No reviews yet&rdquo; — never a default score. Camps with fewer than {MIN_REVIEWS_FOR_ESTABLISHED} reviews are labeled &ldquo;early rating&rdquo;, and when sorting by rating we use an adjusted score so one or two reviews can&apos;t outrank a well-reviewed camp.</p>
        <p className="mt-2">We screen for spam, duplicates and fake reviews; flagged reviews go to human moderators. Reviewers can optionally upload proof of attendance for a &ldquo;Verified attendance&rdquo; badge. Our automated data imports cannot create, edit or delete community reviews.</p>
      </section>
      <section>
        <h2 className="h2">External Review Sources</h2>
        <p className="mt-2">We show third-party information only when we have the right to: licensed datasets, authorized APIs, permitted public pages, organizer testimonials (labeled as organizer-provided) and independent editorial evaluations. Where we don&apos;t have rights to republish text or ratings, we show only the source name and a link. External ratings are never mixed into CampGrade&apos;s star rating.</p>
      </section>
      <section>
        <h2 className="h2">CampGrade Research Summary</h2>
        <p className="mt-2">Research summaries are drafted with AI from a numbered list of facts — the listing, community rating statistics and permitted external sources — and every sentence must cite those facts. Uncited claims are discarded automatically, and a staff member reviews each summary before it is published. Research summaries are not reviews and are never counted as one.</p>
      </section>
      <section>
        <h2 className="h2">What we will never claim</h2>
        <p className="mt-2">No camp, showcase or CampGrade recommendation can guarantee recruiting exposure, a scholarship offer or a roster spot. &ldquo;Advertised&rdquo; college attendance means the organizer lists the school; &ldquo;Verified&rdquo; means we confirmed it with an official source.</p>
      </section>
    </article>
  );
}

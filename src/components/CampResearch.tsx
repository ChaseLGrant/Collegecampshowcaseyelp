"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { safeHttpUrl } from "@/lib/security/urls";
import { useViewer } from "@/lib/client/viewer";
import type { ResearchSummary } from "@/lib/types";

function ResearchCard({ research }: { research: ResearchSummary }) {
  return (
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
  );
}

/**
 * Research summary. The cached page renders the free-tier summary (or the Insider upsell) for
 * everyone; Insider members' premium summary is fetched in the browser.
 */
export function CampResearch({ slug, initial, isSample }: { slug: string; initial: ResearchSummary | null; isSample: boolean }) {
  const viewer = useViewer();
  const canSeeResearch = !!viewer?.features?.premium_research;
  const [premium, setPremium] = useState<ResearchSummary | null | undefined>(undefined);

  useEffect(() => {
    if (!canSeeResearch || isSample) return;
    let alive = true;
    fetch(`/api/camps/${encodeURIComponent(slug)}/research`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { research: null }))
      .then((d: { research: ResearchSummary | null }) => alive && setPremium(d.research))
      .catch(() => alive && setPremium(null));
    return () => { alive = false; };
  }, [canSeeResearch, isSample, slug]);

  const research = premium ?? initial;
  if (research) return <ResearchCard research={research} />;
  if (canSeeResearch) return <p className="mt-3 text-sm muted">Research for this event is in progress.</p>;
  return (
    <div className="card mt-4 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm">Premium research summaries — tradeoffs, verified college attendance and cost context — are included with <span className="font-semibold">Recruiting Insider</span>.</p>
      <Link href="/pricing" className="btn-secondary shrink-0">See Insider</Link>
    </div>
  );
}

import Link from "next/link";
import { formatDateRange, formatPrice, locationLabel } from "@/lib/format";
import { eventTypeLabel, sportLabel } from "@/lib/sports";
import type { CampSummary } from "@/lib/types";
import { RatingBadge } from "./RatingBadge";

export function CampCard({ camp, showSport = false }: { camp: CampSummary; showSport?: boolean }) {
  return (
    <article className="card flex flex-col gap-2 p-4 transition hover:border-brand/40">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="tag bg-brand-50 text-brand">{eventTypeLabel(camp.eventType)}</span>
        {showSport && <span className="tag bg-navy-50 text-navy-700">{sportLabel(camp.sport)}</span>}
        {camp.status === "cancelled" && <span className="tag bg-red-50 text-red-700">Cancelled</span>}
        {camp.isSample && <span className="tag bg-amber-50 text-amber-800">Sample</span>}
      </div>
      <h3 className="text-base font-semibold leading-snug">
        <Link href={`/camps/${camp.slug}`} className="hover:text-brand">
          {camp.name}
        </Link>
      </h3>
      <p className="text-sm text-navy-500">
        {camp.institutionName ?? camp.organizerName ?? "Independent organizer"}
        {camp.association && camp.classificationVerified ? ` · ${camp.association}${camp.division ? ` ${camp.division}` : ""}` : ""}
      </p>
      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <div>
          <dt className="sr-only">Location</dt>
          <dd>{locationLabel(camp.city, camp.state)}</dd>
        </div>
        <div className="text-right">
          <dt className="sr-only">Cost</dt>
          <dd className="font-semibold">{formatPrice(camp.priceCents)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="sr-only">Dates</dt>
          <dd className="text-navy-500">{formatDateRange(camp.startDate, camp.endDate)}</dd>
        </div>
      </dl>
      <div className="mt-auto border-t border-navy-50 pt-2">
        <RatingBadge stats={camp.stats} />
      </div>
    </article>
  );
}

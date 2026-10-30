import Link from "next/link";
import { ratingDisplay } from "@/lib/ratings";
import type { RatingStats } from "@/lib/types";
import { Stars } from "./Stars";

/** Community (parent/attendee) rating only. Editorial scores are shown separately and never feed this. */
export function RatingBadge({ stats, size = "sm", reviewHref }: { stats: RatingStats; size?: "sm" | "md" | "lg"; reviewHref?: string }) {
  const d = ratingDisplay(stats);
  if (d.kind === "none") {
    return (
      <span className="text-sm text-navy-500">
        No parent reviews yet —{" "}
        {reviewHref ? <Link href={reviewHref} className="link">be the first</Link> : "be the first"}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm">
      <Stars value={d.value} size={size} />
      <span className="font-semibold text-navy">{d.value.toFixed(1)}</span>
      <span className="text-navy-500">
        ({d.count} parent {d.count === 1 ? "review" : "reviews"}){d.kind === "early" ? " · early" : ""}
      </span>
    </span>
  );
}

import { ratingDisplay } from "@/lib/ratings";
import type { RatingStats } from "@/lib/types";
import { Stars } from "./Stars";

export function RatingBadge({ stats, size = "sm" }: { stats: RatingStats; size?: "sm" | "md" | "lg" }) {
  const d = ratingDisplay(stats);
  if (d.kind === "none") {
    return <span className="text-sm text-navy-500">No reviews yet</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm">
      <Stars value={d.value} size={size} />
      <span className="font-semibold text-navy">{d.value.toFixed(1)}</span>
      <span className="text-navy-500">
        ({d.count} {d.count === 1 ? "review" : "reviews"}){d.kind === "early" ? " · early" : ""}
      </span>
    </span>
  );
}

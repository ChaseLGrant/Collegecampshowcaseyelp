import type { SourceRecord } from "./types";

/** Gate every ingestion run: a source must be reviewed and permitted before we touch it. */
export function ingestionPolicy(source: Pick<SourceRecord, "contentRights" | "termsReviewedAt" | "enabled" | "adapter" | "respectsRobots">, opts: { manualTrigger?: boolean } = {}):
  { allowed: true } | { allowed: false; reason: string } {
  if (source.adapter === "manual") return { allowed: false, reason: "Manual sources receive submissions; they are not crawled" };
  if (source.contentRights === "prohibited") return { allowed: false, reason: "Source terms prohibit use" };
  if (source.contentRights === "unknown") return { allowed: false, reason: "Content rights not reviewed yet — set them in the source registry" };
  if (!source.termsReviewedAt) return { allowed: false, reason: "Terms of use not reviewed yet" };
  if (!source.respectsRobots && source.adapter !== "csv" && source.adapter !== "json_feed") {
    return { allowed: false, reason: "Web sources must respect robots.txt" };
  }
  if (!source.enabled && !opts.manualTrigger) return { allowed: false, reason: "Source is disabled" };
  return { allowed: true };
}

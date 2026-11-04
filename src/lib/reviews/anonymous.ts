import type { CommunityReview } from "../types";

/**
 * Public reviewer label. Reviews are anonymous: the only identity shown is the role the
 * reviewer picked. Older rows stored as "other" display as a generic "Attendee".
 */
export function reviewerRoleLabel(role: CommunityReview["attendeeRole"]): string {
  return role === "parent" ? "Parent" : role === "athlete" ? "Athlete" : role === "coach" ? "Coach" : "Attendee";
}

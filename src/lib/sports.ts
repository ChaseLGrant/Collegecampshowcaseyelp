export const SPORTS = [
  { id: "baseball", label: "Baseball", plural: "Baseball camps" },
  { id: "softball", label: "Softball", plural: "Softball camps" },
  { id: "football", label: "Football", plural: "Football camps" },
  { id: "basketball", label: "Basketball", plural: "Basketball camps" },
  { id: "soccer", label: "Soccer", plural: "Soccer camps" },
  { id: "volleyball", label: "Volleyball", plural: "Volleyball camps" },
  { id: "lacrosse", label: "Lacrosse", plural: "Lacrosse camps" },
  { id: "other", label: "Other", plural: "Other sport camps" },
] as const;

export type SportId = (typeof SPORTS)[number]["id"];
export const SPORT_IDS = SPORTS.map((s) => s.id) as SportId[];

/** Sports that get a dedicated /{sport}-camps directory page. */
export const DIRECTORY_SPORTS = SPORT_IDS.filter((s) => s !== "other");

export const SPORT_COOKIE = "cg_sport";

export function isSportId(v: unknown): v is SportId {
  return typeof v === "string" && (SPORT_IDS as string[]).includes(v);
}

export function sportLabel(id: SportId | string | null | undefined): string {
  return SPORTS.find((s) => s.id === id)?.label ?? "All sports";
}

export function directoryPath(sport: SportId): string {
  return `/${sport}-camps`;
}

/** Parses "baseball-camps" → "baseball". Returns null for anything else. */
export function sportFromDirectorySegment(segment: string): SportId | null {
  const m = /^([a-z]+)-camps$/.exec(segment);
  if (!m) return null;
  const s = m[1];
  return isSportId(s) && s !== "other" ? s : null;
}

export const EVENT_TYPES = [
  { id: "prospect_camp", label: "Prospect camp" },
  { id: "id_camp", label: "ID camp" },
  { id: "showcase", label: "Showcase" },
  { id: "clinic", label: "Clinic" },
  { id: "combine", label: "Combine" },
  { id: "elite_camp", label: "Elite camp" },
  { id: "tournament", label: "Tournament" },
  { id: "other", label: "Other" },
] as const;
export type EventType = (typeof EVENT_TYPES)[number]["id"];
export const EVENT_TYPE_IDS = EVENT_TYPES.map((e) => e.id) as EventType[];
export function eventTypeLabel(id: string): string {
  return EVENT_TYPES.find((e) => e.id === id)?.label ?? "Event";
}

export const ASSOCIATIONS = ["NCAA", "NAIA", "NJCAA", "CCCAA", "USCAA", "NWAC", "Other"] as const;
export type Association = (typeof ASSOCIATIONS)[number];

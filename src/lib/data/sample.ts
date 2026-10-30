import { emptyStats } from "../ratings";
import type { CampDetail } from "../types";
import type { EventType, SportId } from "../sports";

/**
 * SAMPLE DATA — fictional institutions and events used only when no database is
 * configured, so the interface can be explored locally. Every record is flagged
 * isSample and the UI shows a "Sample data" banner. There are deliberately no
 * sample reviews: Camp Check never fabricates reviews, even for demos.
 */
function daysFromNow(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

interface Seed {
  slug: string; name: string; sport: SportId; eventType: EventType; inst: string | null;
  assoc?: string; div?: string; org: string; city: string; state: string; start: number; len: number;
  price: number | null; desc: string; positions?: string[]; eligibility?: string;
}

const seeds: Seed[] = [
  { slug: "sample-state-baseball-prospect-camp", name: "Sample State Baseball Prospect Camp", sport: "baseball", eventType: "prospect_camp", inst: "Sample State University", assoc: "NCAA", div: "D1", org: "Sample State Athletics", city: "Austin", state: "TX", start: 40, len: 1, price: 19500, desc: "One-day prospect camp with defensive evaluation, batting practice and a showcase game. (Sample listing.)", positions: ["RHP", "LHP", "C", "IF", "OF"], eligibility: "Grad years 2027–2029" },
  { slug: "sample-showcase-series-baseball-texas", name: "Sample Showcase Series — Texas", sport: "baseball", eventType: "showcase", inst: null, org: "Sample Showcase Co.", city: "Houston", state: "TX", start: 55, len: 2, price: 29900, desc: "Two-day showcase with measurables (60-yard dash, exit velocity, pop time). (Sample listing.)" },
  { slug: "demo-lakes-college-softball-id-camp", name: "Demo Lakes College Softball ID Camp", sport: "softball", eventType: "id_camp", inst: "Demo Lakes College", assoc: "NCAA", div: "D3", org: "Demo Lakes Athletics", city: "Madison", state: "WI", start: 30, len: 1, price: 12500, desc: "ID camp run by the coaching staff covering hitting, fielding and pitching. (Sample listing.)", eligibility: "Grades 9–12" },
  { slug: "example-tech-football-prospect-camp", name: "Example Tech Football Prospect Camp", sport: "football", eventType: "prospect_camp", inst: "Example Tech", assoc: "NCAA", div: "D2", org: "Example Tech Football", city: "Atlanta", state: "GA", start: 70, len: 1, price: 6000, desc: "Position-specific drills and testing for high school prospects. (Sample listing.)", positions: ["QB", "WR", "RB", "OL", "DL", "LB", "DB"] },
  { slug: "sample-hoops-elite-camp", name: "Sample Hoops Elite Camp", sport: "basketball", eventType: "elite_camp", inst: "Sample State University", assoc: "NCAA", div: "D1", org: "Sample State Athletics", city: "Austin", state: "TX", start: 85, len: 2, price: 22500, desc: "Invite-style elite camp with skill stations and live play. (Sample listing.)" },
  { slug: "demo-coast-soccer-id-camp", name: "Demo Coast Soccer ID Camp", sport: "soccer", eventType: "id_camp", inst: "Demo Coast University", assoc: "NAIA", org: "Demo Coast Athletics", city: "San Diego", state: "CA", start: 25, len: 2, price: 17500, desc: "Two-day ID camp with small-sided games and staff feedback. (Sample listing.)" },
  { slug: "example-volleyball-skills-clinic", name: "Example Volleyball Skills Clinic", sport: "volleyball", eventType: "clinic", inst: "Example Community College", assoc: "NJCAA", org: "Example CC Athletics", city: "Phoenix", state: "AZ", start: 20, len: 1, price: 8500, desc: "Half-day clinic focused on serve receive and setting. (Sample listing.)" },
  { slug: "sample-lacrosse-showcase-northeast", name: "Sample Lacrosse Showcase — Northeast", sport: "lacrosse", eventType: "showcase", inst: null, org: "Sample Showcase Co.", city: "Baltimore", state: "MD", start: 60, len: 2, price: null, desc: "Regional showcase; price not yet published by the organizer. (Sample listing.)" },
  { slug: "demo-lakes-baseball-winter-camp", name: "Demo Lakes Baseball Winter Camp", sport: "baseball", eventType: "clinic", inst: "Demo Lakes College", assoc: "NCAA", div: "D3", org: "Demo Lakes Athletics", city: "Madison", state: "WI", start: 95, len: 1, price: 0, desc: "Free indoor skills session hosted by the coaching staff. (Sample listing.)" },
];

export const SAMPLE_CAMPS: CampDetail[] = seeds.map((s, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  slug: s.slug,
  name: s.name,
  sport: s.sport,
  sportDetail: null,
  eventType: s.eventType,
  institutionName: s.inst,
  institutionSlug: s.inst ? s.inst.toLowerCase().replace(/[^a-z0-9]+/g, "-") : null,
  association: s.assoc ?? null,
  division: s.div ?? null,
  classificationVerified: Boolean(s.assoc),
  organizerName: s.org,
  city: s.city,
  state: s.state,
  venue: null,
  startDate: daysFromNow(s.start),
  endDate: daysFromNow(s.start + s.len - 1),
  priceCents: s.price,
  priceNotes: null,
  registrationUrl: null,
  status: "published",
  verificationStatus: "unverified",
  lastVerifiedAt: null,
  sourceUrl: null,
  description: s.desc,
  eligibility: s.eligibility ?? null,
  positions: s.positions ?? [],
  participatingColleges: [],
  coaches: [],
  stats: emptyStats(),
  editorial: { score: null, pick: false, rationale: null }, // no fabricated editorial ratings on sample data
  isSample: true,
}));

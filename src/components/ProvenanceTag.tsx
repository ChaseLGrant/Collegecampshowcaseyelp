import type { CellKind } from "@/lib/compare/compare";

const STYLES: Record<CellKind, [string, string]> = {
  verified: ["bg-emerald-50 text-emerald-800", "Verified fact"],
  advertised: ["bg-sky-50 text-sky-800", "Advertised"],
  opinion: ["bg-amber-50 text-amber-900", "Community opinion"],
  research: ["bg-violet-50 text-violet-800", "Research (AI-assisted)"],
  missing: ["bg-navy-50 text-navy-500", "Not available"],
  estimate: ["bg-navy-50 text-navy-700", "Estimate"],
};

export function ProvenanceTag({ kind }: { kind: CellKind }) {
  const [cls, label] = STYLES[kind];
  return <span className={`tag ${cls}`}>{label}</span>;
}

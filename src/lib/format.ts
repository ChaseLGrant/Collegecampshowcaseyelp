export function formatPrice(cents: number | null | undefined, notes?: string | null): string {
  if (cents == null) return notes ? notes : "Price not listed";
  if (cents === 0) return "Free";
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: dollars % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "Dates not announced";
  const s = parts(start);
  const sLabel = `${MONTHS[s.m - 1]} ${s.d}, ${s.y}`;
  if (!end || end === start) return sLabel;
  const e = parts(end);
  if (s.y === e.y && s.m === e.m) return `${MONTHS[s.m - 1]} ${s.d}–${e.d}, ${s.y}`;
  if (s.y === e.y) return `${MONTHS[s.m - 1]} ${s.d} – ${MONTHS[e.m - 1]} ${e.d}, ${s.y}`;
  return `${sLabel} – ${MONTHS[e.m - 1]} ${e.d}, ${e.y}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return formatDateRange(iso.slice(0, 10), null);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function locationLabel(city: string | null, state: string | null): string {
  return [city, state].filter(Boolean).join(", ") || "Location not listed";
}

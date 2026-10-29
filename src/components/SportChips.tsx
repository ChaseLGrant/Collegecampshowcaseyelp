"use client";
import Link from "next/link";
import { SPORTS, SPORT_COOKIE, type SportId } from "@/lib/sports";

export function rememberSport(sport: SportId | "all") {
  try {
    document.cookie = `${SPORT_COOKIE}=${sport}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
  } catch {
    /* cookies disabled — filter still works via the URL */
  }
}

/** Prominent sport selector. Hrefs are computed on the server; the click also remembers the choice. */
export function SportChips({ active, hrefs, showAll = true, wrap = false }: {
  active: SportId | null;
  hrefs: Record<string, string>;
  showAll?: boolean;
  /** Wrap onto several lines (homepage) instead of a horizontal scroller. */
  wrap?: boolean;
}) {
  return (
    <nav aria-label="Choose a sport" className={wrap ? "" : "-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"}>
      <ul className={wrap ? "flex flex-wrap gap-2" : "flex gap-2 sm:flex-wrap"}>
        {showAll && (
          <li>
            <Link href={hrefs.all} onClick={() => rememberSport("all")} className={active ? "chip-off" : "chip-on"} aria-current={!active ? "true" : undefined}>
              All sports
            </Link>
          </li>
        )}
        {SPORTS.map((s) => (
          <li key={s.id}>
            <Link href={hrefs[s.id]} onClick={() => rememberSport(s.id)} className={active === s.id ? "chip-on" : "chip-off"} aria-current={active === s.id ? "true" : undefined}>
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

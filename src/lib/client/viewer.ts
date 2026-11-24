"use client";
import { useEffect, useState } from "react";

export interface Viewer {
  signedIn: boolean;
  staff?: boolean;
  features?: { saved_lists: boolean; premium_research: boolean };
  tier?: "free" | "insider" | "elite";
}

let inflight: Promise<Viewer> | null = null;
let inflightPath: string | null = null;

/**
 * The signed-in visitor from /api/me. One request per page view, shared by the header and any
 * per-visitor island on the page (pages themselves are cached and identical for everyone).
 * /api/ is disallowed in robots.txt, so crawlers that render JS don't call it.
 */
export function loadViewer(): Promise<Viewer> {
  const path = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
  if (!inflight || inflightPath !== path) {
    inflightPath = path;
    inflight = fetch("/api/me", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Viewer>) : { signedIn: false }))
      .catch(() => ({ signedIn: false }));
  }
  return inflight;
}

export function useViewer(): Viewer | null {
  const [v, setV] = useState<Viewer | null>(null);
  useEffect(() => {
    let alive = true;
    loadViewer().then((x) => alive && setV(x));
    return () => { alive = false; };
  }, []);
  return v;
}

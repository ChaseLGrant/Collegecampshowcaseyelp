"use client";
import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => { scriptPromise = null; reject(new Error("turnstile script failed")); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/**
 * Cloudflare Turnstile "verify you're human" widget. Renders nothing unless
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. Bump `resetKey` to get a fresh token after a failed submit.
 */
export function TurnstileWidget({ onToken, resetKey = 0 }: { onToken: (token: string) => void; resetKey?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !el.current || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(el.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (t: string) => cb.current(t),
        "expired-callback": () => cb.current(""),
        "error-callback": () => cb.current(""),
      });
    }).catch(() => { /* the server will ask them to retry */ });
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey && widgetId.current && window.turnstile) { window.turnstile.reset(widgetId.current); cb.current(""); }
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={el} className="min-h-[65px]" />;
}

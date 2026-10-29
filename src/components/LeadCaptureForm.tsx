"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { SPORTS } from "@/lib/sports";

type Variant = "alerts" | "coach_call";

const THIS_YEAR = new Date().getFullYear();
const GRAD_YEARS = Array.from({ length: 8 }, (_, i) => THIS_YEAR + i);

/**
 * (a) "alerts": free camp alerts + the "Is this camp worth it?" checklist.
 * (b) "coach_call": camp-page sidebar — notify about similar camps / talk to a former college coach.
 */
export function LeadCaptureForm({ variant, sport, campSlug, sourcePage, enabled }: {
  variant: Variant; sport?: string | null; campSlug?: string | null; sourcePage: string; enabled: boolean;
}) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const started = useRef(Date.now());
  const coach = variant === "coach_call";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("sending");
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: f.get("name") ?? "", email: f.get("email"), phone: f.get("phone") ?? "", role: f.get("role"),
        gradYear: f.get("gradYear") ?? "", sport: f.get("sport"), interest: coach ? "coach_call" : "camp_alerts",
        sourcePage, campSlug: campSlug ?? "", consent: f.get("consent") === "on", website: f.get("website") ?? "",
        elapsedMs: Date.now() - started.current,
      }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    if (!res?.ok) { setState("error"); setMsg(body?.error ?? "Something went wrong. Please try again."); return; }
    setState("done");
  }

  if (state === "done") {
    return (
      <div className="card p-5" role="status">
        <p className="font-semibold">You&apos;re on the list.</p>
        {coach ? (
          <p className="mt-1 text-sm muted">Someone from The Athlete Market will reach out by email to find a time. There&apos;s no obligation.</p>
        ) : (
          <p className="mt-1 text-sm muted">We&apos;ll email you camp alerts for your sport. Here&apos;s your checklist: <Link href="/checklist" className="link">Is this camp worth it?</Link></p>
        )}
      </div>
    );
  }

  const idp = coach ? "lc" : "la";
  return (
    <form onSubmit={submit} className="card space-y-3 p-5" aria-labelledby={`${idp}-title`}>
      <div>
        <p id={`${idp}-title`} className="font-semibold">
          {coach ? "Get notified about camps like this" : "Get free camp alerts + our “Is this camp worth it?” checklist"}
        </p>
        <p className="mt-1 text-sm muted">
          {coach
            ? "Or talk to a former college coach before you pay — a free call to go over whether this event fits your athlete."
            : "New camps for your sport in your inbox, plus the questions to ask before you register."}
        </p>
      </div>
      {coach && (
        <div>
          <label className="label" htmlFor={`${idp}-name`}>Name</label>
          <input id={`${idp}-name`} name="name" autoComplete="name" maxLength={100} className="input" />
        </div>
      )}
      <div>
        <label className="label" htmlFor={`${idp}-email`}>Email</label>
        <input id={`${idp}-email`} name="email" type="email" required autoComplete="email" inputMode="email" maxLength={254} className="input" placeholder="you@example.com" />
      </div>
      {coach && (
        <div>
          <label className="label" htmlFor={`${idp}-phone`}>Phone (optional)</label>
          <input id={`${idp}-phone`} name="phone" type="tel" autoComplete="tel" maxLength={30} className="input" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor={`${idp}-sport`}>Sport</label>
          <select id={`${idp}-sport`} name="sport" required defaultValue={sport ?? ""} className="input">
            <option value="" disabled>Choose</option>
            {SPORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${idp}-grad`}>Grad year</label>
          <select id={`${idp}-grad`} name="gradYear" defaultValue="" className="input">
            <option value="">—</option>
            {GRAD_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <fieldset>
        <legend className="label">I&apos;m a…</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {(coach ? ["parent", "athlete", "coach"] : ["parent", "athlete"]).map((r, i) => (
            <label key={r} className="flex items-center gap-1.5">
              <input type="radio" name="role" value={r} required defaultChecked={i === 0} />{r[0].toUpperCase() + r.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="hidden" aria-hidden="true"><label>Website <input type="text" name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="flex items-start gap-2 text-xs muted">
        <input type="checkbox" name="consent" required className="mt-0.5" />
        <span>{coach
          ? "OK to contact me by email (or phone, if given) about camps and a call. CampGrade and The Athlete Market only — unsubscribe anytime."
          : "Email me camp alerts and the checklist from CampGrade and The Athlete Market. Unsubscribe anytime."}</span>
      </label>
      <button className="btn-primary w-full" disabled={state === "sending" || !enabled}>
        {state === "sending" ? "Sending…" : coach ? "Notify me / request a call" : "Send me alerts + checklist"}
      </button>
      {!enabled && <p className="text-xs muted">Sign-ups open once the database is connected.</p>}
      {state === "error" && <p className="text-sm text-red-700" role="alert">{msg}</p>}
    </form>
  );
}

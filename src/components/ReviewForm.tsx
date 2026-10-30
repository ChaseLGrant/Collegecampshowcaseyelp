"use client";
import { useEffect, useRef, useState } from "react";
import { RATING_CATEGORIES, type RatingKey } from "@/lib/ratings";

type Draft = {
  ratings: Partial<Record<RatingKey, number>>;
  attendeeRole: "" | "parent" | "athlete" | "coach" | "other";
  attendedYear: string;
  title: string;
  body: string;
  wouldRecommend: "" | "yes" | "no";
  confirmAdult: boolean;
  confirmFirsthand: boolean;
  guestName: string;
};

const EMPTY: Draft = { ratings: {}, attendeeRole: "", attendedYear: "", title: "", body: "", wouldRecommend: "", confirmAdult: false, confirmFirsthand: false, guestName: "" };

function StarInput({ name, label, value, onChange }: { name: string; label: string; value?: number; onChange: (v: number) => void }) {
  return (
    <fieldset className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <legend className="text-sm font-medium sm:float-left">{label}</legend>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer p-1">
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" />
            <svg width="30" height="30" viewBox="0 0 20 20" aria-hidden="true">
              <path fill={value && n <= value ? "#C9A227" : "#E7ECF3"} d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
            </svg>
            <span className="sr-only">{n} star{n > 1 ? "s" : ""}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ReviewForm({ camp, signedIn, enabled }: { camp: { id: string; slug: string; name: string }; signedIn: boolean; enabled: boolean }) {
  const key = `cg_review_draft:${camp.id}`;
  const [d, setD] = useState<Draft>(EMPTY);
  const [restored, setRestored] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "published" | "pending">("idle");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [postedAsGuest, setPostedAsGuest] = useState(false);
  // Kept out of the saved draft on purpose (shared devices).
  const [guestEmail, setGuestEmail] = useState("");
  const [proofState, setProofState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const started = useRef(Date.now());
  const honeypot = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) { setD({ ...EMPTY, ...JSON.parse(saved) }); setRestored(true); }
    } catch { /* ignore */ }
  }, [key]);

  const update = (patch: Partial<Draft>) => {
    setD((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  function localErrors(): string[] {
    const e: string[] = [];
    if (RATING_CATEGORIES.some((c) => !d.ratings[c.key])) e.push("Rate all five categories.");
    if (!d.attendeeRole) e.push("Tell us who attended.");
    if (d.title.trim().length < 4) e.push("Add a short headline.");
    if (d.body.trim().length < 40) e.push("Write at least 40 characters about your experience.");
    if (!signedIn && d.guestName.trim().length < 2) e.push("Add your name (shown as first name and last initial).");
    if (!signedIn && guestEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) e.push("Enter a valid email or leave it blank.");
    if (!d.confirmAdult) e.push("Reviewers must be 18 or older.");
    if (!d.confirmFirsthand) e.push("Confirm this is your own first-hand experience.");
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = localErrors();
    setErrors(e);
    if (e.length) return;
    setStatus("sending");
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        campId: camp.id,
        attendeeRole: d.attendeeRole,
        attendedYear: d.attendedYear ? Number(d.attendedYear) : undefined,
        ratings: d.ratings,
        title: d.title,
        body: d.body,
        wouldRecommend: d.wouldRecommend ? d.wouldRecommend === "yes" : undefined,
        confirmAdult: d.confirmAdult,
        confirmFirsthand: d.confirmFirsthand,
        website: honeypot.current?.value ?? "",
        elapsedMs: Date.now() - started.current,
        ...(signedIn ? {} : { guestName: d.guestName.trim(), guestEmail: guestEmail.trim() || undefined }),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setStatus("idle"); setErrors(json.errors ?? [json.error ?? "Something went wrong. Your draft is saved."]); return; }
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    setReviewId(json.id);
    setPostedAsGuest(Boolean(json.guest));
    setStatus(json.status === "published" ? "published" : "pending");
  }

  async function uploadProof(file: File) {
    if (!reviewId) return;
    setProofState("uploading");
    const fd = new FormData();
    fd.set("reviewId", reviewId);
    fd.set("file", file);
    const res = await fetch("/api/reviews/proof", { method: "POST", body: fd });
    setProofState(res.ok ? "done" : "error");
  }

  if (status === "published" || status === "pending") {
    return (
      <div className="card p-6">
        <p className="text-lg font-semibold">Thank you — your review {status === "published" ? "is live" : "was received"}.</p>
        <p className="mt-1 text-sm muted">{status === "published" ? "It now appears on the camp page." : "It will appear after a quick moderation check."}</p>
        {postedAsGuest ? (
          <p className="mt-4 border-t border-navy-50 pt-4 text-sm muted">Posted as a guest. Want a &ldquo;Verified attendance&rdquo; badge on future reviews? <a className="link" href={`/login?mode=signup&next=${encodeURIComponent(`/camps/${camp.slug}`)}`}>Create a free account</a>.</p>
        ) : (
        <div className="mt-5 border-t border-navy-50 pt-4">
          <p className="font-semibold">Optional: verify your attendance</p>
          <p className="mt-1 text-sm muted">Upload a registration confirmation or receipt (JPG, PNG, WebP or PDF, up to 5 MB). Only CampGrade moderators can see it; your review gets a &ldquo;Verified attendance&rdquo; badge once confirmed. Feel free to cover payment details.</p>
          {proofState === "done" ? <p className="mt-2 text-sm text-emerald-700">Uploaded — we&apos;ll review it soon.</p> : (
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-3 block text-sm" disabled={proofState === "uploading"}
              onChange={(e) => e.target.files?.[0] && uploadProof(e.target.files[0])} />
          )}
          {proofState === "error" && <p className="mt-2 text-sm text-red-700">Upload failed. You can try again from your account page.</p>}
        </div>
        )}
        <a href={`/camps/${camp.slug}`} className="btn-secondary mt-5">Back to {camp.name}</a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {restored && <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand">We restored the draft you started on this device. Check it over and submit.</p>}
      {!enabled && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Reviews open once the database is connected. You can still try the form.</p>}
      <div className="card space-y-3 p-4">
        <p className="font-semibold">Your ratings</p>
        {RATING_CATEGORIES.map((c) => (
          <StarInput key={c.key} name={c.key} label={c.label} value={d.ratings[c.key]} onChange={(v) => update({ ratings: { ...d.ratings, [c.key]: v } })} />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="role">I am the…</label>
          <select id="role" className="input" value={d.attendeeRole} onChange={(e) => update({ attendeeRole: e.target.value as Draft["attendeeRole"] })}>
            <option value="">Choose one</option>
            <option value="parent">Parent / guardian</option>
            <option value="athlete">Athlete (18+)</option>
            <option value="coach">Coach</option>
            <option value="other">Other attendee</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="year">Year attended (optional)</label>
          <input id="year" className="input" inputMode="numeric" maxLength={4} value={d.attendedYear} onChange={(e) => update({ attendedYear: e.target.value.replace(/\D/g, "") })} placeholder="e.g. 2026" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="title">Headline</label>
        <input id="title" className="input" maxLength={120} value={d.title} onChange={(e) => update({ title: e.target.value })} placeholder="Sum it up in a few words" />
      </div>
      <div>
        <label className="label" htmlFor="body">Your experience</label>
        <textarea id="body" className="input min-h-[160px]" maxLength={5000} value={d.body} onChange={(e) => update({ body: e.target.value })}
          placeholder="Was it worth the cost? Which coaches were there? How organized was it? What should other families know?" />
        <p className="mt-1 text-xs muted">{d.body.trim().length}/40 characters minimum. Please don&apos;t include links, names of minors or contact details.</p>
      </div>
      <fieldset>
        <legend className="label">Would you recommend it?</legend>
        <div className="flex gap-2">
          {[["yes", "Yes"], ["no", "No"]].map(([v, l]) => (
            <label key={v} className={d.wouldRecommend === v ? "chip-on" : "chip-off"}>
              <input type="radio" name="rec" className="sr-only" checked={d.wouldRecommend === v} onChange={() => update({ wouldRecommend: v as "yes" | "no" })} />{l}
            </label>
          ))}
        </div>
      </fieldset>
      {!signedIn && (
        <div className="card space-y-4 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold">About you</p>
            <a className="link text-sm" href={`/login?next=${encodeURIComponent(`/camps/${camp.slug}/review?resume=1`)}`}>Have an account? Sign in</a>
          </div>
          <div>
            <label className="label" htmlFor="guestName">Your name (shown as e.g. &lsquo;Sarah M.&rsquo;)</label>
            <input id="guestName" className="input" required maxLength={60} autoComplete="name" value={d.guestName} onChange={(e) => update({ guestName: e.target.value })} placeholder="Sarah Miller" />
          </div>
          <div>
            <label className="label" htmlFor="guestEmail">Email (optional, never shown — lets us contact you about your review)</label>
            <input id="guestEmail" type="email" className="input" maxLength={254} autoComplete="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="you@example.com" />
          </div>
        </div>
      )}
      <div className="hidden" aria-hidden="true">
        <label>Website <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <div className="space-y-2 text-sm">
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={d.confirmAdult} onChange={(e) => update({ confirmAdult: e.target.checked })} /> I am 18 or older.</label>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={d.confirmFirsthand} onChange={(e) => update({ confirmFirsthand: e.target.checked })} /> This review describes my own (or my athlete&apos;s) first-hand experience, and I have no business relationship with the organizer.</label>
      </div>
      {errors.length > 0 && (
        <ul className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{errors.map((e) => <li key={e}>• {e}</li>)}</ul>
      )}
      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={status === "sending"}>
        {status === "sending" ? "Submitting…" : "Submit review"}
      </button>
      {!signedIn && <p className="text-xs muted">No account needed. Your draft stays saved on this device until you submit.</p>}
    </form>
  );
}

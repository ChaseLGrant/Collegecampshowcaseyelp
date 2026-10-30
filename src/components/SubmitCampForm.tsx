"use client";
import { useRef, useState } from "react";
import { SPORTS } from "@/lib/sports";
import { TURNSTILE_SITE_KEY, TurnstileWidget } from "@/components/TurnstileWidget";

export function SubmitCampForm() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState<{ slug: string | null; published: boolean; existing: boolean }>({ slug: null, published: false, existing: false });
  const started = useRef(Date.now());
  // Optional Cloudflare Turnstile (off unless the site key is configured).
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (TURNSTILE_SITE_KEY && !turnstileToken) { setState("error"); setMsg("Complete the \u201cverify you\u2019re human\u201d check."); return; }
    setState("sending");
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await fetch("/api/camps/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...data, elapsedMs: Date.now() - started.current, ...(TURNSTILE_SITE_KEY ? { turnstileToken } : {}) }) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) { setResult({ slug: json.slug ?? null, published: Boolean(json.published), existing: Boolean(json.existing) }); setState("done"); } else { setState("error"); setMsg(json.error ?? "Couldn't submit."); if (TURNSTILE_SITE_KEY) setTurnstileReset((n) => n + 1); }
  }
  if (state === "done") {
    return (
      <div className="card p-6">
        {result.published ? (
          <>
            <p className="text-lg font-semibold">Thanks — it&apos;s live on CampGrade.</p>
            <p className="mt-1 text-sm muted">Families can find it now and leave reviews.</p>
          </>
        ) : result.existing ? (
          <>
            <p className="text-lg font-semibold">Good news — this event is already on CampGrade.</p>
            <p className="mt-1 text-sm muted">Thanks for the details; we&apos;ll use them to keep the listing current.</p>
          </>
        ) : (
          <p className="text-lg font-semibold">Thanks — we&apos;ve got it.</p>
        )}
        {result.slug && <a href={`/camps/${result.slug}`} className="btn-primary mt-4">View the camp page</a>}
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div><label className="label" htmlFor="s-name">Event name</label><input id="s-name" name="name" required maxLength={200} className="input" /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="s-sport">Sport</label><select id="s-sport" name="sport" required className="input">{SPORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label className="label" htmlFor="s-date">Start date (if known)</label><input id="s-date" name="startDate" type="date" className="input" /></div>
      </div>
      <div><label className="label" htmlFor="s-url">Official event or registration link</label><input id="s-url" name="sourceUrl" type="url" required placeholder="https://" className="input" /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="s-host">College or organizer</label><input id="s-host" name="organizer" maxLength={160} className="input" /></div>
        <div><label className="label" htmlFor="s-loc">City, state</label><input id="s-loc" name="location" maxLength={120} className="input" placeholder="Austin, TX" /></div>
      </div>
      <div><label className="label" htmlFor="s-price">Price (if listed)</label><input id="s-price" name="price" maxLength={60} className="input" placeholder="$195" /></div>
      <div className="hidden" aria-hidden="true"><input name="website" tabIndex={-1} autoComplete="off" /></div>
      <TurnstileWidget onToken={setTurnstileToken} resetKey={turnstileReset} />
      {state === "error" && <p className="text-sm text-red-700">{msg}</p>}
      <button className="btn-primary" disabled={state === "sending"}>{state === "sending" ? "Adding…" : "Add camp"}</button>
    </form>
  );
}

"use client";
import { useRef, useState } from "react";
import { SPORTS } from "@/lib/sports";

export function SubmitCampForm() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const started = useRef(Date.now());
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await fetch("/api/camps/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...data, elapsedMs: Date.now() - started.current }) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setState("done"); else { setState("error"); setMsg(json.error ?? "Couldn't submit."); }
  }
  if (state === "done") return <div className="card p-6"><p className="font-semibold">Thanks! We&apos;ll verify it and add it to CampGrade.</p></div>;
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
      {state === "error" && <p className="text-sm text-red-700">{msg}</p>}
      <button className="btn-primary" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Submit for review"}</button>
    </form>
  );
}

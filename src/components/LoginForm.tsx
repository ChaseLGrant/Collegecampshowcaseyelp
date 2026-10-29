"use client";
import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function LoginForm({ next, reason }: { next: string; reason?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  const supabase = getBrowserSupabase();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) { setState("error"); setMsg("Sign-in isn't configured yet."); return; }
    setState("sending");
    const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
    if (error) { setState("error"); setMsg(error.message); } else setState("sent");
  }

  async function google() {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
  }

  if (state === "sent") {
    return (
      <div className="card p-6">
        <p className="font-semibold">Check your email</p>
        <p className="mt-1 text-sm muted">We sent a sign-in link to {email}. Open it on this device{reason === "review" ? " and your saved review will be waiting" : ""}.</p>
      </div>
    );
  }
  return (
    <div className="card space-y-4 p-6">
      {reason === "review" && <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand">Your review is saved. Sign in with your email to submit it — no password needed.</p>}
      <form onSubmit={send} className="space-y-3">
        <label className="label" htmlFor="email">Email</label>
        <input id="email" type="email" required autoComplete="email" inputMode="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <button className="btn-primary w-full" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Email me a sign-in link"}</button>
      </form>
      <div className="flex items-center gap-3 text-xs muted"><span className="h-px flex-1 bg-navy-100" />or<span className="h-px flex-1 bg-navy-100" /></div>
      <button type="button" onClick={google} className="btn-secondary w-full">Continue with Google</button>
      {state === "error" && <p className="text-sm text-red-700">{msg}</p>}
      <p className="text-xs muted">Signing in is only needed to write reviews, save lists or subscribe. Browsing is always free.</p>
    </div>
  );
}

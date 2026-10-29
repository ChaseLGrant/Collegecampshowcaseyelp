"use client";
import { useActionState, useState } from "react";
import { signInWithGoogle, signInWithPassword, signUpWithPassword, type AuthFormState } from "@/lib/actions/auth";

export function LoginForm({ next, reason, googleEnabled, enabled, initialMode = "signin", error }: {
  next: string; reason?: string; googleEnabled: boolean; enabled: boolean; initialMode?: "signin" | "signup"; error?: string;
}) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [signInState, signInAction, signingIn] = useActionState<AuthFormState, FormData>(signInWithPassword, undefined);
  const [signUpState, signUpAction, signingUp] = useActionState<AuthFormState, FormData>(signUpWithPassword, undefined);
  const state = mode === "signin" ? signInState : signUpState;
  const pending = signingIn || signingUp;

  return (
    <div className="card space-y-4 p-6">
      {reason === "review" && <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand">Your review is saved on this device. Sign in or create a free account to submit it.</p>}
      {error === "unverified" && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Your Google email isn&apos;t verified. Sign in with email and password instead.</p>}
      {!enabled && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Sign-in isn&apos;t configured yet.</p>}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-navy-50 p-1 text-sm" role="tablist">
        {(["signin", "signup"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1.5 font-medium ${mode === m ? "bg-white shadow-sm" : "muted"}`}>
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <form action={mode === "signin" ? signInAction : signUpAction} className="space-y-3" key={mode}>
        <input type="hidden" name="next" value={next} />
        {mode === "signup" && (
          <div>
            <label className="label" htmlFor="name">Name (optional)</label>
            <input id="name" name="name" autoComplete="name" maxLength={100} className="input" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" className="input" placeholder="you@example.com" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required minLength={mode === "signup" ? 8 : 1} maxLength={128}
            autoComplete={mode === "signup" ? "new-password" : "current-password"} className="input" />
          {mode === "signup" && <p className="mt-1 text-xs muted">At least 8 characters.</p>}
        </div>
        <button className="btn-primary w-full" disabled={pending || !enabled}>
          {pending ? "One moment…" : mode === "signin" ? "Sign in" : "Create free account"}
        </button>
      </form>
      {state?.error && <p className="text-sm text-red-700" role="alert">{state.error}</p>}
      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs muted"><span className="h-px flex-1 bg-navy-100" />or<span className="h-px flex-1 bg-navy-100" /></div>
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={next} />
            <button className="btn-secondary w-full">Continue with Google</button>
          </form>
        </>
      )}
      <p className="text-xs muted">Signing in is only needed to write reviews, save lists or subscribe. Browsing is always free.</p>
    </div>
  );
}

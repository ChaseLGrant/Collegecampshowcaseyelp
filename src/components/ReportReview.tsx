"use client";
import { useState } from "react";

export function ReportReview({ reviewId }: { reviewId: string }) {
  const [state, setState] = useState<"idle" | "open" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function send(reason: string) {
    const res = await fetch("/api/reviews/report", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reviewId, reason }),
    });
    if (res.ok) setState("sent");
    else {
      const body = await res.json().catch(() => ({}));
      setState("error");
      setMsg(res.status === 401 ? "Sign in to report a review." : res.status === 403 && body?.error ? body.error : "Couldn't send report.");
    }
  }
  if (state === "sent") return <span className="text-xs muted">Reported — thank you.</span>;
  if (state === "error") return <span className="text-xs text-red-700">{msg}</span>;
  if (state === "open") {
    return (
      <span className="flex flex-wrap gap-1 text-xs">
        {[["fake", "Looks fake"], ["spam", "Spam"], ["offensive", "Offensive"], ["conflict_of_interest", "Conflict of interest"]].map(([k, l]) => (
          <button key={k} type="button" className="rounded border border-navy-100 px-2 py-0.5 hover:bg-navy-50" onClick={() => send(k)}>{l}</button>
        ))}
      </span>
    );
  }
  return <button type="button" className="text-xs muted hover:text-navy" onClick={() => setState("open")}>Report</button>;
}

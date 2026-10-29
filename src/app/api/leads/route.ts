import { getSql } from "@/lib/db";
import { leadInputSchema } from "@/lib/leads";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { getSessionUser } from "@/lib/server/auth";
import { json, sameOrigin } from "@/lib/server/http";

/** Lead capture (camp alerts / checklist, and "talk to a former college coach"). Deduped on email + sport. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  if (!rateLimit(`lead:${clientIp(req.headers)}`, 10, 3600_000).ok) return json({ error: "Too many submissions. Try again later." }, 429);
  const parsed = leadInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Please check the form." }, 400);
  const d = parsed.data;
  if (d.website || (d.elapsedMs != null && d.elapsedMs < 1500)) return json({ ok: true }); // silently drop bots
  const sql = getSql();
  if (!sql) return json({ error: "Sign-ups open once the database is connected." }, 503);
  const user = await getSessionUser().catch(() => null);

  await sql`
    insert into leads (name, email, phone, role, grad_year, sport, interest, source_page, camp_slug, consent, consent_at, user_id)
    values (${d.name}, ${d.email}, ${d.phone}, ${d.role}, ${d.gradYear}, ${d.sport}, ${d.interest}, ${d.sourcePage}, ${d.campSlug},
            true, now(), ${user?.id ?? null})
    on conflict ((lower(email)), sport) do update set
      name = coalesce(excluded.name, leads.name),
      phone = coalesce(excluded.phone, leads.phone),
      role = excluded.role,
      grad_year = coalesce(excluded.grad_year, leads.grad_year),
      -- A coach-call request is the stronger signal; never downgrade it to alerts.
      interest = case when leads.interest = 'coach_call' then 'coach_call' else excluded.interest end,
      source_page = excluded.source_page,
      camp_slug = coalesce(excluded.camp_slug, leads.camp_slug),
      consent = true, consent_at = now(),
      user_id = coalesce(leads.user_id, excluded.user_id),
      submission_count = leads.submission_count + 1,
      updated_at = now()`;
  return json({ ok: true }, 201);
}

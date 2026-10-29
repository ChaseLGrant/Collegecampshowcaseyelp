-- CampGrade core schema (plain PostgreSQL; ported from Supabase).
-- Directory, provenance, ingestion, community reviews, external reviews,
-- research summaries, plans, subscriptions and entitlements.
--
-- Authorization is enforced in server code (src/lib/server/auth.ts: requireUser /
-- requireStaff, plus owner checks in every write). The database keeps one hard
-- guarantee of its own: community review CONTENT can only be written inside a
-- transaction that has set app.user_id to the review's author (see
-- reviews_content_guard), so ingestion/admin code can never fabricate or alter it.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Users (app-owned; replaces the Supabase auth schema) and roles
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_verified_at timestamptz,
  password_hash text,                    -- bcrypt; null for Google-only accounts
  name text check (char_length(name) <= 100),
  image text,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);
create unique index users_email_lower_idx on public.users (lower(email));

-- Linked OAuth identities (Google). One row per provider account.
create table public.user_accounts (
  provider text not null,
  provider_account_id text not null,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (provider, provider_account_id)
);
create index user_accounts_user_idx on public.user_accounts (user_id);

create table public.profiles (
  id uuid primary key references public.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  -- Roles are set by SQL only, e.g.:
  --   update profiles set role = 'admin' where id = (select id from users where lower(email) = lower('you@example.com'));
  role text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  age_confirmed_at timestamptz,          -- reviewer confirmed 18+
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_user_created
  after insert on public.users for each row execute function public.handle_new_user();

-- The acting user for the current transaction (the app sets it with set_config('app.user_id', <id>, true)).
create or replace function public.app_user_id()
returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

-- ---------------------------------------------------------------------------
-- Directory: institutions, organizers, camps
-- ---------------------------------------------------------------------------
create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  city text,
  state char(2),
  association text check (association in ('NCAA', 'NAIA', 'NJCAA', 'CCCAA', 'USCAA', 'NWAC', 'Other')),
  division text check (division in ('D1', 'D2', 'D3', 'DI', 'DII', 'DIII')),
  classification_verified boolean not null default false,
  classification_source_url text,
  website text,
  created_at timestamptz not null default now()
);

create table public.organizers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  kind text not null default 'other' check (kind in ('college', 'showcase_company', 'club', 'other')),
  website text,
  created_at timestamptz not null default now()
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in (
    'college_site', 'camp_calendar', 'organizer_site', 'showcase_site',
    'licensed_provider', 'feed', 'api', 'manual', 'csv', 'review_platform', 'editorial')),
  adapter text not null check (adapter in ('schema_org', 'ical', 'json_feed', 'csv', 'manual')),
  base_url text,
  config jsonb not null default '{}'::jsonb,
  -- Content rights: what CampGrade may do with data from this source.
  content_rights text not null default 'unknown' check (content_rights in (
    'facts_only', 'licensed_display', 'licensed_excerpt', 'link_only', 'prohibited', 'unknown')),
  terms_reviewed_at timestamptz,
  terms_notes text,
  license_reference text,
  respects_robots boolean not null default true,
  rate_limit_per_minute int not null default 6 check (rate_limit_per_minute between 1 and 60),
  refresh_interval_hours int not null default 168 check (refresh_interval_hours >= 1),
  enabled boolean not null default false,
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_status text,
  consecutive_failures int not null default 0,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now()
);

create table public.camps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sport text not null check (sport in (
    'baseball', 'softball', 'football', 'basketball', 'soccer', 'volleyball', 'lacrosse', 'other')),
  sport_detail text,                         -- e.g. "women's soccer"
  event_type text not null default 'other' check (event_type in (
    'prospect_camp', 'id_camp', 'showcase', 'clinic', 'combine', 'elite_camp', 'tournament', 'other')),
  institution_id uuid references public.institutions (id),
  organizer_id uuid references public.organizers (id),
  venue text,
  city text,
  state char(2),
  start_date date,
  end_date date,
  price_cents int check (price_cents is null or price_cents >= 0),
  price_notes text,
  registration_url text,
  description text,                          -- original factual summary, never copied marketing copy
  eligibility text,                          -- grad years / ages as advertised
  positions text[] not null default '{}',
  status text not null default 'published' check (status in ('draft', 'published', 'archived', 'cancelled')),
  verification_status text not null default 'unverified' check (verification_status in ('verified', 'unverified', 'stale')),
  last_verified_at timestamptz,
  primary_source_id uuid references public.sources (id),
  source_url text,
  search_text text not null default '',
  search tsvector generated always as (to_tsvector('english', coalesce(search_text, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index camps_sport_idx on public.camps (sport, status, start_date);
create index camps_state_idx on public.camps (state);
create index camps_search_idx on public.camps using gin (search);
create index camps_name_trgm_idx on public.camps using gin (name gin_trgm_ops);

-- Keep search_text in sync with institution and organizer names.
create or replace function public.camps_build_search_text()
returns trigger language plpgsql as $$
declare inst text; org text;
begin
  select name into inst from public.institutions where id = new.institution_id;
  select name into org from public.organizers where id = new.organizer_id;
  new.search_text := concat_ws(' ', new.name, inst, org, new.city, new.state, new.sport, new.event_type, new.venue);
  new.updated_at := now();
  return new;
end $$;
create trigger camps_search_text before insert or update on public.camps
  for each row execute function public.camps_build_search_text();

create table public.camp_participating_colleges (
  camp_id uuid not null references public.camps (id) on delete cascade,
  institution_id uuid not null references public.institutions (id),
  verified boolean not null default false,
  source_url text,
  primary key (camp_id, institution_id)
);

create table public.camp_coaches (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.camps (id) on delete cascade,
  coach_name text not null,
  title text,
  institution_id uuid references public.institutions (id),
  verified boolean not null default false,
  source_url text
);

-- Field-level provenance: where each fact came from and when we saw it.
create table public.camp_field_provenance (
  id bigserial primary key,
  camp_id uuid not null references public.camps (id) on delete cascade,
  field text not null,
  value jsonb,
  source_id uuid references public.sources (id),
  source_url text,
  observed_at timestamptz not null default now()
);
create index camp_field_provenance_camp_idx on public.camp_field_provenance (camp_id, field);

-- ---------------------------------------------------------------------------
-- Ingestion
-- ---------------------------------------------------------------------------
create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sources (id) on delete set null,
  triggered_by text not null check (triggered_by in ('schedule', 'admin', 'csv', 'submission')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed', 'blocked')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_found int not null default 0,
  items_queued int not null default 0,
  items_skipped int not null default 0,
  error text,
  log jsonb not null default '[]'::jsonb
);
create index ingestion_runs_source_idx on public.ingestion_runs (source_id, started_at desc);

create table public.discovery_queue (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'camp' check (kind in ('camp', 'camp_update')),
  source_id uuid references public.sources (id) on delete set null,
  run_id uuid references public.ingestion_runs (id) on delete set null,
  submitted_by uuid references public.users (id),
  candidate jsonb not null,                 -- normalized candidate (see src/lib/ingestion/types.ts)
  source_url text,
  fingerprint text not null,
  sport_confidence numeric(3, 2),
  matched_camp_id uuid references public.camps (id) on delete set null,
  duplicate_score numeric(3, 2),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'duplicate')),
  reviewer_id uuid references public.users (id),
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create index discovery_queue_status_idx on public.discovery_queue (status, created_at desc);
create unique index discovery_queue_pending_fingerprint on public.discovery_queue (fingerprint) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Community reviews (authentic, first-hand)
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.camps (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  attendee_role text not null check (attendee_role in ('parent', 'athlete', 'coach', 'other')),
  attended_year int check (attended_year between 2000 and 2100),
  rating_value smallint not null check (rating_value between 1 and 5),
  rating_instruction smallint not null check (rating_instruction between 1 and 5),
  rating_exposure smallint not null check (rating_exposure between 1 and 5),
  rating_organization smallint not null check (rating_organization between 1 and 5),
  rating_overall smallint not null check (rating_overall between 1 and 5),
  title text not null check (char_length(title) between 4 and 120),
  body text not null check (char_length(body) between 40 and 5000),
  would_recommend boolean,
  verification text not null default 'unverified' check (verification in ('unverified', 'pending', 'verified', 'rejected')),
  verification_file_path text,
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected', 'removed')),
  spam_score numeric(4, 2) not null default 0,
  body_fingerprint text not null,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (camp_id, user_id)
);
create index reviews_camp_idx on public.reviews (camp_id, status, created_at desc);
create index reviews_fingerprint_idx on public.reviews (body_fingerprint);

-- Guard: review CONTENT can only be written by its author. Moderators (and the
-- service role) may change moderation fields only. This guarantees automated
-- ingestion can never overwrite or fabricate community review content.
create or replace function public.reviews_content_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if public.app_user_id() is null or public.app_user_id() <> new.user_id then
      raise exception 'Community reviews can only be created by their author';
    end if;
    return new;
  end if;
  if (new.title, new.body, new.rating_value, new.rating_instruction, new.rating_exposure,
      new.rating_organization, new.rating_overall, new.camp_id, new.user_id, new.attendee_role,
      new.attended_year, new.would_recommend)
     is distinct from
     (old.title, old.body, old.rating_value, old.rating_instruction, old.rating_exposure,
      old.rating_organization, old.rating_overall, old.camp_id, old.user_id, old.attendee_role,
      old.attended_year, old.would_recommend)
  then
    if public.app_user_id() is null or public.app_user_id() <> old.user_id then
      raise exception 'Review content can only be edited by its author';
    end if;
    new.status := 'pending';  -- edits go back through moderation
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger reviews_content_guard before insert or update on public.reviews
  for each row execute function public.reviews_content_guard();

create table public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  reporter_id uuid not null references public.users (id) on delete cascade,
  reason text not null check (reason in ('spam', 'fake', 'offensive', 'conflict_of_interest', 'other')),
  details text check (char_length(details) <= 1000),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (review_id, reporter_id)
);

-- Native rating aggregates (published community reviews only).
create view public.camp_rating_stats as
select
  camp_id,
  count(*)::int as review_count,
  round(avg(rating_overall)::numeric, 2) as avg_overall,
  round(avg(rating_value)::numeric, 2) as avg_value,
  round(avg(rating_instruction)::numeric, 2) as avg_instruction,
  round(avg(rating_exposure)::numeric, 2) as avg_exposure,
  round(avg(rating_organization)::numeric, 2) as avg_organization,
  count(*) filter (where verification = 'verified')::int as verified_count
from public.reviews
where status = 'published'
group by camp_id;

-- ---------------------------------------------------------------------------
-- External review sources (third-party; never merged into native ratings)
-- ---------------------------------------------------------------------------
create table public.external_reviews (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sources (id) on delete set null,
  platform_name text not null,
  source_url text not null,
  provenance_type text not null check (provenance_type in (
    'licensed_dataset', 'authorized_api', 'public_page', 'organizer_testimonial', 'editorial')),
  camp_id uuid references public.camps (id) on delete cascade,
  organizer_id uuid references public.organizers (id) on delete cascade,
  referenced_name text not null,            -- the camp/organizer name as the source wrote it
  sport text,
  review_date date,
  rating numeric(4, 2),
  rating_scale numeric(4, 2),
  rating_display_permitted boolean not null default false,
  excerpt text check (char_length(excerpt) <= 600),
  excerpt_permitted boolean not null default false,
  reviewer_display text,
  reviewer_display_permitted boolean not null default false,
  attribution text not null,
  rights_status text not null default 'pending_review' check (rights_status in (
    'licensed', 'permitted', 'link_only', 'pending_review', 'prohibited')),
  match_confidence numeric(3, 2) not null default 0 check (match_confidence between 0 and 1),
  match_method text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  imported_at timestamptz not null default now(),
  reviewed_by uuid references public.users (id),
  reviewed_at timestamptz,
  check (camp_id is not null or organizer_id is not null)
);
create index external_reviews_camp_idx on public.external_reviews (camp_id, status);

-- Public-safe projection: non-permitted fields are nulled in the database itself.
-- Public pages read ONLY this view, never the raw table.
create view public.external_reviews_public as
select
  id, camp_id, organizer_id, platform_name, source_url, provenance_type, referenced_name, sport,
  review_date, attribution, rights_status, match_confidence,
  case when rating_display_permitted and rights_status in ('licensed', 'permitted') then rating end as rating,
  case when rating_display_permitted and rights_status in ('licensed', 'permitted') then rating_scale end as rating_scale,
  case when excerpt_permitted and rights_status in ('licensed', 'permitted') then excerpt end as excerpt,
  case when reviewer_display_permitted and rights_status in ('licensed', 'permitted') then reviewer_display end as reviewer_display
from public.external_reviews
where status = 'approved' and rights_status in ('licensed', 'permitted', 'link_only');

-- ---------------------------------------------------------------------------
-- Research summaries (AI-assisted synthesis; never presented as reviews)
-- ---------------------------------------------------------------------------
create table public.research_summaries (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.camps (id) on delete cascade,
  summary text not null,
  considerations jsonb not null default '[]'::jsonb,
  facts jsonb not null default '[]'::jsonb,  -- cited facts with source URLs
  method text not null check (method in ('template', 'ai_assisted')),
  model text,
  access_tier text not null default 'insider' check (access_tier in ('free', 'insider', 'elite')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  generated_at timestamptz not null default now(),
  reviewed_by uuid references public.users (id),
  reviewed_at timestamptz,
  review_notes text
);
create index research_summaries_camp_idx on public.research_summaries (camp_id, status, generated_at desc);

-- ---------------------------------------------------------------------------
-- Plans, billing, entitlements
-- ---------------------------------------------------------------------------
create table public.plans (
  id text primary key,                      -- 'free' | 'insider' | 'elite' (admin can add more)
  tier text not null check (tier in ('free', 'insider', 'elite')),
  name text not null,
  tagline text,
  price_cents int not null default 0 check (price_cents >= 0),
  currency text not null default 'usd',
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  stripe_price_id text unique,
  athlete_market_product_key text unique,
  features text[] not null default '{}',
  highlights text[] not null default '{}',
  active boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.billing_customers (
  user_id uuid primary key references public.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  plan_id text not null references public.plans (id),
  provider text not null check (provider in ('stripe', 'athlete_market', 'admin')),
  external_id text not null,                -- stripe subscription id / TAM subscription ref / admin grant id
  status text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  plan_id text not null references public.plans (id),
  source text not null check (source in ('stripe', 'athlete_market', 'admin')),
  source_ref text not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (source, source_ref)
);
create index entitlements_user_idx on public.entitlements (user_id);

create table public.athlete_market_links (
  user_id uuid primary key references public.users (id) on delete cascade,
  athlete_market_account_id text not null unique,
  linked_at timestamptz not null default now(),
  last_synced_at timestamptz,
  status text not null default 'active' check (status in ('active', 'revoked'))
);

create table public.oauth_states (
  state text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  provider text not null,
  code_verifier text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

create or replace function public.current_tier(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.tier from public.entitlements e join public.plans p on p.id = e.plan_id
    where e.user_id = uid and e.revoked_at is null and e.starts_at <= now()
      and (e.expires_at is null or e.expires_at > now())
    order by case p.tier when 'elite' then 3 when 'insider' then 2 else 1 end desc
    limit 1), 'free');
$$;

-- ---------------------------------------------------------------------------
-- Premium user data
-- ---------------------------------------------------------------------------
create table public.saved_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.saved_list_items (
  list_id uuid not null references public.saved_lists (id) on delete cascade,
  camp_id uuid not null references public.camps (id) on delete cascade,
  note text check (char_length(note) <= 500),
  added_at timestamptz not null default now(),
  primary key (list_id, camp_id)
);

create table public.match_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  sport text not null,
  position text,
  grad_year int,
  home_state char(2),
  preferred_levels text[] not null default '{}',
  gpa numeric(3, 2),
  max_travel_miles int,
  budget_cents int,
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigserial primary key,
  actor_id uuid references public.users (id),
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Directory view used by search
-- ---------------------------------------------------------------------------
create view public.camp_directory as
select
  c.id, c.slug, c.name, c.sport, c.sport_detail, c.event_type, c.city, c.state, c.venue,
  c.start_date, c.end_date, c.price_cents, c.price_notes, c.registration_url, c.description,
  c.eligibility, c.positions, c.status, c.verification_status, c.last_verified_at, c.source_url,
  c.search, c.institution_id, c.organizer_id,
  i.name as institution_name, i.slug as institution_slug, i.association, i.division,
  i.classification_verified,
  o.name as organizer_name,
  coalesce(s.review_count, 0) as review_count,
  s.avg_overall, s.avg_value, s.avg_instruction, s.avg_exposure, s.avg_organization,
  coalesce(s.verified_count, 0) as verified_review_count,
  -- Bayesian-adjusted score for sorting (prior mean 3.0, weight 5). Unreviewed = -1.
  case when coalesce(s.review_count, 0) = 0 then -1
       else round(((5 * 3.0) + s.review_count * s.avg_overall) / (5 + s.review_count), 4) end as ranking_score
from public.camps c
left join public.institutions i on i.id = c.institution_id
left join public.organizers o on o.id = c.organizer_id
left join public.camp_rating_stats s on s.camp_id = c.id;

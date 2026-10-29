-- Lead capture (camp alerts, checklist, "talk to a former college coach").
-- One row per email + sport; repeat submissions update the existing row.
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text check (char_length(name) <= 100),
  email text not null check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 30),
  role text not null check (role in ('parent', 'athlete', 'coach')),
  grad_year int check (grad_year between 2020 and 2045),
  sport text not null check (sport in (
    'baseball', 'softball', 'football', 'basketball', 'soccer', 'volleyball', 'lacrosse', 'other')),
  interest text not null default 'camp_alerts' check (interest in ('camp_alerts', 'coach_call')),
  source_page text check (char_length(source_page) <= 300),
  camp_slug text check (char_length(camp_slug) <= 200),
  consent boolean not null default false,
  consent_at timestamptz,
  user_id uuid references public.users (id) on delete set null,
  submission_count int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index leads_email_sport_idx on public.leads (lower(email), sport);
create index leads_created_idx on public.leads (created_at desc);

-- Guest reviews: parents can post a review without creating an account.
-- Additive only. A guest post creates a users row with is_guest = true (synthetic,
-- unroutable email, no password, no linked OAuth identity) so reviews.user_id and the
-- reviews_content_guard trigger keep working unchanged. Guest rows can never sign in
-- (the app rejects them in every auth path) and can never hold a staff role.

alter table public.users
  add column if not exists is_guest boolean not null default false;

alter table public.reviews
  add column if not exists guest_name text
    check (guest_name is null or char_length(guest_name) between 2 and 60),
  add column if not exists guest_email text
    check (guest_email is null or char_length(guest_email) <= 254);   -- private: never displayed

-- Per-IP guest checks (one guest review per camp per IP, daily caps).
create index if not exists reviews_ip_camp_idx on public.reviews (ip_hash, camp_id) where ip_hash is not null;

-- Guests can never be moderators or admins, even by a mistaken SQL update.
create or replace function public.profiles_guest_role_guard()
returns trigger language plpgsql as $$
begin
  if new.role <> 'user' and exists (select 1 from public.users where id = new.id and is_guest) then
    raise exception 'Guest users cannot hold a staff role';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guest_role_guard on public.profiles;
create trigger profiles_guest_role_guard before insert or update of role on public.profiles
  for each row execute function public.profiles_guest_role_guard();

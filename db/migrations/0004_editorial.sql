-- Editorial rating: CampGrade's own staff rating of a camp (college exposure, coaching,
-- value, reputation). Stored on camps and exposed separately from parent reviews.
-- It is NEVER blended into camp_rating_stats, review_count or ranking_score.
alter table public.camps
  add column if not exists editorial_score numeric(2, 1)
    check (editorial_score is null or editorial_score between 1 and 5),
  add column if not exists editorial_pick boolean not null default false,
  add column if not exists editorial_rationale text
    check (editorial_rationale is null or char_length(editorial_rationale) <= 2000);

create index if not exists camps_editorial_idx
  on public.camps (editorial_pick desc, editorial_score desc nulls last);

-- Directory view: same columns as before (order preserved), editorial fields appended.
create or replace view public.camp_directory as
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
  -- Parent reviews only: editorial_score is deliberately not part of this.
  case when coalesce(s.review_count, 0) = 0 then -1
       else round(((5 * 3.0) + s.review_count * s.avg_overall) / (5 + s.review_count), 4) end as ranking_score,
  c.editorial_score, c.editorial_pick, c.editorial_rationale
from public.camps c
left join public.institutions i on i.id = c.institution_id
left join public.organizers o on o.id = c.organizer_id
left join public.camp_rating_stats s on s.camp_id = c.id;

-- External reviews: optional sentiment label for our paraphrased summaries
-- (metadata, safe to show for link_only rows).
alter table public.external_reviews
  add column if not exists sentiment text
    check (sentiment is null or sentiment in ('positive', 'mixed', 'negative', 'neutral'));

create or replace view public.external_reviews_public as
select
  id, camp_id, organizer_id, platform_name, source_url, provenance_type, referenced_name, sport,
  review_date, attribution, rights_status, match_confidence,
  case when rating_display_permitted and rights_status in ('licensed', 'permitted') then rating end as rating,
  case when rating_display_permitted and rights_status in ('licensed', 'permitted') then rating_scale end as rating_scale,
  case when excerpt_permitted and rights_status in ('licensed', 'permitted') then excerpt end as excerpt,
  case when reviewer_display_permitted and rights_status in ('licensed', 'permitted') then reviewer_display end as reviewer_display,
  sentiment
from public.external_reviews
where status = 'approved' and rights_status in ('licensed', 'permitted', 'link_only');

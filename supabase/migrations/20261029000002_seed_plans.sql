-- Initial plans. Prices are editable from /admin/plans; these are starting values only.
-- stripe_price_id must be set by an admin after creating Prices in Stripe.
insert into public.plans (id, tier, name, tagline, price_cents, billing_interval, athlete_market_product_key, features, highlights, sort_order)
values
  ('free', 'free', 'Free Community Access', 'Search, read and write reviews — always free.', 0, 'month', null,
    array['search', 'basic_listings', 'community_reviews', 'basic_ratings', 'review_submission', 'compare_basic'],
    array['Camp search across every sport', 'Basic event listings', 'Community reviews and ratings', 'Write reviews'], 0),
  ('insider', 'insider', 'Recruiting Insider', 'Premium camp research and comparison tools.', 1999, 'month', 'recruiting_insider',
    array['search', 'basic_listings', 'community_reviews', 'basic_ratings', 'review_submission', 'compare_basic',
          'premium_research', 'advanced_compare', 'saved_lists', 'recruiting_intel'],
    array['Everything in Free', 'Premium camp research summaries', 'Advanced side-by-side comparison', 'Saved camp lists', 'Included with The Athlete Market Recruiting Insider'], 1),
  ('elite', 'elite', 'Insider Elite', 'Personalized matching and advanced recruiting intelligence.', 9900, 'month', 'insider_elite',
    array['search', 'basic_listings', 'community_reviews', 'basic_ratings', 'review_submission', 'compare_basic',
          'premium_research', 'advanced_compare', 'saved_lists', 'recruiting_intel',
          'camp_matching', 'school_targeting', 'premium_reports', 'notifications'],
    array['Everything in Recruiting Insider', 'Personalized camp matching', 'School-targeting recommendations', 'Premium reports and notifications', 'Included with The Athlete Market Insider Elite'], 2)
on conflict (id) do nothing;

-- Manual submissions source (always present).
insert into public.sources (name, kind, adapter, content_rights, enabled, terms_notes)
select 'Community submissions', 'manual', 'manual', 'facts_only', true,
  'Camp facts submitted by visitors. Every submission is reviewed by an admin before publishing.'
where not exists (select 1 from public.sources where kind = 'manual');

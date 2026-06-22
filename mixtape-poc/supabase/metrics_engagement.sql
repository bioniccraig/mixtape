-- MixTape engagement metrics
-- Run in Supabase SQL Editor. Runs as service role, so it sees ALL rows (bypasses RLS).
-- "Shared" = a tape with status 'published' (has a live share link); drafts are excluded.
-- Returns ONE summary row with all five headline metrics.

with creators as (
  select creator_id,
         count(*)                                          as tapes_total,
         count(*) filter (where status = 'published')      as tapes_published,
         min(created_at)                                    as first_tape_at
  from tapes
  where creator_id is not null
  group by creator_id
),
ordered as (
  select creator_id,
         created_at,
         row_number() over (partition by creator_id order by created_at) as rn
  from tapes
  where creator_id is not null
),
second_tape as (
  select f.creator_id,
         (extract(epoch from (s.created_at - f.created_at)))::numeric as gap_seconds
  from ordered f
  join ordered s
    on s.creator_id = f.creator_id and s.rn = 2
  where f.rn = 1
)
select
  -- ── ACTIVATION FUNNEL (base = ALL signed-up users) ──────────────────────────
  (select count(*) from profiles)                                              as total_signups,
  round(100.0 * (select count(*) from creators)
        / nullif((select count(*) from profiles), 0), 1)                       as pct_activated,        -- signups who made ≥1 tape
  round(100.0 * (select count(*) from second_tape)
        / nullif((select count(*) from profiles), 0), 1)                       as pct_signups_to_second, -- signups who made ≥2 tapes

  -- headline counts
  (select count(*) from creators)                                              as users_with_tapes,
  (select count(*) from tapes where creator_id is not null)                    as total_tapes,
  (select count(*) from tapes where status = 'published' and creator_id is not null) as total_shared_tapes,

  -- 1. Tapes created per user
  round((select avg(tapes_total)     from creators), 2)                        as avg_tapes_per_user,

  -- 2. Tapes shared per user
  round((select avg(tapes_published) from creators), 2)                        as avg_shared_per_user,

  -- 3. % of users who create a second tape
  (select count(*) from second_tape)                                           as users_with_2plus_tapes,
  round(100.0 * (select count(*) from second_tape)
        / nullif((select count(*) from creators), 0), 1)                       as pct_made_second_tape,

  -- 4. Time between first and second tape (hours)
  round((select avg(gap_seconds) from second_tape) / 3600.0, 1)                as avg_hours_to_second_tape,
  round(((select percentile_cont(0.5) within group (order by gap_seconds)
         from second_tape))::numeric / 3600.0, 1)                              as median_hours_to_second_tape,

  -- 5. Comments / reactions per tape
  (select count(*) from comments)                                             as total_comments,
  (select count(*) from reactions)                                            as total_reactions,
  round((select count(*)::numeric from comments)
        / nullif((select count(*) from tapes), 0), 2)                          as avg_comments_per_tape,
  round((select count(*)::numeric from reactions)
        / nullif((select count(*) from tapes), 0), 2)                          as avg_reactions_per_tape;


-- ── SHARE-METHOD BREAKDOWN (added 22 Jun 2026) ────────────────────────────────
-- Which path users take to share a tape. `share_initiated` fires on every share
-- action (builder native/community, player reshare/community, library copy-link).
-- Helps spot tapes shared OUTSIDE the app's buttons (the suspected "stayed a
-- draft" cause): if real sends keep happening but share_initiated stays near 0,
-- people are copying the URL bar instead of using Share. Returns one row per
-- method with all-time and last-7-day counts.
select
  coalesce(metadata->>'method', '(none)')                                      as share_method,
  count(*)                                                                     as shares_all_time,
  count(*) filter (where created_at >= now() - interval '7 days')              as shares_last_7d,
  count(distinct viewer_id) filter (where viewer_id is not null)               as distinct_users_all_time
from events
where event_type = 'share_initiated'
group by 1
order by shares_all_time desc;

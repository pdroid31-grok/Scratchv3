-- JSwanny weekly-submit bank fix. Do not settle. Do not touch credit/box_forgive.
-- Live quote (GET /api/payouts 2026-09-09):
--   305 daily_score $1 stars 0  daily_score:2026-09-09:hoHe7OoFJoMnu7lKA5515n4kVi5NiJ9o  2026-09-09T12:08:56.557Z  (8:08 AM EDT) KEEP — kind is daily
--   1   daily_score $1 stars 0  daily_score:2026-09-08:hxIAsCe4u3Ojx0jq5Zvvm2gsIcVeJw1A
--   263 daily_win   $1 stars 1  daily_win:2026-09-08:hoHe7OoFJoMnu7lKA5515n4kVi5NiJ9o
--   47  daily_win   $1 stars 1  daily_win:2026-09-08:hxIAsCe4u3Ojx0jq5Zvvm2gsIcVeJw1A  (duplicate source after claim)
-- No weekly_score / weekly_win rows exist on the public payout log.
-- Delete any unawarded weekly_* payouts if they appear, subtract that row only.
-- Weekly tables are created at runtime; skip on a fresh local DB.

do $$
begin
  with who as (
    select user_id
      from player_profiles
     where lower(trim(display_name)) = 'jswanny'
        or user_id in ('hoHe7OoFJoMnu7lKA5515n4kVi5NiJ9o', 'hxIAsCe4u3Ojx0jq5Zvvm2gsIcVeJw1A')
  ),
  bad as (
    delete from darkness_payouts p
     using who
     where p.user_id = who.user_id
       and p.kind in ('weekly_score', 'weekly_win')
       and not exists (
         select 1
           from darkness_weekly_weeks w
          where w.awarded is true
            and (
              p.source_key like 'weekly_score:' || w.season::text || '-W' || w.week::text || ':%'
              or p.source_key like 'weekly_win:' || w.season::text || '-W' || w.week::text || ':%'
            )
       )
    returning p.user_id, p.amount, p.stars
  ),
  take as (
    select user_id, coalesce(sum(amount), 0)::int as amount, coalesce(sum(stars), 0)::int as stars
      from bad
     group by user_id
  )
  update player_profiles p
     set coins = greatest(0, p.coins - t.amount),
         daily_stars = greatest(0, coalesce(p.daily_stars, 0) - t.stars),
         career_book = case
           when p.career_book is not null and jsonb_exists(p.career_book, 'bank')
             then jsonb_set(p.career_book, '{bank}', to_jsonb(greatest(0, coalesce((p.career_book->>'bank')::int, 0) - t.amount)))
           else p.career_book
         end,
         updated_at = now()
    from take t
   where p.user_id = t.user_id;
exception
  when undefined_table then
    null;
end $$;

-- Unawarded weekly drafts: no actual 0.0, no pre-pay flags (blocks backfill + earnedChallenge).
do $$
begin
  update darkness_weekly_runs r
     set score = null,
         payout_score = false,
         payout_win = false
   where exists (
     select 1
       from darkness_weekly_weeks w
      where w.season = r.season
        and w.week = r.week
        and coalesce(w.awarded, false) = false
   );
exception
  when undefined_table then
    null;
end $$;

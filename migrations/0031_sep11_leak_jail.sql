-- Heisenberg + Marquis Scott only.
-- Flatten 2026-09-11 daily scores to 100. Keep existing daily_score payouts/coins.
-- Strip club200 only if Sep 11 was their only 200 Club qualifying score.
-- Grant + equip jail. No credit, coins, stars, W-L, or settleProfile.

do $$
declare
  ids constant text[] := array['HaJ3Q1l3AEVrtrPDvrnRG0qCE2OlnHl9', 'FWuvVwD2j9Lnc3tG9OcNJcGwLdrzR1L4'];
  uid text;
  has_other boolean;
  owned_json jsonb;
  next_owned jsonb;
begin
  update darkness_daily_runs
     set score = 100
   where day = date '2026-09-11'
     and user_id = any(ids)
     and status = 'done';

  foreach uid in array ids loop
    if not exists (select 1 from player_profiles where user_id = uid) then
      continue;
    end if;

    select exists(
      select 1 from player_nights
       where user_id = uid
         and coalesce(kind, 'auction') = 'elimination'
         and night_key not like 'bonus-win:%'
         and score > 200 and score <= 280
    ) or exists(
      select 1 from darkness_daily_runs
       where user_id = uid
         and status = 'done'
         and day <> date '2026-09-11'
         and score > 200 and score <= 280
    ) into has_other;

    select coalesce(nullif(owned, '')::jsonb, '["poor"]'::jsonb)
      into owned_json
      from player_profiles
     where user_id = uid;

    if not has_other then
      select coalesce(jsonb_agg(elem), '["poor"]'::jsonb)
        into owned_json
        from jsonb_array_elements_text(owned_json) as t(elem)
       where elem <> 'club200';
    end if;

    select coalesce((
      select jsonb_agg(elem)
        from (
          select distinct elem
            from jsonb_array_elements_text(coalesce(owned_json, '["poor"]'::jsonb) || '["jail"]'::jsonb) as t(elem)
        ) s
    ), '["poor","jail"]'::jsonb)
      into next_owned;

    update player_profiles
       set owned = next_owned::text,
           avatar_id = 'jail',
           career_book = case
             when career_book is null then career_book
             else jsonb_set(
               career_book,
               '{owned}',
               coalesce((
                 select jsonb_agg(elem)
                   from (
                     select distinct elem
                       from jsonb_array_elements_text(
                         coalesce(career_book->'owned', '["poor"]'::jsonb) || '["jail"]'::jsonb
                       ) as t(elem)
                   ) s
               ), '["poor","jail"]'::jsonb)
             )
           end,
           updated_at = now()
     where user_id = uid;
  end loop;
end $$;

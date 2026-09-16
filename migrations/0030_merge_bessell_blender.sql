-- Merge Marquise Bessell into Big Blender. Keep Blender as the live book.
-- Do not settle / walletBalance. credit and box_forgive stay 0. No loan.

alter table player_profiles add column if not exists claimed_by text;
alter table player_profiles add column if not exists box_forgive int not null default 0;

do $$
declare
  keep text;
  drop_id text;
  dump jsonb;
  union_owned jsonb;
begin
  select user_id into keep
    from player_profiles
   where user_id = '9XfClEbu9fjWssgLlw8VUZFqYTqxIpCM'
      or lower(trim(display_name)) = 'big blender'
   order by case when user_id = '9XfClEbu9fjWssgLlw8VUZFqYTqxIpCM' then 0 else 1 end
   limit 1;

  select user_id into drop_id
    from player_profiles
   where user_id = 'd9UdHOqeb48BAXYizwiBkNOBGSB1jtXP'
      or lower(trim(display_name)) = 'marquise bessell'
   order by case when user_id = 'd9UdHOqeb48BAXYizwiBkNOBGSB1jtXP' then 0 else 1 end
   limit 1;

  if keep is null or drop_id is null or keep = drop_id then
    return;
  end if;

  select coalesce(career_book, '{}'::jsonb) into dump
    from player_profiles where user_id = drop_id;

  select coalesce(jsonb_agg(distinct elem), '["poor"]'::jsonb) into union_owned
    from (
      select jsonb_array_elements_text(coalesce(nullif(owned, '')::jsonb, '["poor"]'::jsonb)) as elem
        from player_profiles
       where user_id in (keep, drop_id)
    ) s;

  -- dump.bank/stars 0 so later seeded settle = unique run flags only (no dump+earned double).
  dump := jsonb_set(jsonb_set(jsonb_set(dump, '{bank}', '0'::jsonb), '{stars}', '0'::jsonb), '{owned}', union_owned);

  update darkness_payouts p
     set user_id = keep
   where p.user_id = drop_id
     and not exists (
       select 1 from darkness_payouts x
        where x.user_id = keep and x.source_key = p.source_key
     );
  delete from darkness_payouts where user_id = drop_id;

  update player_nights n
     set user_id = keep
   where n.user_id = drop_id
     and not exists (
       select 1 from player_nights x
        where x.user_id = keep and x.night_key = n.night_key
     );
  delete from player_nights where user_id = drop_id;

  update darkness_daily_runs r
     set user_id = keep
   where r.user_id = drop_id
     and not exists (
       select 1 from darkness_daily_runs x
        where x.user_id = keep and x.day = r.day
     );
  delete from darkness_daily_runs where user_id = drop_id;

  update darkness_daily_runs r
     set payout_score = true
   where r.user_id = keep
     and exists (
       select 1 from darkness_payouts p
        where p.user_id = keep
          and p.kind = 'daily_score'
          and p.source_key like 'daily_score:' || r.day::text || ':%'
     );
  update darkness_daily_runs r
     set payout_win = true
   where r.user_id = keep
     and exists (
       select 1 from darkness_payouts p
        where p.user_id = keep
          and p.kind = 'daily_win'
          and p.source_key like 'daily_win:' || r.day::text || ':%'
     );

  begin
    update darkness_daily_days set awarded_user_id = keep where awarded_user_id = drop_id;
  exception when undefined_table then
    null;
  end;

  begin
    update darkness_weekly_runs r
       set user_id = keep
     where r.user_id = drop_id
       and not exists (
         select 1 from darkness_weekly_runs x
          where x.user_id = keep and x.season = r.season and x.week = r.week
       );
    delete from darkness_weekly_runs where user_id = drop_id;
  exception when undefined_table then
    null;
  end;

  update player_profiles
     set display_name = 'Big Blender',
         owned = union_owned::text,
         career_book = dump,
         seed_lock = 1,
         credit = 0,
         box_forgive = 0,
         coins = (select coalesce(sum(amount), 0) from darkness_payouts where user_id = keep),
         daily_stars = (select coalesce(sum(stars), 0) from darkness_payouts where user_id = keep),
         updated_at = now()
   where user_id = keep;

  update player_profiles
     set display_name = '',
         career_book = null,
         coins = 0,
         daily_stars = 0,
         credit = 0,
         box_forgive = 0,
         seed_lock = 0,
         owned = '["poor"]',
         avatar_id = 'poor',
         claimed_by = keep,
         updated_at = now()
   where user_id = drop_id;
end $$;

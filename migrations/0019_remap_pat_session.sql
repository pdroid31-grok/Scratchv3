-- One-shot: attach signed-in session Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh to seeded
-- Pat (L2L2Tf1HXAeB5rhgLvhogF921BKsICsN). Does not INSERT a new user.
-- Preview (no dest profile, no dest auth row): skip.
-- Live: dest profile missing + dest is a real auth user → fail the migrate.

do $$
declare
  src constant text := 'L2L2Tf1HXAeB5rhgLvhogF921BKsICsN';
  dest constant text := 'Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh';
  dest_profile boolean;
  dest_auth boolean := false;
  src_book jsonb;
begin
  select exists(select 1 from player_profiles where user_id = dest) into dest_profile;

  begin
    execute 'select exists(select 1 from "user" where id = $1)' into dest_auth using dest;
  exception
    when undefined_table then
      dest_auth := false;
  end;

  if not dest_profile then
    if dest_auth then
      raise exception
        'remap-pat: % is a real auth user but has no player_profiles row — abort, will not create',
        dest;
    end if;
    raise notice 'remap-pat: skip (no destination profile)';
    return;
  end if;

  select career_book into src_book from player_profiles where user_id = src;
  if src_book is null then
    raise notice 'remap-pat: skip (source career_book already moved)';
    return;
  end if;

  update player_profiles as d
     set avatar_id = s.avatar_id,
         display_name = 'Pat',
         coins = s.coins,
         coin_wins = s.coin_wins,
         owned = s.owned,
         credit = s.credit,
         daily_stars = s.daily_stars,
         closet_reset = s.closet_reset,
         seed_lock = s.seed_lock,
         career_book = s.career_book,
         updated_at = now()
    from player_profiles as s
   where d.user_id = dest
     and s.user_id = src;

  update player_profiles
     set career_book = null,
         display_name = '',
         updated_at = now()
   where user_id = src;

  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'darkness_payouts'
  ) then
    update darkness_payouts set user_id = dest where user_id = src;
  end if;

  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'player_nights'
  ) then
    update player_nights set user_id = dest where user_id = src;
  end if;
end $$;

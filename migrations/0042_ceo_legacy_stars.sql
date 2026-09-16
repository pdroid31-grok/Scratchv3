-- CEO only. /api/rankings stars = player_profiles.daily_stars AFTER
-- syncDailyStarsFromPayouts overwrites that column from darkness_payouts.
-- First-create seed wrote daily_stars=2 and career_book.stars=2 but no payout
-- rows, so the next rankings load zeroed stars. Do not touch bank/owned/games.

insert into darkness_payouts (user_id, amount, stars, kind, source_key)
values (
  'Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh',
  0,
  2,
  'scratch',
  'scratch:legacy-seed:Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh'
)
on conflict (source_key) do nothing;

update player_profiles
   set daily_stars = 2,
       updated_at = now()
 where user_id = 'Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh'
   and coalesce(daily_stars, 0) is distinct from 2;

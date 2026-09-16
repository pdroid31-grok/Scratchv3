-- Claim-existing-book: one authenticated session may attach one unclaimed seed row.
alter table player_profiles
  add column if not exists claimed_by text;

create unique index if not exists player_profiles_claimed_by_uidx
  on player_profiles (claimed_by)
  where claimed_by is not null;

-- Pat already remapped; lock the old seed id so it cannot be claimed.
update player_profiles
   set claimed_by = 'Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh'
 where user_id = 'L2L2Tf1HXAeB5rhgLvhogF921BKsICsN'
   and claimed_by is null;

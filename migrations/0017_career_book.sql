-- Public-book snapshot fields. Rankings can read career_book when player_nights
-- are empty. seed_lock stops settleProfile from rewriting dumped coins/owned.
alter table player_profiles
  add column if not exists career_book jsonb;
alter table player_profiles
  add column if not exists seed_lock int not null default 0;

alter table player_profiles
  add column if not exists credit int not null default 0;

alter table player_profiles
  add column if not exists closet_reset int not null default 0;

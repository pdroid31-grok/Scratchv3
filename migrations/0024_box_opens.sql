alter table player_profiles
  add column if not exists box_opens int not null default 0;

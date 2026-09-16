alter table player_profiles
  add column if not exists display_name text not null default 'GM';

alter table player_profiles
  add column if not exists coins int not null default 0;
alter table player_profiles
  add column if not exists coin_wins int not null default 0;
alter table player_profiles
  add column if not exists owned text not null default '["poor"]';

update player_profiles
  set avatar_id = 'poor',
      owned = '["poor"]';

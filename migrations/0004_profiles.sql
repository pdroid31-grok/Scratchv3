-- Preferred Pepe avatar per signed-in GM.
create table if not exists player_profiles (
  user_id    text primary key,
  avatar_id  text not null default 'poor',
  updated_at timestamptz not null default now()
);

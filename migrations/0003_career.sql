-- Per-user career book. Scoped by Better Auth user_id.
create table if not exists player_nights (
  id             serial primary key,
  user_id        text not null,
  night_key      text not null,
  opponent_name  text not null,
  opponent_key   text not null,
  won            boolean,
  score          integer not null,
  opponent_score integer not null,
  created_at     timestamptz not null default now(),
  unique (user_id, night_key)
);
create index if not exists player_nights_user_id_idx on player_nights (user_id);
create index if not exists player_nights_user_opp_idx on player_nights (user_id, opponent_key);

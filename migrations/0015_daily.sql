alter table player_profiles add column if not exists daily_stars integer not null default 0;

create table if not exists darkness_daily_days (
  day date primary key,
  year integer not null,
  week integer not null,
  awarded boolean not null default false,
  awarded_user_id text,
  created_at timestamptz not null default now()
);

create table if not exists darkness_daily_runs (
  day date not null,
  user_id text not null,
  status text not null default 'playing',
  score numeric,
  payout_score boolean not null default false,
  payout_win boolean not null default false,
  picks jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (day, user_id)
);

create index if not exists darkness_daily_runs_day_score_idx
  on darkness_daily_runs (day, score desc)
  where status = 'done';

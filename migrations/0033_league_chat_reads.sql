create table if not exists darkness_league_chat_reads (
  user_id text primary key,
  last_read_id bigint not null default 0,
  last_read_at timestamptz not null default now()
);

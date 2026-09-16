create table if not exists darkness_league_chat (
  id bigserial primary key,
  user_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists darkness_league_chat_created_idx
  on darkness_league_chat (created_at desc, id desc);

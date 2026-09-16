create table if not exists darkness_payouts (
  id serial primary key,
  user_id text not null,
  amount integer not null,
  stars integer not null default 0,
  kind text not null,
  source_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists darkness_payouts_user_idx on darkness_payouts (user_id, created_at desc);
create index if not exists darkness_payouts_kind_idx on darkness_payouts (kind, created_at desc);

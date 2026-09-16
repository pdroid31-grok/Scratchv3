create table if not exists player_vault_snapshots (
  day        date primary key,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

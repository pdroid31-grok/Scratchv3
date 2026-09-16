alter table player_profiles add column if not exists claimed_by text;

create table if not exists darkness_commish_audit (
  id bigserial primary key,
  actor text not null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

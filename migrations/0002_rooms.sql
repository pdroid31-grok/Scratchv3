-- Shared Darkness nights. Unowned on purpose (auth off): a code + seat token
-- is the only key. No user_id. No bulk delete.
create table if not exists darkness_rooms (
  code        text primary key,
  state       jsonb not null,
  host_token  text not null,
  guest_token text,
  version     integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

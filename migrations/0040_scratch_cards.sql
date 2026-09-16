-- Scratch tickets earned from Daily scores. Prize is rolled in app code, not here.

create table if not exists darkness_scratch_cards (
  id serial primary key,
  user_id text not null,
  roll integer not null,
  prize text not null,
  coins integer not null default 0,
  stars integer not null default 0,
  avatar_id text,
  created_at timestamptz not null default now(),
  scratched_at timestamptz
);

create index if not exists darkness_scratch_cards_user_idx
  on darkness_scratch_cards (user_id, scratched_at, id);

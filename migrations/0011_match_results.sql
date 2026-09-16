alter table darkness_rooms add column if not exists host_user_id text;
alter table darkness_rooms add column if not exists guest_user_id text;

create table if not exists darkness_results (
  code          text not null,
  nights        integer not null,
  kind          text not null,
  winner        integer,
  score0        integer not null,
  score1        integer not null,
  name0         text not null,
  name1         text not null,
  host_user_id  text,
  guest_user_id text,
  host_token    text not null,
  guest_token   text not null,
  created_at    timestamptz not null default now(),
  primary key (code, nights)
);

create index if not exists darkness_results_host_token_idx on darkness_results (host_token);
create index if not exists darkness_results_guest_token_idx on darkness_results (guest_token);
create index if not exists darkness_results_host_user_idx on darkness_results (host_user_id);
create index if not exists darkness_results_guest_user_idx on darkness_results (guest_user_id);

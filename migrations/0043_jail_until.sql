-- Lock one player's equipped look until a time. Null for everyone else. Do not set a row.
alter table player_profiles add column if not exists jail_until timestamptz;

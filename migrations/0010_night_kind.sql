alter table player_nights add column if not exists kind text not null default 'auction';
update player_nights
   set kind = 'elimination'
 where kind = 'auction'
   and night_key like '%e:20%';
create index if not exists player_nights_kind_idx on player_nights (kind);

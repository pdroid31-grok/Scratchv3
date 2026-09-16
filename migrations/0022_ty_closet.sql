-- Ty only. Strip pirate/ninja/cyborg/zombie/chef from owned so the box can roll them.
-- Does not touch coins, stars, payouts, daily_runs, career_book, seed_lock.
-- credit/box_forgive zeroed (no coins added). "shirt" is not an avatar id — left untouched.

alter table player_profiles
  add column if not exists box_forgive int not null default 0;

update player_profiles
   set owned = coalesce((
         select jsonb_agg(elem order by ord)::text
           from jsonb_array_elements_text(owned::jsonb) with ordinality as t(elem, ord)
          where elem not in ('pirate', 'ninja', 'cyborg', 'zombie', 'chef')
       ), '["poor"]'),
       avatar_id = 'superhero',
       credit = 0,
       box_forgive = 0,
       updated_at = now()
 where user_id = 'WJ5wZKjoZwydfPBf5FrkiOdwYarlw7b7';

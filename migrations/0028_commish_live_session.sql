-- Equip commish on the signed-in Commish session. Do not merge books.
-- Do not touch coins, stars, credit, box_forgive, or the mystery-box pool.

update player_profiles
   set avatar_id = 'commish',
       owned = coalesce((
         select jsonb_agg(elem)::text
           from (
             select distinct elem
               from jsonb_array_elements_text(
                 coalesce(nullif(owned, '')::jsonb, '["poor"]'::jsonb) || '["commish"]'::jsonb
               ) as t(elem)
           ) s
       ), '["poor","commish"]'),
       career_book = case
         when career_book is null then career_book
         else jsonb_set(
           career_book,
           '{owned}',
           coalesce(career_book->'owned', '["poor"]'::jsonb) || '["commish"]'::jsonb
         )
       end,
       updated_at = now()
 where user_id = 'pdmWR37xeGY7GSgtigoJfwslS1VejCPq';

-- Commish-only look. Do not touch coins, stars, credit, or box_forgive.
-- Live seed id e7APj7EJ03oPUXuukNxNpWqDzsCjUrIM plus any row named Commish.

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
 where user_id = 'e7APj7EJ03oPUXuukNxNpWqDzsCjUrIM'
    or lower(trim(display_name)) = 'commish';

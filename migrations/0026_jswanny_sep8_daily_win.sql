-- Dedupe JSwanny Sep 8 daily_win. Keep claimed id. Do not settle. Coins unchanged.
-- Keep daily_win:2026-09-08:hoHe7OoFJoMnu7lKA5515n4kVi5NiJ9o
-- Delete daily_win:2026-09-08:hxIAsCe4u3Ojx0jq5Zvvm2gsIcVeJw1A
-- Keep Sep 9 daily_score. credit/box_forgive untouched.

delete from darkness_payouts
 where kind = 'daily_win'
   and (
     source_key = 'daily_win:2026-09-08:hxIAsCe4u3Ojx0jq5Zvvm2gsIcVeJw1A'
     or (
       user_id in ('hoHe7OoFJoMnu7lKA5515n4kVi5NiJ9o', 'hxIAsCe4u3Ojx0jq5Zvvm2gsIcVeJw1A')
       and source_key like 'daily_win:2026-09-08:%'
       and source_key <> 'daily_win:2026-09-08:hoHe7OoFJoMnu7lKA5515n4kVi5NiJ9o'
     )
   );

-- Seeded settle is dump.stars + payout_win count. Dump copied the star, so next settle
-- would restore 2 unless the dump base is 0.
update player_profiles
   set daily_stars = 1,
       career_book = case
         when career_book is not null
           then jsonb_set(career_book, '{stars}', '0'::jsonb)
         else career_book
       end,
       updated_at = now()
 where user_id = 'hoHe7OoFJoMnu7lKA5515n4kVi5NiJ9o';

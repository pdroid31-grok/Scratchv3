-- Sep 8 stays open for a single midnight daily_win. Sep 2–7 stay awarded.
-- Does not insert payouts or touch coins/stars/career_book.

update darkness_daily_days
   set awarded = false,
       awarded_user_id = null
 where day = date '2026-09-08';

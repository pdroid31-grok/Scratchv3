-- Stop invented Commish wins. Do not touch e7APj7 coins. No loan.
-- pdmWR37 $2 was walletBalance from official:commish nights, not a payout.

delete from player_nights
 where night_key like 'official:commish:%'
    or night_key like 'bonus-win:%';

update player_profiles
   set coins = 0,
       updated_at = now()
 where user_id = 'pdmWR37xeGY7GSgtigoJfwslS1VejCPq';

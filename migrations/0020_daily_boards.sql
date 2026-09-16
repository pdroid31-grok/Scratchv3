-- Historical Daily scoreboard only (darknessfantasy).
-- No payouts, no player_nights, no coin/star/career_book writes.
-- payout_score/payout_win stay false so earnedChallenge/settleProfile do not add cash.
-- Days marked awarded so settleYesterday will not pay them later.

insert into player_profiles (user_id, avatar_id, display_name, coins, coin_wins, owned, credit, daily_stars, closet_reset, seed_lock, updated_at)
values
  ('5nWDuHgSRx1TLr0oeKtiStulZzievyRq', 'poor', 'Max Faile', 0, 0, '["poor"]', 0, 0, 4, 1, now()),
  ('Qxo7D6xMnqUdJ2pTikGalBsvfoLdd4MY', 'poor', 'Jay Mack', 0, 0, '["poor"]', 0, 0, 4, 1, now())
on conflict (user_id) do nothing;

insert into darkness_daily_days (day, year, week, awarded, awarded_user_id)
values
  ('2026-09-02', 0, 0, true, 'Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh'),
  ('2026-09-03', 0, 0, true, 'Th7Ewogxh5Ul0nRrTQgs7tmP45rePO3Q'),
  ('2026-09-04', 0, 0, true, 'B8FgPeYF2jVeLnfgd20PE8FYCpmpsC9n'),
  ('2026-09-05', 0, 0, true, 'B8FgPeYF2jVeLnfgd20PE8FYCpmpsC9n'),
  ('2026-09-06', 0, 0, true, 'B8FgPeYF2jVeLnfgd20PE8FYCpmpsC9n'),
  ('2026-09-07', 0, 0, true, '38GXVpMo8GE8bERLYLHaoQF4CPBjvUS0'),
  ('2026-09-08', 0, 0, false, null)
on conflict (day) do update
  set awarded = true,
      awarded_user_id = coalesce(darkness_daily_days.awarded_user_id, excluded.awarded_user_id)
where darkness_daily_days.day < date '2026-09-08';

insert into darkness_daily_runs (day, user_id, status, score, payout_score, payout_win, picks, started_at, finished_at)
values
  -- 2026-09-02
  ('2026-09-02', 'Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh', 'done', 139.6, false, false, null, '2026-09-02T16:00:00Z', '2026-09-02T16:01:00Z'),
  ('2026-09-02', 'B8FgPeYF2jVeLnfgd20PE8FYCpmpsC9n', 'done', 129.1, false, false, null, '2026-09-02T16:00:00Z', '2026-09-02T16:02:00Z'),
  ('2026-09-02', 'Th7Ewogxh5Ul0nRrTQgs7tmP45rePO3Q', 'done', 116.2, false, false, null, '2026-09-02T16:00:00Z', '2026-09-02T16:03:00Z'),
  ('2026-09-02', 'WJ5wZKjoZwydfPBf5FrkiOdwYarlw7b7', 'done', 96.8, false, false, null, '2026-09-02T16:00:00Z', '2026-09-02T16:04:00Z'),
  ('2026-09-02', 't4GKnuNe18istHzOAvqGUgwVVnlV5WZ3', 'done', 91.8, false, false, null, '2026-09-02T16:00:00Z', '2026-09-02T16:05:00Z'),
  -- 2026-09-03
  ('2026-09-03', 'Th7Ewogxh5Ul0nRrTQgs7tmP45rePO3Q', 'done', 110.8, false, false, null, '2026-09-03T16:00:00Z', '2026-09-03T16:01:00Z'),
  ('2026-09-03', '5nWDuHgSRx1TLr0oeKtiStulZzievyRq', 'done', 110.2, false, false, null, '2026-09-03T16:00:00Z', '2026-09-03T16:02:00Z'),
  ('2026-09-03', 't4GKnuNe18istHzOAvqGUgwVVnlV5WZ3', 'done', 107.7, false, false, null, '2026-09-03T16:00:00Z', '2026-09-03T16:03:00Z'),
  ('2026-09-03', 'Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh', 'done', 103.8, false, false, null, '2026-09-03T16:00:00Z', '2026-09-03T16:04:00Z'),
  ('2026-09-03', 'WJ5wZKjoZwydfPBf5FrkiOdwYarlw7b7', 'done', 102.2, false, false, null, '2026-09-03T16:00:00Z', '2026-09-03T16:05:00Z'),
  ('2026-09-03', 'B8FgPeYF2jVeLnfgd20PE8FYCpmpsC9n', 'done', 86.0, false, false, null, '2026-09-03T16:00:00Z', '2026-09-03T16:06:00Z'),
  ('2026-09-03', 'hxIAsCe4u3Ojx0jq5Zvvm2gsIcVeJw1A', 'done', 74.8, false, false, null, '2026-09-03T16:00:00Z', '2026-09-03T16:07:00Z'),
  -- 2026-09-04
  ('2026-09-04', 'B8FgPeYF2jVeLnfgd20PE8FYCpmpsC9n', 'done', 162.7, false, false, null, '2026-09-04T16:00:00Z', '2026-09-04T16:01:00Z'),
  ('2026-09-04', 'Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh', 'done', 162.5, false, false, null, '2026-09-04T16:00:00Z', '2026-09-04T16:02:00Z'),
  ('2026-09-04', 'WJ5wZKjoZwydfPBf5FrkiOdwYarlw7b7', 'done', 144.5, false, false, null, '2026-09-04T16:00:00Z', '2026-09-04T16:03:00Z'),
  ('2026-09-04', '5nWDuHgSRx1TLr0oeKtiStulZzievyRq', 'done', 140.3, false, false, null, '2026-09-04T16:00:00Z', '2026-09-04T16:04:00Z'),
  ('2026-09-04', 't4GKnuNe18istHzOAvqGUgwVVnlV5WZ3', 'done', 139.7, false, false, null, '2026-09-04T16:00:00Z', '2026-09-04T16:05:00Z'),
  ('2026-09-04', 'hxIAsCe4u3Ojx0jq5Zvvm2gsIcVeJw1A', 'done', 122.6, false, false, null, '2026-09-04T16:00:00Z', '2026-09-04T16:06:00Z'),
  ('2026-09-04', 'Th7Ewogxh5Ul0nRrTQgs7tmP45rePO3Q', 'done', 122.5, false, false, null, '2026-09-04T16:00:00Z', '2026-09-04T16:07:00Z'),
  -- 2026-09-05
  ('2026-09-05', 'B8FgPeYF2jVeLnfgd20PE8FYCpmpsC9n', 'done', 128.5, false, false, null, '2026-09-05T16:00:00Z', '2026-09-05T16:01:00Z'),
  ('2026-09-05', 'Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh', 'done', 112.7, false, false, null, '2026-09-05T16:00:00Z', '2026-09-05T16:02:00Z'),
  ('2026-09-05', '5nWDuHgSRx1TLr0oeKtiStulZzievyRq', 'done', 112.3, false, false, null, '2026-09-05T16:00:00Z', '2026-09-05T16:03:00Z'),
  ('2026-09-05', 'WJ5wZKjoZwydfPBf5FrkiOdwYarlw7b7', 'done', 110.1, false, false, null, '2026-09-05T16:00:00Z', '2026-09-05T16:04:00Z'),
  ('2026-09-05', 'Th7Ewogxh5Ul0nRrTQgs7tmP45rePO3Q', 'done', 107.8, false, false, null, '2026-09-05T16:00:00Z', '2026-09-05T16:05:00Z'),
  ('2026-09-05', 't4GKnuNe18istHzOAvqGUgwVVnlV5WZ3', 'done', 78.7, false, false, null, '2026-09-05T16:00:00Z', '2026-09-05T16:06:00Z'),
  -- 2026-09-06
  ('2026-09-06', 'B8FgPeYF2jVeLnfgd20PE8FYCpmpsC9n', 'done', 138.0, false, false, null, '2026-09-06T16:00:00Z', '2026-09-06T16:01:00Z'),
  ('2026-09-06', '38GXVpMo8GE8bERLYLHaoQF4CPBjvUS0', 'done', 126.1, false, false, null, '2026-09-06T16:00:00Z', '2026-09-06T16:02:00Z'),
  ('2026-09-06', 'Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh', 'done', 122.0, false, false, null, '2026-09-06T16:00:00Z', '2026-09-06T16:03:00Z'),
  ('2026-09-06', 'hxIAsCe4u3Ojx0jq5Zvvm2gsIcVeJw1A', 'done', 114.7, false, false, null, '2026-09-06T16:00:00Z', '2026-09-06T16:04:00Z'),
  ('2026-09-06', 't4GKnuNe18istHzOAvqGUgwVVnlV5WZ3', 'done', 114.4, false, false, null, '2026-09-06T16:00:00Z', '2026-09-06T16:05:00Z'),
  ('2026-09-06', 'v783SxZeXud3WKr9H7q7pcgFypgIuGsY', 'done', 106.6, false, false, null, '2026-09-06T16:00:00Z', '2026-09-06T16:06:00Z'),
  ('2026-09-06', 'Th7Ewogxh5Ul0nRrTQgs7tmP45rePO3Q', 'done', 106.4, false, false, null, '2026-09-06T16:00:00Z', '2026-09-06T16:07:00Z'),
  ('2026-09-06', 'WJ5wZKjoZwydfPBf5FrkiOdwYarlw7b7', 'done', 78.8, false, false, null, '2026-09-06T16:00:00Z', '2026-09-06T16:08:00Z'),
  -- 2026-09-07
  ('2026-09-07', '38GXVpMo8GE8bERLYLHaoQF4CPBjvUS0', 'done', 140.9, false, false, null, '2026-09-07T16:00:00Z', '2026-09-07T16:01:00Z'),
  ('2026-09-07', 'Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh', 'done', 118.5, false, false, null, '2026-09-07T16:00:00Z', '2026-09-07T16:02:00Z'),
  ('2026-09-07', 'v783SxZeXud3WKr9H7q7pcgFypgIuGsY', 'done', 114.4, false, false, null, '2026-09-07T16:00:00Z', '2026-09-07T16:03:00Z'),
  ('2026-09-07', 'hxIAsCe4u3Ojx0jq5Zvvm2gsIcVeJw1A', 'done', 113.7, false, false, null, '2026-09-07T16:00:00Z', '2026-09-07T16:04:00Z'),
  ('2026-09-07', 'B8FgPeYF2jVeLnfgd20PE8FYCpmpsC9n', 'done', 112.6, false, false, null, '2026-09-07T16:00:00Z', '2026-09-07T16:05:00Z'),
  ('2026-09-07', 'Th7Ewogxh5Ul0nRrTQgs7tmP45rePO3Q', 'done', 111.4, false, false, null, '2026-09-07T16:00:00Z', '2026-09-07T16:06:00Z'),
  ('2026-09-07', 'WJ5wZKjoZwydfPBf5FrkiOdwYarlw7b7', 'done', 106.9, false, false, null, '2026-09-07T16:00:00Z', '2026-09-07T16:07:00Z'),
  ('2026-09-07', 't4GKnuNe18istHzOAvqGUgwVVnlV5WZ3', 'done', 98.7, false, false, null, '2026-09-07T16:00:00Z', '2026-09-07T16:08:00Z'),
  -- 2026-09-08
  ('2026-09-08', 'hxIAsCe4u3Ojx0jq5Zvvm2gsIcVeJw1A', 'done', 132.1, false, false, null, '2026-09-08T16:00:00Z', '2026-09-08T16:01:00Z'),
  ('2026-09-08', 't4GKnuNe18istHzOAvqGUgwVVnlV5WZ3', 'done', 130.3, false, false, null, '2026-09-08T16:00:00Z', '2026-09-08T16:02:00Z'),
  ('2026-09-08', 'd9UdHOqeb48BAXYizwiBkNOBGSB1jtXP', 'done', 127.0, false, false, null, '2026-09-08T16:00:00Z', '2026-09-08T16:03:00Z'),
  ('2026-09-08', 'v783SxZeXud3WKr9H7q7pcgFypgIuGsY', 'done', 117.1, false, false, null, '2026-09-08T16:00:00Z', '2026-09-08T16:04:00Z'),
  ('2026-09-08', 'Th7Ewogxh5Ul0nRrTQgs7tmP45rePO3Q', 'done', 107.9, false, false, null, '2026-09-08T16:00:00Z', '2026-09-08T16:05:00Z'),
  ('2026-09-08', 'Qxo7D6xMnqUdJ2pTikGalBsvfoLdd4MY', 'done', 104.5, false, false, null, '2026-09-08T16:00:00Z', '2026-09-08T16:06:00Z'),
  ('2026-09-08', 'WJ5wZKjoZwydfPBf5FrkiOdwYarlw7b7', 'done', 97.6, false, false, null, '2026-09-08T16:00:00Z', '2026-09-08T16:07:00Z'),
  ('2026-09-08', 'Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh', 'done', 97.5, false, false, null, '2026-09-08T16:00:00Z', '2026-09-08T16:08:00Z'),
  ('2026-09-08', 'B8FgPeYF2jVeLnfgd20PE8FYCpmpsC9n', 'done', 81.7, false, false, null, '2026-09-08T16:00:00Z', '2026-09-08T16:09:00Z')
on conflict (day, user_id) do update
  set score = excluded.score,
      status = 'done',
      finished_at = excluded.finished_at
where darkness_daily_runs.picks is null;

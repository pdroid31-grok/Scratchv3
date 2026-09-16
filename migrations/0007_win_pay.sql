-- Recast bank to $1 per win, minus $3 per rolled look.
update player_profiles p
set
  coin_wins = coalesce((
    select count(*) filter (where n.won is true)
    from player_nights n
    where n.user_id = p.user_id
  ), 0),
  coins = greatest(
    0,
    coalesce((
      select count(*) filter (where n.won is true)
      from player_nights n
      where n.user_id = p.user_id
    ), 0)
    - 3 * greatest(
      0,
      (
        select count(*)::int
        from jsonb_array_elements_text(coalesce(p.owned::jsonb, '["poor"]'::jsonb)) as look
        where look <> 'poor'
      )
    )
  );

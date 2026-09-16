-- Set daily_stars = unique daily_win days + (2 × unique weekly_win weeks).
-- Do not insert payouts. Do not change coins.
-- Then append Daily Unlock looks already earned (closet freeze otherwise stays).

do $$
declare
  rec record;
  cur jsonb;
  nxt jsonb;
  stars int;
begin
  update player_profiles p
     set daily_stars = coalesce((
           select count(distinct split_part(x.source_key, ':', 2)) filter (where x.kind = 'daily_win')
                + 2 * count(distinct split_part(x.source_key, ':', 2)) filter (where x.kind = 'weekly_win')
             from darkness_payouts x
            where x.user_id = p.user_id
         ), 0),
         updated_at = now()
   where coalesce(p.daily_stars, 0) is distinct from coalesce((
           select count(distinct split_part(x.source_key, ':', 2)) filter (where x.kind = 'daily_win')
                + 2 * count(distinct split_part(x.source_key, ':', 2)) filter (where x.kind = 'weekly_win')
             from darkness_payouts x
            where x.user_id = p.user_id
         ), 0);

  for rec in
    select p.user_id as uid, coalesce(p.daily_stars, 0)::int as star_count, p.owned as closet
      from player_profiles p
  loop
    stars := rec.star_count;
    begin
      cur := coalesce(nullif(btrim(rec.closet::text), '')::jsonb, '["poor"]'::jsonb);
      if jsonb_typeof(cur) <> 'array' then
        cur := '["poor"]'::jsonb;
      end if;
    exception when others then
      cur := '["poor"]'::jsonb;
    end;
    nxt := cur;
    if stars >= 1 and not (nxt @> '["foam"]'::jsonb) then nxt := nxt || '["foam"]'::jsonb; end if;
    if stars >= 3 and not (nxt @> '["dj"]'::jsonb) then nxt := nxt || '["dj"]'::jsonb; end if;
    if stars >= 5 and not (nxt @> '["flame"]'::jsonb) then nxt := nxt || '["flame"]'::jsonb; end if;
    if stars >= 8 and not (nxt @> '["8ball"]'::jsonb) then nxt := nxt || '["8ball"]'::jsonb; end if;
    if stars >= 10 and not (nxt @> '["starmage"]'::jsonb) then nxt := nxt || '["starmage"]'::jsonb; end if;
    if stars >= 15 and not (nxt @> '["trex"]'::jsonb) then nxt := nxt || '["trex"]'::jsonb; end if;
    if stars >= 20 and not (nxt @> '["terminator"]'::jsonb) then nxt := nxt || '["terminator"]'::jsonb; end if;
    if stars >= 25 and not (nxt @> '["king"]'::jsonb) then nxt := nxt || '["king"]'::jsonb; end if;
    if stars >= 50 and not (nxt @> '["bitcoin"]'::jsonb) then nxt := nxt || '["bitcoin"]'::jsonb; end if;
    if stars >= 75 and not (nxt @> '["ghostpepe"]'::jsonb) then nxt := nxt || '["ghostpepe"]'::jsonb; end if;
    if stars >= 100 and not (nxt @> '["diamond"]'::jsonb) then nxt := nxt || '["diamond"]'::jsonb; end if;
    if nxt <> cur then
      update player_profiles
         set owned = nxt::text, updated_at = now()
       where user_id = rec.uid;
    end if;
  end loop;
exception
  when undefined_table then
    raise notice 'daily_stars payout sync skipped: %', SQLERRM;
  when others then
    raise notice 'daily_stars payout sync skipped: %', SQLERRM;
end $$;

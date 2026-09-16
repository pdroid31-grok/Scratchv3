-- Grant Daily Unlock looks already earned by daily_stars. Append only.
-- Does not change coins, daily_stars, career_book, or equipped.

do $$
declare
  rec record;
  cur jsonb;
  nxt jsonb;
  stars int;
begin
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
    if stars >= 10 and not (nxt @> '["starmage"]'::jsonb) then nxt := nxt || '["starmage"]'::jsonb; end if;
    if stars >= 15 and not (nxt @> '["trex"]'::jsonb) then nxt := nxt || '["trex"]'::jsonb; end if;
    if stars >= 20 and not (nxt @> '["terminator"]'::jsonb) then nxt := nxt || '["terminator"]'::jsonb; end if;
    if stars >= 25 and not (nxt @> '["king"]'::jsonb) then nxt := nxt || '["king"]'::jsonb; end if;
    if stars >= 50 and not (nxt @> '["bitcoin"]'::jsonb) then nxt := nxt || '["bitcoin"]'::jsonb; end if;
    if stars >= 100 and not (nxt @> '["diamond"]'::jsonb) then nxt := nxt || '["diamond"]'::jsonb; end if;
    if nxt <> cur then
      update player_profiles
         set owned = nxt::text, updated_at = now()
       where user_id = rec.uid;
    end if;
  end loop;
exception when others then
  raise notice 'star-look catchup skipped: %', SQLERRM;
end $$;

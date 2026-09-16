-- Append 8-ball (8 stars) and ghostpepe (75 stars) when already earned.
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
    if stars >= 8 and not (nxt @> '["8ball"]'::jsonb) then nxt := nxt || '["8ball"]'::jsonb; end if;
    if stars >= 75 and not (nxt @> '["ghostpepe"]'::jsonb) then nxt := nxt || '["ghostpepe"]'::jsonb; end if;
    if nxt <> cur then
      update player_profiles
         set owned = nxt::text, updated_at = now()
       where user_id = rec.uid;
    end if;
  end loop;
exception when others then
  raise notice '8ball/ghost catchup skipped: %', SQLERRM;
end $$;

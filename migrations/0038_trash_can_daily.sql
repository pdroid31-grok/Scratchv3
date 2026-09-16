-- Grant banana (Trash Can) for historic Daily scores under 60.
-- Append only. Do not change coins, stars, Daily Unlocks, or the box pool.

do $$
declare
  rec record;
  cur jsonb;
  nxt jsonb;
begin
  for rec in
    select distinct p.user_id as uid, p.owned as closet
      from player_profiles p
      join darkness_daily_runs r on r.user_id = p.user_id
     where r.status = 'done'
       and r.score is not null
       and r.score < 60
  loop
    begin
      cur := coalesce(nullif(btrim(rec.closet::text), '')::jsonb, '["poor"]'::jsonb);
      if jsonb_typeof(cur) <> 'array' then
        cur := '["poor"]'::jsonb;
      end if;
    exception when others then
      cur := '["poor"]'::jsonb;
    end;
    nxt := cur;
    if not (nxt @> '["banana"]'::jsonb) then
      nxt := nxt || '["banana"]'::jsonb;
    end if;
    if nxt <> cur then
      update player_profiles
         set owned = nxt::text, updated_at = now()
       where user_id = rec.uid;
    end if;
  end loop;
exception
  when undefined_table then
    raise notice 'trash can catch-up skipped: %', SQLERRM;
  when others then
    raise notice 'trash can catch-up skipped: %', SQLERRM;
end $$;

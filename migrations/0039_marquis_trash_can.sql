-- Marquis Scott: own + equip Trash Can (banana). No coins, stars, or other closets.

do $$
declare
  uid constant text := 'FWuvVwD2j9Lnc3tG9OcNJcGwLdrzR1L4';
  cur jsonb;
  nxt jsonb;
begin
  if not exists (select 1 from player_profiles where user_id = uid) then
    return;
  end if;

  select coalesce(nullif(btrim(owned), '')::jsonb, '["poor"]'::jsonb)
    into cur
    from player_profiles
   where user_id = uid;

  if jsonb_typeof(cur) <> 'array' then
    cur := '["poor"]'::jsonb;
  end if;

  nxt := cur;
  if not (nxt @> '["banana"]'::jsonb) then
    nxt := nxt || '["banana"]'::jsonb;
  end if;

  update player_profiles
     set owned = nxt::text,
         avatar_id = 'banana',
         updated_at = now()
   where user_id = uid;
exception
  when undefined_table then
    raise notice 'marquis trash can skipped: %', SQLERRM;
  when others then
    raise notice 'marquis trash can skipped: %', SQLERRM;
end $$;

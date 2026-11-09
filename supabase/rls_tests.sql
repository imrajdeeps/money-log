-- Money Log, Release 1 — access-rule tests.
--
-- HOW TO RUN: after schema.sql, paste this whole file into the Supabase SQL Editor and Run.
-- It creates two throw-away users and some rows INSIDE a transaction and ends with ROLLBACK,
-- so nothing is kept. Every check prints a NOTICE: PASS ...; the first failure stops the run
-- with an error that starts with FAIL. The last line printed must be: ALL ACCESS TESTS PASSED.
--
-- Two kinds of checks:
--   1. Structure: the exact policies, grants and triggers exist (so a weakened rule is caught even where another
--      rule would happen to hide the effect).
--   2. Behaviour: as user A, user B and an anonymous visitor, try to read and write each other's rows.
--
-- Run it again after any change to schema.sql.

begin;

-- two fake users (ids are fixed so the checks below can name them)
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- helper: act as a signed-in user (role + jwt claims), or as an anonymous visitor
create or replace function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin
  if uid is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
  else
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
  end if;
end $$;
grant execute on function pg_temp.act_as(text) to public;

-- helper: run a statement and report whether it raised an error
create or replace function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;
grant execute on function pg_temp.fails(text) to public;

-- helper: row count for a query
create or replace function pg_temp.n(q text) returns bigint language plpgsql as $$
declare c bigint;
begin
  execute 'select count(*) from (' || q || ') s' into c;
  return c;
end $$;
grant execute on function pg_temp.n(text) to public;

do $$
declare
  a constant text := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  b constant text := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  e1 constant text := '11111111-1111-4111-8111-111111111111';
  e2 constant text := '33333333-3333-4333-8333-333333333333';
  t0 timestamptz;
  t1 timestamptz;
  n bigint;
  tbl text;
  pol record;
begin
  -- =========================================================================
  -- 1. STRUCTURE (checked as the script's own role, before acting as anyone)
  -- =========================================================================
  if (select count(*) from pg_policies where schemaname = 'public' and tablename in ('entries', 'plan_blocks')) <> 8 then
    raise exception 'FAIL expected exactly 8 policies (4 per table), found %',
      (select count(*) from pg_policies where schemaname = 'public' and tablename in ('entries', 'plan_blocks'));
  end if;

  for pol in select * from pg_policies where schemaname = 'public' and tablename in ('entries', 'plan_blocks') loop
    if pol.roles::text <> '{authenticated}' or pol.permissive <> 'PERMISSIVE' then
      raise exception 'FAIL policy % must be a permissive policy for role authenticated only (roles %)', pol.policyname, pol.roles;
    end if;
    if pol.cmd in ('SELECT', 'UPDATE', 'DELETE') and (pol.qual is null or position('owner_id' in pol.qual) = 0 or position('auth.uid()' in pol.qual) = 0) then
      raise exception 'FAIL policy % does not restrict rows to owner_id = auth.uid() (using: %)', pol.policyname, pol.qual;
    end if;
    if pol.cmd in ('INSERT', 'UPDATE') and (pol.with_check is null or position('owner_id' in pol.with_check) = 0 or position('auth.uid()' in pol.with_check) = 0) then
      raise exception 'FAIL policy % does not restrict new rows to owner_id = auth.uid() (with check: %)', pol.policyname, pol.with_check;
    end if;
  end loop;
  if (select count(distinct cmd) from pg_policies where schemaname = 'public' and tablename = 'entries') <> 4
     or (select count(distinct cmd) from pg_policies where schemaname = 'public' and tablename = 'plan_blocks') <> 4 then
    raise exception 'FAIL each table needs one policy per command (select, insert, update, delete)';
  end if;
  raise notice 'PASS exactly one owner-only policy per command on both tables, for authenticated only';

  foreach tbl in array array['public.entries', 'public.plan_blocks'] loop
    if not (select relrowsecurity and relforcerowsecurity from pg_class where oid = tbl::regclass) then
      raise exception 'FAIL row-level security is not enabled and forced on %', tbl;
    end if;
    if has_table_privilege('anon', tbl, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      raise exception 'FAIL role anon holds a privilege on %', tbl;
    end if;
    if not (has_table_privilege('authenticated', tbl, 'SELECT') and has_table_privilege('authenticated', tbl, 'INSERT')
        and has_table_privilege('authenticated', tbl, 'UPDATE') and has_table_privilege('authenticated', tbl, 'DELETE')) then
      raise exception 'FAIL role authenticated is missing select/insert/update/delete on %', tbl;
    end if;
    if has_table_privilege('authenticated', tbl, 'TRUNCATE,REFERENCES,TRIGGER') then
      raise exception 'FAIL role authenticated holds TRUNCATE, REFERENCES or TRIGGER on % (TRUNCATE ignores row-level security)', tbl;
    end if;
  end loop;
  raise notice 'PASS row-level security forced; anon has no privileges; authenticated has only select/insert/update/delete';

  if (select count(*) from pg_trigger where tgrelid = 'public.entries'::regclass and not tgisinternal
        and tgname in ('entries_touch_synced_at', 'entries_keep_latest_edit')) <> 2 then
    raise exception 'FAIL the entries triggers (synced_at stamp, latest-edit rule) are missing';
  end if;
  raise notice 'PASS entries triggers present';

  -- =========================================================================
  -- 2. BEHAVIOUR
  -- =========================================================================
  -- ---- A writes -------------------------------------------------------------
  perform pg_temp.act_as(a);
  insert into public.entries (id, owner_id, entry_date, category, amount, note, method)
    values (e1::uuid, a::uuid, '2026-11-09', 'Rent', 9000, '[UPI] test', 'UPI');
  insert into public.plan_blocks (owner_id, block, payload) values (a::uuid, 'budget', '{"k":1}');
  select synced_at into t0 from public.entries where id = e1::uuid;
  raise notice 'PASS A can insert and read own entry and plan block';

  -- ---- A can update own row; server stamps synced_at forward -------------------
  update public.entries set note = '[UPI] edited', updated_at = now() + interval '1 minute' where id = e1::uuid;
  select synced_at into t1 from public.entries where id = e1::uuid;
  if not (t1 > t0) then raise exception 'FAIL synced_at did not move forward on update'; end if;
  raise notice 'PASS synced_at moves forward on update';

  -- ---- latest edit wins: an older write is ignored, newer and equal ones apply ---
  update public.entries set note = 'stale', updated_at = now() - interval '1 hour' where id = e1::uuid;
  get diagnostics n = row_count;
  if n <> 0 or (select note from public.entries where id = e1::uuid) is distinct from '[UPI] edited' then
    raise exception 'FAIL an older edit overwrote a newer one'; end if;
  insert into public.entries (id, owner_id, entry_date, category, amount, note, updated_at)
    values (e1::uuid, a::uuid, '2026-11-09', 'Rent', 9000, 'stale upsert', now() - interval '1 hour')
    on conflict (id) do update set note = excluded.note, updated_at = excluded.updated_at;
  if (select note from public.entries where id = e1::uuid) is distinct from '[UPI] edited' then
    raise exception 'FAIL an older upsert overwrote a newer edit'; end if;
  update public.entries set note = '[UPI] edited again', updated_at = (select updated_at from public.entries where id = e1::uuid) where id = e1::uuid;
  if (select note from public.entries where id = e1::uuid) is distinct from '[UPI] edited again' then
    raise exception 'FAIL an edit with an equal timestamp was refused'; end if;
  update public.entries set note = '[UPI] edited', updated_at = now() + interval '2 minutes' where id = e1::uuid;
  if (select note from public.entries where id = e1::uuid) is distinct from '[UPI] edited' then
    raise exception 'FAIL a newer edit was refused'; end if;
  raise notice 'PASS latest edit wins on the server (older ignored, equal and newer applied)';

  -- ---- A cannot hand a row to B, nor insert as B -------------------------------
  if not pg_temp.fails(format('update public.entries set owner_id = %L where id = %L', b, e1)) then
    raise exception 'FAIL A could change owner_id of own row to B'; end if;
  if not pg_temp.fails(format($q$insert into public.entries (id, owner_id, entry_date, category, amount) values (gen_random_uuid(), %L, '2026-11-09', 'Rent', 1)$q$, b)) then
    raise exception 'FAIL A could insert a row owned by B'; end if;
  if not pg_temp.fails(format($q$insert into public.plan_blocks (owner_id, block, payload) values (%L, 'planted', '{}')$q$, b)) then
    raise exception 'FAIL A could insert a plan block owned by B'; end if;
  if not pg_temp.fails(format($q$update public.plan_blocks set owner_id = %L where block = 'budget'$q$, b)) then
    raise exception 'FAIL A could hand a plan block to B'; end if;
  raise notice 'PASS A cannot create or hand over rows owned by B (entries and plan blocks)';

  -- ---- B sees and touches nothing of A's --------------------------------------
  perform pg_temp.act_as(b);
  if pg_temp.n('select 1 from public.entries') <> 0 then raise exception 'FAIL B can read A entries'; end if;
  if pg_temp.n('select 1 from public.plan_blocks') <> 0 then raise exception 'FAIL B can read A plan block'; end if;
  update public.entries set note = 'hacked' where id = e1::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL B updated A entry (% rows)', n; end if;
  delete from public.entries where id = e1::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL B deleted A entry (% rows)', n; end if;
  update public.plan_blocks set payload = '{"k":2}' where block = 'budget';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL B updated A plan block'; end if;
  delete from public.plan_blocks where block = 'budget';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL B deleted A plan block'; end if;
  raise notice 'PASS B cannot read, update or delete A rows';

  -- ---- B cannot overwrite A's rows through an upsert on the same key -------------
  if not pg_temp.fails(format($q$insert into public.entries (id, owner_id, entry_date, category, amount) values (%L, %L, '2026-11-09', 'Rent', 1)
      on conflict (id) do update set amount = excluded.amount, owner_id = excluded.owner_id$q$, e1, b)) then
    raise exception 'FAIL B upsert onto A row did not error'; end if;
  if not pg_temp.fails(format($q$insert into public.plan_blocks (owner_id, block, payload) values (%L, 'budget', '{"k":9}')
      on conflict (owner_id, block) do update set payload = excluded.payload, owner_id = %L$q$, a, b)) then
    raise exception 'FAIL B upsert onto A plan block did not error'; end if;
  raise notice 'PASS B cannot take over A rows by upsert';

  -- ---- B has a private space of their own -------------------------------------
  insert into public.entries (id, owner_id, entry_date, category, amount)
    values (e2::uuid, b::uuid, '2026-11-09', 'Groceries', 50);
  if pg_temp.n('select 1 from public.entries') <> 1 then raise exception 'FAIL B should see exactly own 1 row'; end if;
  raise notice 'PASS B sees only own rows';

  -- ---- A still sees only own, untouched rows ----------------------------------
  perform pg_temp.act_as(a);
  if pg_temp.n('select 1 from public.entries') <> 1 then raise exception 'FAIL A should see exactly own 1 row'; end if;
  if (select note from public.entries where id = e1::uuid) is distinct from '[UPI] edited' then raise exception 'FAIL A row was changed by someone else'; end if;
  if (select payload->>'k' from public.plan_blocks where block = 'budget') is distinct from '1' then raise exception 'FAIL A plan block was changed'; end if;
  if pg_temp.n('select 1 from public.plan_blocks') <> 1 then raise exception 'FAIL A should see exactly own 1 plan block'; end if;
  raise notice 'PASS A rows untouched';

  -- ---- anonymous visitors get nothing -----------------------------------------
  perform pg_temp.act_as(null);
  if not pg_temp.fails('select 1 from public.entries') then raise exception 'FAIL anon could select entries'; end if;
  if not pg_temp.fails(format($q$insert into public.entries (id, owner_id, entry_date, category, amount) values (gen_random_uuid(), %L, '2026-11-09', 'Rent', 1)$q$, a)) then
    raise exception 'FAIL anon could insert entry'; end if;
  if not pg_temp.fails('select 1 from public.plan_blocks') then raise exception 'FAIL anon could select plan blocks'; end if;
  if not pg_temp.fails(format($q$insert into public.plan_blocks (owner_id, block, payload) values (%L, 'anon', '{}')$q$, a)) then
    raise exception 'FAIL anon could insert a plan block'; end if;
  raise notice 'PASS anonymous role has no access';

  -- ---- signed-in role but no user id in the token: nothing ----------------------
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  set local role authenticated;
  if pg_temp.n('select 1 from public.entries') <> 0 then raise exception 'FAIL token without sub can read rows'; end if;
  if pg_temp.n('select 1 from public.plan_blocks') <> 0 then raise exception 'FAIL token without sub can read plan blocks'; end if;
  if not pg_temp.fails(format($q$insert into public.entries (id, owner_id, entry_date, category, amount) values (gen_random_uuid(), %L, '2026-11-09', 'Rent', 1)$q$, a)) then
    raise exception 'FAIL token without sub could insert'; end if;
  raise notice 'PASS token without a user id gets nothing';

  -- ---- data checks ------------------------------------------------------------
  perform pg_temp.act_as(a);
  if not pg_temp.fails(format($q$insert into public.entries (id, owner_id, entry_date, category, amount) values (gen_random_uuid(), %L, '2026-11-09', 'Rent', 0)$q$, a)) then
    raise exception 'FAIL amount 0 accepted'; end if;
  if not pg_temp.fails(format($q$insert into public.entries (id, owner_id, entry_date, category, amount) values (gen_random_uuid(), %L, '2026-11-09', 'Rent', -5)$q$, a)) then
    raise exception 'FAIL negative amount accepted'; end if;
  if not pg_temp.fails(format($q$insert into public.entries (id, owner_id, entry_date, category, amount, method) values (gen_random_uuid(), %L, '2026-11-09', 'Rent', 5, 'Bitcoin')$q$, a)) then
    raise exception 'FAIL unknown method accepted'; end if;
  if not pg_temp.fails(format($q$insert into public.entries (id, owner_id, entry_date, category, amount, note) values (gen_random_uuid(), %L, '2026-11-09', 'Rent', 5, repeat('x', 501))$q$, a)) then
    raise exception 'FAIL 501-character note accepted'; end if;
  if not pg_temp.fails(format($q$insert into public.entries (id, owner_id, entry_date, category, amount) values (gen_random_uuid(), %L, '2026-11-09', '', 5)$q$, a)) then
    raise exception 'FAIL empty category accepted'; end if;
  raise notice 'PASS bad amounts, methods, notes and categories are refused';

  raise notice 'ALL ACCESS TESTS PASSED';
end $$;

rollback;

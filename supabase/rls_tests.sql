-- Money Log, Releases 1 and 2 — access-rule tests.
--
-- HOW TO RUN: after schema.sql, paste this whole file into the Supabase SQL Editor and Run.
-- It creates throw-away users, groups and rows INSIDE a transaction and ends with ROLLBACK,
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
end $$;

-- =====================================================================================
-- Release 2: shared groups
-- Cast: A (group admin), B (member), C (stranger, never joins), D (joins later), plus 19 filler users for the size limit.
-- =====================================================================================
reset role;
-- helper: the error message a statement raises (empty when it succeeds)
create or replace function pg_temp.errmsg(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return '';
exception when others then
  return sqlerrm;
end $$;
grant execute on function pg_temp.errmsg(text) to public;

insert into auth.users (id) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd');

do $$
declare
  a constant text := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  b constant text := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  c constant text := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  d constant text := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  p1  constant text := '10000000-0000-4000-8000-000000000001';
  e1  constant text := '20000000-0000-4000-8000-000000000001';
  e2  constant text := '20000000-0000-4000-8000-000000000002';
  e3  constant text := '20000000-0000-4000-8000-000000000003';
  e4  constant text := '20000000-0000-4000-8000-000000000004';
  s1  constant text := '30000000-0000-4000-8000-000000000001';
  s2  constant text := '30000000-0000-4000-8000-000000000002';
  s3  constant text := '30000000-0000-4000-8000-000000000003';
  gid uuid; gid2 uuid; gid3 uuid; gid4 uuid; gid5 uuid; gid6 uuid;
  u1 constant text := '00000000-0000-4000-8000-000000000001';
  u2 constant text := '00000000-0000-4000-8000-000000000002';
  xx constant text := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  m1 text; m2 text;
  code text; code2 text; newcode text;
  n bigint;
  tbl text;
  fn text;
  pol record;
  i int;
  u text;
  rpc constant text[] := array['create_group(text,text,text)', 'join_group(text,text)', 'reset_invite(uuid)', 'leave_group(uuid)',
                               'remove_member(uuid,uuid)', 'make_admin(uuid,uuid)', 'set_display_name(uuid,text)'];
  internal constant text[] := array['group_balance(uuid,uuid)', 'was_group_member(uuid,uuid)', 'new_invite_code()',
                                    'validate_entry_group()', 'validate_settlement()', 'names_former_member(uuid,uuid,jsonb)', 'enforce_row_cap()'];
  helpers constant text[] := array['is_group_member(uuid)', 'is_group_admin(uuid)'];
  shared_row constant text := $q$insert into public.entries (id, owner_id, entry_date, category, amount, group_id, paid_by, shares)
                                 values (gen_random_uuid(), %L, '2026-11-09', 'Dinner', %s, %L, %L, %L::jsonb)$q$;
begin
  -- =========================================================================
  -- 1. STRUCTURE
  -- =========================================================================
  for tbl in select unnest(array['groups', 'group_members', 'group_invites']) loop
    if (select count(*) from pg_policies where schemaname = 'public' and tablename = tbl) <> 1
       or (select count(*) from pg_policies where schemaname = 'public' and tablename = tbl and cmd = 'SELECT') <> 1 then
      raise exception 'FAIL % must have exactly one policy, for SELECT', tbl;
    end if;
  end loop;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'settlements') <> 4
     or (select count(distinct cmd) from pg_policies where schemaname = 'public' and tablename = 'settlements') <> 4 then
    raise exception 'FAIL settlements needs one policy per command';
  end if;
  for pol in select * from pg_policies where schemaname = 'public' and tablename in ('groups', 'group_members', 'group_invites', 'settlements') loop
    if pol.roles::text <> '{authenticated}' or pol.permissive <> 'PERMISSIVE' then
      raise exception 'FAIL policy % must be permissive and for role authenticated only', pol.policyname;
    end if;
    if pol.cmd in ('SELECT', 'UPDATE', 'DELETE') and (pol.qual is null or position('is_group_' in pol.qual) = 0) then
      raise exception 'FAIL policy % does not restrict rows to group members (using: %)', pol.policyname, pol.qual;
    end if;
    if pol.cmd in ('INSERT', 'UPDATE') and (pol.with_check is null or position('created_by' in pol.with_check) = 0 or position('auth.uid()' in pol.with_check) = 0) then
      raise exception 'FAIL policy % does not tie new rows to the signed-in user (with check: %)', pol.policyname, pol.with_check;
    end if;
  end loop;
  -- entries: reading is widened to group members, writing is not
  if (select qual from pg_policies where schemaname = 'public' and tablename = 'entries' and cmd = 'SELECT') not like '%is_group_member%' then
    raise exception 'FAIL entries_select does not extend reading to group members'; end if;
  for pol in select * from pg_policies where schemaname = 'public' and tablename = 'entries' and cmd in ('INSERT', 'UPDATE', 'DELETE') loop
    if position('owner_id' in coalesce(pol.qual, '') || coalesce(pol.with_check, '')) = 0 then
      raise exception 'FAIL entries policy % lost its owner_id check', pol.policyname; end if;
    if position('is_group_member' in coalesce(pol.qual, '') || coalesce(pol.with_check, '')) = 0 then
      raise exception 'FAIL entries policy % does not require current membership for shared rows', pol.policyname; end if;
  end loop;
  raise notice 'PASS group policies: members-only reads, creator-only writes, owner check kept on entries';

  foreach tbl in array array['public.groups', 'public.group_members', 'public.group_invites', 'public.settlements'] loop
    if not (select relrowsecurity and relforcerowsecurity from pg_class where oid = tbl::regclass) then
      raise exception 'FAIL row-level security is not enabled and forced on %', tbl; end if;
    if has_table_privilege('anon', tbl, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      raise exception 'FAIL role anon holds a privilege on %', tbl; end if;
    if has_table_privilege('authenticated', tbl, 'TRUNCATE,REFERENCES,TRIGGER') then
      raise exception 'FAIL role authenticated holds TRUNCATE, REFERENCES or TRIGGER on %', tbl; end if;
    if not has_table_privilege('authenticated', tbl, 'SELECT') then
      raise exception 'FAIL role authenticated cannot select %', tbl; end if;
  end loop;
  foreach tbl in array array['public.groups', 'public.group_members', 'public.group_invites'] loop
    if has_table_privilege('authenticated', tbl, 'INSERT,UPDATE,DELETE') then
      raise exception 'FAIL role authenticated can write % directly; it must go through the functions', tbl; end if;
  end loop;
  raise notice 'PASS group tables: row-level security forced, anon locked out, group tables are read-only to users';

  foreach fn in array rpc || internal || helpers loop
    if has_function_privilege('anon', ('public.' || fn)::regprocedure, 'EXECUTE') then
      raise exception 'FAIL anon can execute %', fn; end if;
    if has_function_privilege('public', ('public.' || fn)::regprocedure, 'EXECUTE') then
      raise exception 'FAIL everyone (public) can execute %', fn; end if;
    if not (select exists (select 1 from pg_proc p, unnest(p.proconfig) cfg
                            where p.oid = ('public.' || fn)::regprocedure and cfg like 'search_path=%')) then
      raise exception 'FAIL % does not pin its search_path', fn; end if;
  end loop;
  foreach fn in array rpc || helpers loop
    if not has_function_privilege('authenticated', ('public.' || fn)::regprocedure, 'EXECUTE') then
      raise exception 'FAIL authenticated cannot execute %', fn; end if;
  end loop;
  foreach fn in array internal loop
    if has_function_privilege('authenticated', ('public.' || fn)::regprocedure, 'EXECUTE') then
      raise exception 'FAIL authenticated can execute internal function %', fn; end if;
  end loop;
  if not (select prosecdef from pg_proc where oid = 'public.group_balance(uuid,uuid)'::regprocedure)
     or not (select exists (select 1 from pg_proc p, unnest(p.proconfig) cfg where p.oid = 'public.group_balance(uuid,uuid)'::regprocedure and cfg = 'row_security=off')) then
    raise exception 'FAIL group_balance must be security definer with row_security off'; end if;
  raise notice 'PASS functions: anon and public cannot run any; users run only the app functions; search_path pinned';

  if (select count(*) from pg_trigger where not tgisinternal and tgname in
        ('entries_validate_group', 'settlements_validate', 'settlements_touch_synced_at', 'settlements_keep_latest_edit', 'entries_cap', 'settlements_cap')) <> 6 then
    raise exception 'FAIL group validation, row-cap or sync triggers are missing'; end if;
  foreach fn in array array['leave_group', 'remove_member', 'make_admin', 'join_group'] loop
    if not exists (select 1 from pg_proc p where p.proname = fn and p.pronamespace = 'public'::regnamespace
                    and position('for update' in p.prosrc) > 0 and position('public.groups g' in p.prosrc) > 0) then
      raise exception 'FAIL % does not lock the group row before changing membership', fn; end if;
  end loop;
  raise notice 'PASS group triggers present; membership changes lock the group';

  -- the group functions read membership across users, so their owner must be a role that row-level security does not
  -- apply to (Supabase's postgres role is one); otherwise they would silently see too little, or recurse
  if not (select r.rolbypassrls or r.rolsuper from pg_proc p join pg_roles r on r.oid = p.proowner
           where p.oid = 'public.is_group_member(uuid)'::regprocedure) then
    raise exception 'FAIL the group functions are owned by a role that does not bypass row-level security. Run schema.sql as the postgres role (the SQL Editor does).';
  end if;
  raise notice 'PASS group functions are owned by a role that bypasses row-level security';

  -- =========================================================================
  -- 2. BEHAVIOUR: creating, joining
  -- =========================================================================
  perform pg_temp.act_as(a);
  gid := public.create_group('Home', 'family', 'Asha');
  if pg_temp.n('select 1 from public.groups') <> 1 or pg_temp.n('select 1 from public.group_members') <> 1
     or pg_temp.n('select 1 from public.group_invites') <> 1 then
    raise exception 'FAIL A should see own new group, membership and invite'; end if;
  if (select role from public.group_members where group_id = gid and user_id = a::uuid) <> 'admin' then
    raise exception 'FAIL creator is not admin'; end if;
  select i.code into code from public.group_invites i where i.group_id = gid;
  raise notice 'PASS A creates a group and becomes its admin';

  perform pg_temp.act_as(b);
  if pg_temp.n('select 1 from public.groups') <> 0 or pg_temp.n('select 1 from public.group_members') <> 0
     or pg_temp.n('select 1 from public.group_invites') <> 0 or pg_temp.n('select 1 from public.settlements') <> 0 then
    raise exception 'FAIL B (not a member) can see group data'; end if;
  if not pg_temp.fails($q$select public.join_group('000000000000', 'Ravi')$q$) then raise exception 'FAIL B joined with a made-up code'; end if;
  if not pg_temp.fails($q$select public.join_group('', 'Ravi')$q$) then raise exception 'FAIL B joined with an empty code'; end if;
  if not pg_temp.fails(format($q$select public.join_group(%L, '')$q$, code)) then raise exception 'FAIL B joined without a display name'; end if;
  if not pg_temp.fails(format($q$insert into public.group_members (group_id, user_id, display_name) values (%L, %L, 'Ravi')$q$, gid, b)) then
    raise exception 'FAIL B added self to group_members directly'; end if;
  if not pg_temp.fails(format($q$update public.groups set name = 'mine' where id = %L$q$, gid)) then raise exception 'FAIL B updated a group directly'; end if;
  if not pg_temp.fails(format($q$insert into public.group_invites (group_id, code, expires_at) values (%L, 'abcdefabcdef', now() + interval '1 day') on conflict (group_id) do update set code = excluded.code$q$, gid)) then
    raise exception 'FAIL B wrote an invite directly'; end if;
  if not pg_temp.fails($q$insert into public.groups (name, kind) values ('x', 'trip')$q$) then raise exception 'FAIL B inserted a group directly'; end if;
  raise notice 'PASS a stranger sees nothing and cannot join or write group tables';

  -- the code is accepted with dashes and capitals; B becomes a plain member who cannot see the code
  perform public.join_group(upper(substr(code, 1, 4) || '-' || substr(code, 5, 4) || '-' || substr(code, 9, 4)), 'Ravi');
  if pg_temp.n('select 1 from public.groups') <> 1 or pg_temp.n('select 1 from public.group_members') <> 2 then
    raise exception 'FAIL B should see the group and 2 members after joining'; end if;
  if pg_temp.n('select 1 from public.group_invites') <> 0 then raise exception 'FAIL a plain member can read the invite code'; end if;
  if (select role from public.group_members where group_id = gid and user_id = b::uuid) <> 'member' then raise exception 'FAIL joiner is not a plain member'; end if;
  if not pg_temp.fails(format($q$update public.group_members set role = 'admin' where group_id = %L and user_id = %L$q$, gid, b)) then
    raise exception 'FAIL B promoted self'; end if;
  if not pg_temp.fails(format($q$select public.reset_invite(%L)$q$, gid)) then raise exception 'FAIL a member reset the invite'; end if;
  if not pg_temp.fails(format($q$select public.make_admin(%L, %L)$q$, gid, b)) then raise exception 'FAIL a member made someone admin'; end if;
  if not pg_temp.fails(format($q$select public.remove_member(%L, %L)$q$, gid, a)) then raise exception 'FAIL a member removed the admin'; end if;
  raise notice 'PASS B joins by code (any case, with dashes), sees members but not the code, cannot use admin functions';

  -- expired and reset codes
  reset role;
  update public.group_invites set expires_at = now() - interval '1 minute' where group_id = gid;
  perform pg_temp.act_as(d);
  if not pg_temp.fails(format($q$select public.join_group(%L, 'Dev')$q$, code)) then raise exception 'FAIL D joined with an expired code'; end if;
  perform pg_temp.act_as(a);
  newcode := public.reset_invite(gid);
  if newcode = code or newcode !~ '^[0-9a-f]{12}$' then raise exception 'FAIL reset_invite did not make a fresh code'; end if;
  perform pg_temp.act_as(d);
  if not pg_temp.fails(format($q$select public.join_group(%L, 'Dev')$q$, code)) then raise exception 'FAIL D joined with the replaced code'; end if;
  raise notice 'PASS an expired or replaced code stops working; an admin can reset it';
  code := newcode;

  -- =========================================================================
  -- 3. BEHAVIOUR: shared expenses
  -- =========================================================================
  perform pg_temp.act_as(a);
  insert into public.entries (id, owner_id, entry_date, category, amount, group_id, paid_by, shares)
    values (e1::uuid, a::uuid, '2026-11-09', 'Dinner', 100, gid, a::uuid, jsonb_build_object(a, 50, b, 50));
  insert into public.entries (id, owner_id, entry_date, category, amount) values (p1::uuid, a::uuid, '2026-11-09', 'Rent', 9000);

  perform pg_temp.act_as(b);
  if pg_temp.n(format('select 1 from public.entries where id = %L', e1)) <> 1 then raise exception 'FAIL member B cannot read the shared expense'; end if;
  if pg_temp.n(format('select 1 from public.entries where id = %L', p1)) <> 0 then raise exception 'FAIL member B can read A private entry'; end if;
  update public.entries set note = 'hacked' where id = e1::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL B edited A shared expense'; end if;
  delete from public.entries where id = e1::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL B deleted A shared expense'; end if;
  if not pg_temp.fails(format($q$insert into public.entries (id, owner_id, entry_date, category, amount, group_id, paid_by, shares)
      values (gen_random_uuid(), %L, '2026-11-09', 'Dinner', 10, %L, %L, %L::jsonb)$q$, a, gid, a, jsonb_build_object(a, 10)::text)) then
    raise exception 'FAIL B created a shared expense in A name'; end if;
  if not pg_temp.fails(format($q$insert into public.entries (id, owner_id, entry_date, category, amount, group_id, paid_by, shares)
      values (%L, %L, '2026-11-09', 'Dinner', 1, %L, %L, %L::jsonb) on conflict (id) do update set amount = excluded.amount$q$,
      e1, b, gid, b, jsonb_build_object(b, 1)::text)) then
    raise exception 'FAIL B took over A shared expense by upsert'; end if;
  raise notice 'PASS a member reads shared expenses but cannot read private ones, or edit, delete or take over A rows';

  perform pg_temp.act_as(c);
  if pg_temp.n('select 1 from public.entries') <> 0 then raise exception 'FAIL stranger C can read entries'; end if;
  if not pg_temp.fails(format(shared_row, c, 10, gid, c, jsonb_build_object(c, 10)::text)) then
    raise exception 'FAIL stranger C wrote into the group'; end if;
  raise notice 'PASS a stranger sees no entries and cannot write into the group';

  -- validation of shared expenses (as A)
  perform pg_temp.act_as(a);
  if not pg_temp.fails(format(shared_row, a, 100, gid, a, jsonb_build_object(a, 50, b, 40)::text)) then raise exception 'FAIL shares that do not add up were accepted'; end if;
  if not pg_temp.fails(format(shared_row, a, 100, gid, a, jsonb_build_object(a, 50, c, 50)::text)) then raise exception 'FAIL a share for a non-member was accepted'; end if;
  if not pg_temp.fails(format(shared_row, a, 100, gid, c, jsonb_build_object(a, 100)::text)) then raise exception 'FAIL a non-member payer was accepted'; end if;
  if not pg_temp.fails(format(shared_row, a, 100, gid, a, '[50,50]')) then raise exception 'FAIL shares given as a list were accepted'; end if;
  if not pg_temp.fails(format(shared_row, a, 100, gid, a, jsonb_build_object(a, 150, b, -50)::text)) then raise exception 'FAIL a negative share was accepted'; end if;
  if not pg_temp.fails(format(shared_row, a, 100, gid, a, jsonb_build_object(a, 50.001, b, 49.999)::text)) then raise exception 'FAIL a share with 3 decimals was accepted'; end if;
  if not pg_temp.fails(format(shared_row, a, 100, gid, a, '{"not-a-user": 100}')) then raise exception 'FAIL a share keyed by a non-uuid was accepted'; end if;
  if not pg_temp.fails(format(shared_row, a, 100, gid, a, jsonb_build_object(upper(a), 100)::text)) then raise exception 'FAIL an upper-case user id key was accepted'; end if;
  if not pg_temp.fails(format(shared_row, a, 100, gid, a, '{"' || a || '": "100"}')) then raise exception 'FAIL a share given as text was accepted'; end if;
  if not pg_temp.fails(format($q$insert into public.entries (id, owner_id, entry_date, category, amount, shares) values (gen_random_uuid(), %L, '2026-11-09', 'Rent', 5, %L::jsonb)$q$, a, jsonb_build_object(a, 5)::text)) then
    raise exception 'FAIL a private entry with shares was accepted'; end if;
  if not pg_temp.fails(format($q$insert into public.entries (id, owner_id, entry_date, category, amount, paid_by) values (gen_random_uuid(), %L, '2026-11-09', 'Rent', 5, %L)$q$, a, a)) then
    raise exception 'FAIL a private entry with paid_by was accepted'; end if;
  if not pg_temp.fails(format($q$insert into public.entries (id, owner_id, entry_date, category, amount, group_id) values (gen_random_uuid(), %L, '2026-11-09', 'Rent', 5, %L)$q$, a, gid)) then
    raise exception 'FAIL a shared expense without paid_by and shares was accepted'; end if;
  -- an edit that breaks the sum is refused too
  if not pg_temp.fails(format($q$update public.entries set amount = 120 where id = %L$q$, e1)) then raise exception 'FAIL editing the amount without the shares was accepted'; end if;
  update public.entries set amount = 120, shares = jsonb_build_object(a, 60, b, 60), updated_at = now() + interval '1 minute' where id = e1::uuid;
  update public.entries set amount = 100, shares = jsonb_build_object(a, 50, b, 50), updated_at = now() + interval '2 minutes' where id = e1::uuid;
  raise notice 'PASS shared expenses must name members, add up to the amount, and stay consistent through edits';

  -- A is not in B's own group; A cannot move a private entry into it, and cannot read it
  perform pg_temp.act_as(b);
  gid2 := public.create_group('Goa trip', 'trip', 'Ravi');
  insert into public.entries (id, owner_id, entry_date, category, amount, group_id, paid_by, shares)
    values (e3::uuid, b::uuid, '2026-11-09', 'Travel', 10, gid2, b::uuid, jsonb_build_object(b, 10));
  perform pg_temp.act_as(a);
  if pg_temp.n(format('select 1 from public.entries where group_id = %L', gid2)) <> 0 then raise exception 'FAIL A can read a group A is not in'; end if;
  if not pg_temp.fails(format($q$update public.entries set group_id = %L, paid_by = %L, shares = %L::jsonb where id = %L$q$, gid2, b, jsonb_build_object(b, 9000)::text, p1)) then
    raise exception 'FAIL A moved a private entry into a group A is not in'; end if;
  if not pg_temp.fails(format(shared_row, a, 10, gid2, b, jsonb_build_object(b, 10)::text)) then raise exception 'FAIL A wrote into a group A is not in'; end if;
  raise notice 'PASS groups are separate: a member of one cannot read or write another';

  -- B's own shared expense in the family group
  perform pg_temp.act_as(b);
  insert into public.entries (id, owner_id, entry_date, category, amount, group_id, paid_by, shares)
    values (e2::uuid, b::uuid, '2026-11-09', 'Groceries', 60, gid, b::uuid, jsonb_build_object(a, 30, b, 30));
  perform pg_temp.act_as(a);
  if pg_temp.n(format('select 1 from public.entries where id = %L', e2)) <> 1 then raise exception 'FAIL A cannot read B shared expense'; end if;
  update public.entries set note = 'hacked' where id = e2::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL A edited B shared expense'; end if;
  raise notice 'PASS each member edits only the expenses they created';

  -- =========================================================================
  -- 4. BEHAVIOUR: settlements and balances
  -- =========================================================================
  reset role;
  -- E1: A paid 100 split 50/50. E2: B paid 60 split 30/30. Net: A +20, B -20.
  if public.group_balance(gid, a::uuid) <> 20 or public.group_balance(gid, b::uuid) <> -20 then
    raise exception 'FAIL balances are % and %, expected 20 and -20', public.group_balance(gid, a::uuid), public.group_balance(gid, b::uuid); end if;
  raise notice 'PASS balances add up (A +20, B -20)';

  perform pg_temp.act_as(b);
  insert into public.settlements (id, group_id, from_user, to_user, amount, settle_date) values (s1::uuid, gid, b::uuid, a::uuid, 15, '2026-11-09');
  if (select created_by from public.settlements where id = s1::uuid) <> b::uuid then raise exception 'FAIL created_by was not the signed-in user'; end if;
  if not pg_temp.fails(format($q$insert into public.settlements (id, group_id, from_user, to_user, amount, settle_date) values (gen_random_uuid(), %L, %L, %L, 5, '2026-11-09')$q$, gid, a, c)) then
    raise exception 'FAIL B recorded a settlement between A and a stranger'; end if;
  if not pg_temp.fails(format($q$insert into public.settlements (id, group_id, from_user, to_user, amount, settle_date, created_by) values (gen_random_uuid(), %L, %L, %L, 5, '2026-11-09', %L)$q$, gid, b, a, a)) then
    raise exception 'FAIL B recorded a settlement in A name'; end if;
  if not pg_temp.fails(format($q$insert into public.settlements (id, group_id, from_user, to_user, amount, settle_date) values (gen_random_uuid(), %L, %L, %L, 5, '2026-11-09')$q$, gid, b, b)) then
    raise exception 'FAIL a settlement from someone to themselves was accepted'; end if;
  if not pg_temp.fails(format($q$insert into public.settlements (id, group_id, from_user, to_user, amount, settle_date) values (gen_random_uuid(), %L, %L, %L, 0, '2026-11-09')$q$, gid, b, a)) then
    raise exception 'FAIL a zero settlement was accepted'; end if;
  perform pg_temp.act_as(a);
  if pg_temp.n('select 1 from public.settlements') <> 1 then raise exception 'FAIL A cannot read B settlement'; end if;
  update public.settlements set amount = 1 where id = s1::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL A edited a settlement B recorded'; end if;
  delete from public.settlements where id = s1::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL A deleted a settlement B recorded'; end if;
  perform pg_temp.act_as(c);
  if pg_temp.n('select 1 from public.settlements') <> 0 then raise exception 'FAIL stranger C can read settlements'; end if;
  if not pg_temp.fails(format($q$insert into public.settlements (id, group_id, from_user, to_user, amount, settle_date) values (gen_random_uuid(), %L, %L, %L, 5, '2026-11-09')$q$, gid, c, a)) then
    raise exception 'FAIL stranger C recorded a settlement'; end if;
  raise notice 'PASS settlements: only a party to it records it, members read it, only its creator changes it';

  -- leaving needs a zero balance
  reset role;
  if public.group_balance(gid, b::uuid) <> -5 then raise exception 'FAIL B balance should be -5, is %', public.group_balance(gid, b::uuid); end if;
  perform pg_temp.act_as(b);
  if not pg_temp.fails(format($q$select public.leave_group(%L)$q$, gid)) then raise exception 'FAIL B left with an unsettled balance'; end if;
  insert into public.settlements (id, group_id, from_user, to_user, amount, settle_date) values (s2::uuid, gid, b::uuid, a::uuid, 5, '2026-11-09');
  perform public.leave_group(gid);
  if pg_temp.n('select 1 from public.groups') <> 1 then raise exception 'FAIL B should still see the Goa trip group only'; end if;
  if pg_temp.n(format('select 1 from public.group_members where group_id = %L', gid)) <> 0
     or pg_temp.n(format('select 1 from public.settlements where group_id = %L', gid)) <> 0
     or pg_temp.n(format('select 1 from public.entries where group_id = %L and owner_id <> %L', gid, b)) <> 0 then
    raise exception 'FAIL B still sees the family group after leaving'; end if;
  if pg_temp.n(format('select 1 from public.entries where id = %L', e2)) <> 1 then raise exception 'FAIL B should still read the expense B created'; end if;
  update public.entries set note = 'after leaving', updated_at = now() + interval '5 minutes' where id = e2::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL B edited a shared expense after leaving'; end if;
  if not pg_temp.fails(format(shared_row, b, 5, gid, b, jsonb_build_object(b, 5)::text)) then raise exception 'FAIL B added a shared expense after leaving'; end if;
  if not pg_temp.fails(format($q$insert into public.settlements (id, group_id, from_user, to_user, amount, settle_date) values (gen_random_uuid(), %L, %L, %L, 5, '2026-11-09')$q$, gid, b, a)) then
    raise exception 'FAIL B recorded a settlement after leaving'; end if;
  perform pg_temp.act_as(a);
  if pg_temp.n(format('select 1 from public.entries where id = %L', e2)) <> 1 then raise exception 'FAIL A lost sight of the expense B created before leaving'; end if;
  -- nobody can pile a new debt on someone who has left, but an old expense naming them stays editable by its creator
  if not pg_temp.fails(format(shared_row, a, 100, gid, a, jsonb_build_object(a, 50, b, 50)::text)) then raise exception 'FAIL a new expense named a member who has left'; end if;
  if not pg_temp.fails(format(shared_row, a, 100, gid, b, jsonb_build_object(a, 100)::text)) then raise exception 'FAIL a member who has left was named as payer of a new expense'; end if;
  if not pg_temp.fails(format($q$insert into public.settlements (id, group_id, from_user, to_user, amount, settle_date) values (gen_random_uuid(), %L, %L, %L, 5, '2026-11-09')$q$, gid, b, a)) then
    raise exception 'FAIL a settlement named a member who has left'; end if;
  update public.entries set note = 'still editable', updated_at = now() + interval '10 minutes' where id = e1::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL A could not edit the note of an old expense that names a member who has left'; end if;
  if not pg_temp.fails(format($q$update public.entries set amount = 120, shares = %L::jsonb, updated_at = now() + interval '11 minutes' where id = %L$q$, jsonb_build_object(a, 60, b, 60)::text, e1)) then
    raise exception 'FAIL A changed an old expense so that it still names a member who has left'; end if;
  -- but its amount, people and deletion are frozen: they would silently change the balance of someone who cannot see the group
  if not pg_temp.fails(format($q$update public.entries set deleted_at = now(), updated_at = now() + interval '20 minutes' where id = %L$q$, e1)) then
    raise exception 'FAIL an expense naming a member who has left was deleted'; end if;
  if not pg_temp.fails(format($q$update public.entries set shares = %L::jsonb, updated_at = now() + interval '21 minutes' where id = %L$q$, jsonb_build_object(a, 100)::text, e1)) then
    raise exception 'FAIL the share of a member who has left was reassigned'; end if;
  if not pg_temp.fails(format($q$delete from public.entries where id = %L$q$, e1)) then
    raise exception 'FAIL an expense naming a member who has left was hard-deleted'; end if;
  raise notice 'PASS leaving needs a zero balance; the leaver loses the group but the old expenses stay for the others';

  -- rejoining with the current code works and restores access
  perform pg_temp.act_as(b);
  perform public.join_group(code, 'Ravi again');
  if pg_temp.n(format('select 1 from public.group_members where group_id = %L and left_at is null', gid)) <> 2 then raise exception 'FAIL B could not rejoin'; end if;
  if (select display_name from public.group_members where group_id = gid and user_id = b::uuid) <> 'Ravi again' then raise exception 'FAIL rejoin kept the old name'; end if;
  perform public.set_display_name(gid, 'Ravi');
  raise notice 'PASS a member can rejoin with the current code and rename themself';

  -- the only admin cannot walk away from a group that still has people in it
  perform pg_temp.act_as(a);
  if not pg_temp.fails(format($q$select public.leave_group(%L)$q$, gid)) then raise exception 'FAIL the only admin left a group with members'; end if;
  perform public.make_admin(gid, b::uuid);
  perform public.leave_group(gid);
  perform pg_temp.act_as(b);
  if (select role from public.group_members where group_id = gid and user_id = b::uuid) <> 'admin' then raise exception 'FAIL B is not admin'; end if;
  if pg_temp.n(format('select 1 from public.group_invites where group_id = %L', gid)) <> 1 then raise exception 'FAIL new admin B cannot read the invite'; end if;
  perform pg_temp.act_as(a);
  if pg_temp.n(format('select 1 from public.groups where id = %L', gid)) <> 0 then raise exception 'FAIL A still sees the group after leaving'; end if;
  raise notice 'PASS the last admin must hand over before leaving';

  -- =========================================================================
  -- 5. BEHAVIOUR: removing a member
  -- =========================================================================
  perform pg_temp.act_as(a);
  gid3 := public.create_group('Flat', 'family', 'Asha');
  select i.code into code2 from public.group_invites i where i.group_id = gid3;
  perform pg_temp.act_as(d);
  perform public.join_group(code2, 'Dev');
  perform pg_temp.act_as(a);
  insert into public.entries (id, owner_id, entry_date, category, amount, group_id, paid_by, shares)
    values (e4::uuid, a::uuid, '2026-11-09', 'Rent', 100, gid3, a::uuid, jsonb_build_object(a, 50, d, 50));
  if not pg_temp.fails(format($q$select public.remove_member(%L, %L)$q$, gid3, d)) then raise exception 'FAIL A removed D who owes money'; end if;
  if not pg_temp.fails(format($q$select public.remove_member(%L, %L)$q$, gid3, a)) then raise exception 'FAIL an admin removed themself with remove_member'; end if;
  insert into public.settlements (id, group_id, from_user, to_user, amount, settle_date) values (s3::uuid, gid3, d::uuid, a::uuid, 50, '2026-11-09');
  perform public.remove_member(gid3, d::uuid);
  perform pg_temp.act_as(d);
  if pg_temp.n('select 1 from public.group_members where group_id = ' || quote_literal(gid3)) <> 0 then raise exception 'FAIL D still sees group 3 after removal'; end if;
  if not pg_temp.fails(format($q$select public.join_group(%L, 'Dev')$q$, code2)) then raise exception 'FAIL D rejoined with the code known before removal'; end if;
  -- what involved the removed member is frozen too
  perform pg_temp.act_as(a);
  if not pg_temp.fails(format($q$update public.settlements set deleted_at = now(), updated_at = now() + interval '30 minutes' where id = %L$q$, s3)) then
    raise exception 'FAIL a settlement with a removed member was deleted'; end if;
  if not pg_temp.fails(format($q$delete from public.settlements where id = %L$q$, s3)) then
    raise exception 'FAIL a settlement with a removed member was hard-deleted'; end if;
  if not pg_temp.fails(format($q$update public.entries set deleted_at = now(), updated_at = now() + interval '30 minutes' where id = %L$q$, e4)) then
    raise exception 'FAIL an expense naming a removed member was deleted'; end if;
  update public.entries set note = 'just a note', updated_at = now() + interval '31 minutes' where id = e4::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL the note of an expense naming a removed member could not be edited'; end if;
  raise notice 'PASS removing a member needs a zero balance and replaces the invite code; what involved them is frozen';

  -- coming back is as a plain member, even for a former admin; a group with no admin is taken over by the next joiner
  perform pg_temp.act_as(a);
  gid5 := public.create_group('Club', 'trip', 'Asha');
  select i.code into code2 from public.group_invites i where i.group_id = gid5;
  perform pg_temp.act_as(d);
  perform public.join_group(code2, 'Dev');
  perform pg_temp.act_as(a);
  perform public.make_admin(gid5, d::uuid);
  perform pg_temp.act_as(d);
  perform public.leave_group(gid5);
  perform public.join_group(code2, 'Dev back');
  if (select role from public.group_members where group_id = gid5 and user_id = d::uuid) <> 'member' then
    raise exception 'FAIL a former admin came back as admin'; end if;
  perform pg_temp.act_as(a);
  gid6 := public.create_group('Short-lived', 'trip', 'Asha');
  select i.code into code2 from public.group_invites i where i.group_id = gid6;
  perform public.leave_group(gid6);
  perform pg_temp.act_as(d);
  perform public.join_group(code2, 'Dev');
  if (select role from public.group_members where group_id = gid6 and user_id = d::uuid) <> 'admin' then
    raise exception 'FAIL the first joiner of a group with no admin did not become admin'; end if;
  raise notice 'PASS a returning member is a plain member; a group left without an admin is taken over by the next joiner';

  -- =========================================================================
  -- 6. LIMITS
  -- =========================================================================
  reset role;
  for i in 1..19 loop
    insert into auth.users (id) values (('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid);
  end loop;
  perform pg_temp.act_as(a);
  gid4 := public.create_group('Big group', 'trip', 'Asha');
  select i.code into code2 from public.group_invites i where i.group_id = gid4;
  for i in 1..19 loop
    perform pg_temp.act_as('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'));
    perform public.join_group(code2, 'Member ' || i);
  end loop;
  -- a member cannot record a payment between two OTHER people
  perform pg_temp.act_as('00000000-0000-4000-8000-000000000001');
  if not pg_temp.fails(format($q$insert into public.settlements (id, group_id, from_user, to_user, amount, settle_date) values (gen_random_uuid(), %L, %L, '00000000-0000-4000-8000-000000000002', 5, '2026-11-09')$q$, gid4, a)) then
    raise exception 'FAIL a member recorded a settlement between two other people'; end if;
  -- nor an expense between two other people: the person recording it must have paid or must share in it
  perform pg_temp.act_as(u1);
  if not pg_temp.fails(format(shared_row, u1, 50, gid4, a, jsonb_build_object(u2, 50)::text)) then
    raise exception 'FAIL a member recorded an expense between two other people'; end if;
  perform pg_temp.act_as(u1);
  insert into public.entries (id, owner_id, entry_date, category, amount, group_id, paid_by, shares)
    values (gen_random_uuid(), u1::uuid, '2026-11-09', 'Dinner', 50, gid4, u1::uuid, jsonb_build_object(u2, 50));
  insert into public.entries (id, owner_id, entry_date, category, amount, group_id, paid_by, shares)
    values (gen_random_uuid(), u1::uuid, '2026-11-09', 'Dinner', 50, gid4, a::uuid, jsonb_build_object(u1, 25, u2, 25));
  perform pg_temp.act_as(c);
  if not pg_temp.fails(format($q$select public.join_group(%L, 'Cee')$q$, code2)) then raise exception 'FAIL a 21st person joined a group of 20'; end if;
  perform pg_temp.act_as(a);
  reset role;
  n := (select count(*) from public.groups where created_by = a::uuid);
  perform pg_temp.act_as(a);
  for i in (n + 1)..10 loop perform public.create_group('Extra ' || i, 'trip', 'Asha'); end loop;
  if not pg_temp.fails($q$select public.create_group('One too many', 'trip', 'Asha')$q$) then raise exception 'FAIL an 11th group was created'; end if;
  raise notice 'PASS a group holds at most 20 people; one person creates at most 10 groups';

  -- =========================================================================
  -- 6b. A STRANGER LEARNS NOTHING ABOUT WHO IS IN A GROUP, AND CANNOT FILL THE DATABASE
  -- =========================================================================
  perform pg_temp.act_as(c);
  m1 := pg_temp.errmsg(format(shared_row, c, 10, gid3, a, jsonb_build_object(c, 10)::text));       -- payer is a member
  m2 := pg_temp.errmsg(format(shared_row, c, 10, gid3, c, jsonb_build_object(c, 10)::text));       -- payer is not
  if m1 = '' or m1 <> m2 then raise exception 'FAIL a stranger can tell members from non-members by the error (% / %)', m1, m2; end if;
  m1 := pg_temp.errmsg(format($q$insert into public.settlements (id, group_id, from_user, to_user, amount, settle_date) values (gen_random_uuid(), %L, %L, %L, 5, '2026-11-09')$q$, gid4, u1, u2));
  m2 := pg_temp.errmsg(format($q$insert into public.settlements (id, group_id, from_user, to_user, amount, settle_date) values (gen_random_uuid(), %L, %L, %L, 5, '2026-11-09')$q$, gid4, c, u2));
  if m1 = '' or m1 <> m2 then raise exception 'FAIL a stranger can tell members from non-members through settlements (% / %)', m1, m2; end if;
  if not pg_temp.fails(format($q$insert into public.plan_blocks (owner_id, block, payload) values (%L, 'junk', '{}')$q$, c)) then
    raise exception 'FAIL an unknown plan block name was accepted'; end if;
  raise notice 'PASS a stranger cannot learn who is in a group, nor store unknown blocks';

  -- row caps (the cap triggers are switched off only while the bulk rows are loaded, then back on)
  reset role;
  perform set_config('request.jwt.claims', '', true); -- act as the database owner (no signed-in user) while loading bulk rows
  insert into auth.users (id) values (xx::uuid);
  alter table public.entries disable trigger entries_cap;
  insert into public.entries (id, owner_id, entry_date, category, amount)
    select ('90000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, xx::uuid, '2026-11-09', 'Bulk', 1 from generate_series(1, 20000) g;
  alter table public.entries enable trigger entries_cap;
  perform pg_temp.act_as(xx);
  if not pg_temp.fails(format($q$insert into public.entries (id, owner_id, entry_date, category, amount) values (gen_random_uuid(), %L, '2026-11-09', 'One more', 1)$q$, xx)) then
    raise exception 'FAIL the 20,001st entry of one account was accepted'; end if;
  insert into public.entries (id, owner_id, entry_date, category, amount, note, updated_at)
    values ('90000000-0000-4000-8000-000000000001', xx::uuid, '2026-11-09', 'Bulk', 1, 'still editable', now() + interval '1 hour')
    on conflict (id) do update set note = excluded.note, updated_at = excluded.updated_at;
  if (select note from public.entries where id = '90000000-0000-4000-8000-000000000001') <> 'still editable' then
    raise exception 'FAIL an account at its cap could not edit an existing entry'; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  alter table public.settlements disable trigger settlements_cap;
  insert into public.settlements (id, group_id, from_user, to_user, amount, settle_date, created_by)
    select ('91000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, gid4, u1::uuid, a::uuid, 1, '2026-11-09', a::uuid from generate_series(1, 2000) g;
  alter table public.settlements enable trigger settlements_cap;
  perform pg_temp.act_as(a);
  if not pg_temp.fails(format($q$insert into public.settlements (id, group_id, from_user, to_user, amount, settle_date) values (gen_random_uuid(), %L, %L, %L, 1, '2026-11-09')$q$, gid4, u1, a)) then
    raise exception 'FAIL the 2,001st settlement of one account was accepted'; end if;
  raise notice 'PASS one account cannot store more than 20,000 entries or 2,000 settlements';

  -- =========================================================================
  -- 7. ANONYMOUS AND TOKEN-WITHOUT-USER
  -- =========================================================================
  perform pg_temp.act_as(null);
  foreach tbl in array array['groups', 'group_members', 'group_invites', 'settlements'] loop
    if not pg_temp.fails('select 1 from public.' || tbl) then raise exception 'FAIL anon could select %', tbl; end if;
  end loop;
  if not pg_temp.fails($q$select public.create_group('anon', 'trip', 'x')$q$) then raise exception 'FAIL anon created a group'; end if;
  if not pg_temp.fails(format($q$select public.join_group(%L, 'x')$q$, code)) then raise exception 'FAIL anon joined a group'; end if;
  if not pg_temp.fails($q$select public.is_group_member('00000000-0000-4000-8000-000000000001')$q$) then raise exception 'FAIL anon ran a helper function'; end if;
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  set local role authenticated;
  if not pg_temp.fails($q$select public.create_group('ghost', 'trip', 'x')$q$) then raise exception 'FAIL a token without a user id created a group'; end if;
  if pg_temp.n('select 1 from public.groups') <> 0 or pg_temp.n('select 1 from public.entries') <> 0 then raise exception 'FAIL a token without a user id can read group data'; end if;
  raise notice 'PASS anonymous visitors and user-less tokens get nothing';

  raise notice 'ALL ACCESS TESTS PASSED';
end $$;

rollback;

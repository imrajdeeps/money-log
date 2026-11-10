-- Money Log, Releases 1 and 2 — database schema and access rules.
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
-- Read it first: nothing here is applied automatically. It is safe to run again, and safe to run on a database that
-- already holds the Release 1 version (objects use IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS).
--
-- What it creates
--   entries        one row per payment. group_id empty = private to its owner; set = a shared expense of that group
--   plan_blocks    the plan numbers you paste in from the spreadsheet's "App export" tab (one row per block)
--   groups, group_members, group_invites, settlements
--                  the shared ledger (Release 2). Groups and memberships change ONLY through the functions below.
--
-- Access rules, in four sentences
--   1. A signed-in user reads and writes their own private rows and nothing else of anyone's.
--   2. A shared expense or settlement is readable by the members of its group, and changed only by whoever created it
--      (and only while that person is still a member).
--   3. Joining, leaving and removing people happen through functions that check the rules (a code, an admin, a zero
--      balance); nobody can write the group tables directly.
--   4. The anonymous role has no access at all.
--
-- Deleting a user in the Supabase dashboard is NOT supported for anyone who has shared expenses: it removes their own
-- expenses, which changes everyone else's balances, and the database refuses it while others recorded them as payer.
-- Ask the person to leave their groups (after settling up) instead.

-- ---------------------------------------------------------------------------------
-- entries and plan_blocks (Release 1)
-- ---------------------------------------------------------------------------------
create table if not exists public.entries (
  id           uuid primary key,                       -- made on the phone, so offline entries already have an id
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_date   date not null,
  category     text not null check (char_length(category) between 1 and 80),
  amount       numeric(12, 2) not null check (amount > 0 and amount < 1000000000),
  note         text not null default '' check (char_length(note) <= 500),
  method       text check (method in ('UPI', 'Card', 'Cash', 'Other')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),     -- set by the phone on every edit; the latest edit wins
  deleted_at   timestamptz,                            -- soft delete, so other devices learn about it
  exported_at  timestamptz,                            -- set when you tap "Mark as exported"
  synced_at    timestamptz not null default now()      -- set by the server on every write (trigger below)
);

create index if not exists entries_owner_synced_idx on public.entries (owner_id, synced_at);
create index if not exists entries_owner_date_idx   on public.entries (owner_id, entry_date);

create table if not exists public.plan_blocks (
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  block        text not null check (char_length(block) between 1 and 40),
  imported_at  timestamptz not null default now(),
  payload      jsonb not null check (octet_length(payload::text) < 262144),
  primary key (owner_id, block)
);

-- Only the blocks the app uses can be stored, so one account holds at most four small rows here.
alter table public.plan_blocks drop constraint if exists plan_blocks_block_known;
alter table public.plan_blocks add constraint plan_blocks_block_known check (block in ('budget', 'due', 'networth', 'due_done'));

-- ---------------------------------------------------------------------------------
-- the shared ledger (Release 2)
-- ---------------------------------------------------------------------------------
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  kind        text not null check (kind in ('family', 'trip')),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- A row stays after someone leaves (left_at set): the group's old expenses still name that person.
create table if not exists public.group_members (
  group_id      uuid not null references public.groups (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 40),
  role          text not null default 'member' check (role in ('admin', 'member')),
  joined_at     timestamptz not null default now(),
  left_at       timestamptz,
  primary key (group_id, user_id)
);

-- The join code lives in its own table so that only admins can read it.
create table if not exists public.group_invites (
  group_id    uuid primary key references public.groups (id) on delete cascade,
  code        text not null unique check (code ~ '^[0-9a-f]{12}$'),
  expires_at  timestamptz not null
);

-- A payment between two members, e.g. "Asha paid Ravi 500". The app never moves money; it only records it.
create table if not exists public.settlements (
  id           uuid primary key,
  group_id     uuid not null references public.groups (id),
  from_user    uuid not null references auth.users (id) on delete cascade,
  to_user      uuid not null references auth.users (id) on delete cascade,
  amount       numeric(12, 2) not null check (amount > 0 and amount < 1000000000),
  settle_date  date not null,
  created_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  synced_at    timestamptz not null default now(),
  check (from_user <> to_user)
);

create index if not exists settlements_group_synced_idx on public.settlements (group_id, synced_at);

-- Shared-expense columns on entries. shares maps member user id -> that member's share in rupees, e.g.
-- {"<user id>": 600, "<user id>": 600.5}; it must add up to amount (checked by a trigger below).
alter table public.entries add column if not exists group_id uuid references public.groups (id);
alter table public.entries add column if not exists paid_by  uuid references auth.users (id);
alter table public.entries add column if not exists shares   jsonb;
create index if not exists entries_group_idx on public.entries (group_id) where group_id is not null;

-- ---------------------------------------------------------------------------------
-- server-side sync timestamp (immune to a phone clock that is wrong)
-- ---------------------------------------------------------------------------------
create or replace function public.touch_synced_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists entries_touch_synced_at on public.entries;
create trigger entries_touch_synced_at
  before insert or update on public.entries
  for each row execute function public.touch_synced_at();

drop trigger if exists settlements_touch_synced_at on public.settlements;
create trigger settlements_touch_synced_at
  before insert or update on public.settlements
  for each row execute function public.touch_synced_at();

-- ---------------------------------------------------------------------------------
-- latest edit wins, on the server too
-- A write whose updated_at is OLDER than the stored row's is ignored, so a phone that was offline for days, or whose
-- clock is behind, can never overwrite a newer edit made elsewhere. An equal updated_at is accepted (re-sending the
-- same edit is harmless). Triggers fire in name order, so this runs before the *_touch_synced_at ones.
-- ---------------------------------------------------------------------------------
create or replace function public.keep_latest_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at < old.updated_at then
    return null; -- skip this update and keep the stored row
  end if;
  return new;
end;
$$;

drop trigger if exists entries_keep_latest_edit on public.entries;
create trigger entries_keep_latest_edit
  before update on public.entries
  for each row execute function public.keep_latest_edit();

drop trigger if exists settlements_keep_latest_edit on public.settlements;
create trigger settlements_keep_latest_edit
  before update on public.settlements
  for each row execute function public.keep_latest_edit();

-- ---------------------------------------------------------------------------------
-- helpers used by the access rules
-- SECURITY DEFINER lets them read group_members although the caller may not (and avoids a policy that refers to its
-- own table). They only ever answer about the CALLER (auth.uid()).
-- ---------------------------------------------------------------------------------
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = gid and m.user_id = (select auth.uid()) and m.left_at is null
  );
$$;

create or replace function public.is_group_admin(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = gid and m.user_id = (select auth.uid()) and m.left_at is null and m.role = 'admin'
  );
$$;

-- Was this person ever a member (including someone who has since left)? Old expenses may still name them.
create or replace function public.was_group_member(gid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = uid);
$$;

-- What a member is owed (+) or owes (-) in rupees: what they paid, minus their shares, plus settlements they made,
-- minus settlements made to them. Used by leave_group and remove_member. row_security = off makes it fail loudly,
-- instead of silently counting zero rows, if it ever runs as a role that row-level security applies to.
create or replace function public.group_balance(p_group uuid, p_user uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select coalesce((select sum(e.amount) from public.entries e
                    where e.group_id = p_group and e.paid_by = p_user and e.deleted_at is null), 0)
       - coalesce((select sum((e.shares ->> p_user::text)::numeric) from public.entries e
                    where e.group_id = p_group and e.deleted_at is null and e.shares ? p_user::text), 0)
       + coalesce((select sum(s.amount) from public.settlements s
                    where s.group_id = p_group and s.from_user = p_user and s.deleted_at is null), 0)
       - coalesce((select sum(s.amount) from public.settlements s
                    where s.group_id = p_group and s.to_user = p_user and s.deleted_at is null), 0);
$$;

create or replace function public.new_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
$$;

-- ---------------------------------------------------------------------------------
-- shared-expense and settlement validation
-- ---------------------------------------------------------------------------------
-- True when the payer or anyone named in the shares is no longer an active member of the group.
create or replace function public.names_former_member(gid uuid, payer uuid, shares jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from (select payer as u union select key::uuid from jsonb_object_keys(coalesce(shares, '{}'::jsonb)) as key) people
    where u is not null
      and not exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = u and m.left_at is null)
  );
$$;

create or replace function public.validate_entry_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  amt numeric;
  total numeric := 0;
  n int := 0;
  need_active boolean;
  uid uuid := (select auth.uid());   -- null when run from the SQL editor or a maintenance script: those are not blocked
begin
  -- An expense that names someone who has left is frozen: its amount, people and deletion cannot change, because that
  -- would silently change the balance of a person who can no longer see the group.
  if tg_op = 'DELETE' then
    if uid is not null and old.group_id is not null and public.names_former_member(old.group_id, old.paid_by, old.shares) then
      raise exception 'This expense names someone who has left the group, so it can no longer be deleted' using errcode = '23514';
    end if;
    return old;
  end if;

  -- Answer a non-member exactly as row-level security would, so nobody can use these checks to learn who is in a group.
  if new.group_id is not null and uid is not null and not public.is_group_member(new.group_id) then
    raise exception 'new row violates row-level security policy for table "entries"' using errcode = '42501';
  end if;

  if new.group_id is null then
    if new.paid_by is not null or new.shares is not null then
      raise exception 'A private payment cannot carry paid_by or shares' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.paid_by is null or new.shares is null or jsonb_typeof(new.shares) <> 'object' then
    raise exception 'A shared expense needs paid_by and shares' using errcode = '23514';
  end if;
  -- You record only what you paid or share in (settlements have the same rule), so nobody can write debts between others.
  if new.owner_id is distinct from new.paid_by and not (new.shares ? new.owner_id::text) then
    raise exception 'You can only record an expense that you paid or share in' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.group_id is not null
     and (new.group_id is distinct from old.group_id or new.paid_by is distinct from old.paid_by or new.shares is distinct from old.shares
          or new.amount <> old.amount or new.deleted_at is distinct from old.deleted_at)
     and uid is not null and public.names_former_member(old.group_id, old.paid_by, old.shares) then
    raise exception 'This expense names someone who has left the group, so its amount, people and deletion are frozen' using errcode = '23514';
  end if;

  -- Everyone named must be in the group NOW when the expense is created or its people change. An edit that keeps the
  -- same people (a new note) is allowed even if someone named has since left. FOR SHARE locks each member row, so a
  -- person cannot leave between this check and the commit (leave_group takes the same row exclusively).
  if tg_op = 'INSERT' then
    need_active := true;
  else
    need_active := new.group_id is distinct from old.group_id or new.paid_by is distinct from old.paid_by
                   or new.shares is distinct from old.shares;
  end if;

  if need_active then
    perform 1 from public.group_members m
     where m.group_id = new.group_id and m.user_id = new.paid_by and m.left_at is null for share;
    if not found then raise exception 'The payer is not a current member of this group' using errcode = '23514'; end if;
  end if;

  for k, v in select key, value from jsonb_each(new.shares) loop
    n := n + 1;
    if n > 30 then raise exception 'Too many people in one split' using errcode = '23514'; end if;
    if k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'A share is not keyed by a user id' using errcode = '23514';
    end if;
    if jsonb_typeof(v) <> 'number' then raise exception 'A share must be a number' using errcode = '23514'; end if;
    amt := (v #>> '{}')::numeric;
    if amt < 0 or scale(amt) > 2 then raise exception 'A share must be zero or more, in rupees and paise' using errcode = '23514'; end if;
    if need_active then
      perform 1 from public.group_members m
       where m.group_id = new.group_id and m.user_id = k::uuid and m.left_at is null for share;
      if not found then raise exception 'A share names someone who is not a current member of this group' using errcode = '23514'; end if;
    elsif not public.was_group_member(new.group_id, k::uuid) then
      raise exception 'A share names someone who was never a member of this group' using errcode = '23514';
    end if;
    total := total + amt;
  end loop;

  if total <> new.amount then
    raise exception 'The shares add up to % but the expense is %', total, new.amount using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists entries_validate_group on public.entries;
create trigger entries_validate_group
  before insert or update or delete on public.entries
  for each row execute function public.validate_entry_group();

create or replace function public.validate_settlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  need_active boolean;
  uid uuid := (select auth.uid());
  former boolean;
begin
  if tg_op = 'DELETE' then
    former := exists (select 1 from unnest(array[old.from_user, old.to_user]) u
                      where not exists (select 1 from public.group_members m where m.group_id = old.group_id and m.user_id = u and m.left_at is null));
    if uid is not null and former then
      raise exception 'This settlement involves someone who has left the group, so it can no longer be deleted' using errcode = '23514';
    end if;
    return old;
  end if;

  if uid is not null and not public.is_group_member(new.group_id) then
    raise exception 'new row violates row-level security policy for table "settlements"' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    former := exists (select 1 from unnest(array[old.from_user, old.to_user]) u
                      where not exists (select 1 from public.group_members m where m.group_id = old.group_id and m.user_id = u and m.left_at is null));
    if uid is not null and former
       and (new.group_id is distinct from old.group_id or new.from_user is distinct from old.from_user
            or new.to_user is distinct from old.to_user or new.amount is distinct from old.amount
            or new.deleted_at is distinct from old.deleted_at) then
      raise exception 'This settlement involves someone who has left the group, so it is frozen' using errcode = '23514';
    end if;
  end if;

  -- Both people must be in the group NOW when a settlement is recorded or its people or amount change; changing
  -- anything else is allowed. FOR SHARE: see validate_entry_group.
  if tg_op = 'INSERT' then
    need_active := true;
  else
    need_active := new.group_id is distinct from old.group_id or new.from_user is distinct from old.from_user
                   or new.to_user is distinct from old.to_user or new.amount is distinct from old.amount;
  end if;
  if need_active then
    perform 1 from public.group_members m where m.group_id = new.group_id and m.user_id = new.from_user and m.left_at is null for share;
    if not found then raise exception 'Both people in a settlement must be current members of the group' using errcode = '23514'; end if;
    perform 1 from public.group_members m where m.group_id = new.group_id and m.user_id = new.to_user and m.left_at is null for share;
    if not found then raise exception 'Both people in a settlement must be current members of the group' using errcode = '23514'; end if;
  elsif not public.was_group_member(new.group_id, new.from_user) or not public.was_group_member(new.group_id, new.to_user) then
    raise exception 'Both people in a settlement must have been members of the group' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists settlements_validate on public.settlements;
create trigger settlements_validate
  before insert or update or delete on public.settlements
  for each row execute function public.validate_settlement();

-- Per-account row caps. Sign-ups are open to anyone while you are inviting people, and the app's key is public, so a
-- stranger's account must not be able to fill the free database. (Runs as the caller; counts only rows they can see.)
create or replace function public.enforce_row_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cap int := tg_argv[0]::int;
  n int;
begin
  if tg_table_name = 'entries' then
    if exists (select 1 from public.entries e where e.id = new.id) then return new; end if; -- an upsert of an existing row
    select count(*) into n from (select 1 from public.entries e where e.owner_id = new.owner_id limit cap) s;
  else
    if exists (select 1 from public.settlements e where e.id = new.id) then return new; end if;
    select count(*) into n from (select 1 from public.settlements e where e.created_by = new.created_by limit cap) s;
  end if;
  if n >= cap then
    raise exception 'This account has reached its limit of % rows', cap using errcode = '53400';
  end if;
  return new;
end;
$$;

drop trigger if exists entries_cap on public.entries;
create trigger entries_cap before insert on public.entries
  for each row execute function public.enforce_row_cap(20000);
drop trigger if exists settlements_cap on public.settlements;
create trigger settlements_cap before insert on public.settlements
  for each row execute function public.enforce_row_cap(2000);

-- ---------------------------------------------------------------------------------
-- group management functions (the only way groups and memberships change)
-- ---------------------------------------------------------------------------------
create or replace function public.create_group(p_name text, p_kind text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  nm text := btrim(coalesce(p_name, ''));
  dn text := btrim(coalesce(p_display_name, ''));
  gid uuid;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if char_length(nm) not between 1 and 60 then raise exception 'Give the group a name of 1 to 60 characters' using errcode = '22023'; end if;
  if p_kind not in ('family', 'trip') then raise exception 'A group is a family or a trip' using errcode = '22023'; end if;
  if char_length(dn) not between 1 and 40 then raise exception 'Enter the name others will see you as (1 to 40 characters)' using errcode = '22023'; end if;
  if (select count(*) from public.groups g where g.created_by = uid) >= 10 then
    raise exception 'You can create at most 10 groups' using errcode = '53400';
  end if;

  insert into public.groups (name, kind, created_by) values (nm, p_kind, uid) returning id into gid;
  insert into public.group_members (group_id, user_id, display_name, role) values (gid, uid, dn, 'admin');
  insert into public.group_invites (group_id, code, expires_at) values (gid, public.new_invite_code(), now() + interval '7 days');
  return gid;
end;
$$;

create or replace function public.join_group(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  norm text := lower(regexp_replace(coalesce(p_code, ''), '[^0-9a-fA-F]', '', 'g'));
  dn text := btrim(coalesce(p_display_name, ''));
  gid uuid;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if char_length(dn) not between 1 and 40 then raise exception 'Enter the name others will see you as (1 to 40 characters)' using errcode = '22023'; end if;

  select i.group_id into gid from public.group_invites i where i.code = norm and i.expires_at > now();
  if gid is null then raise exception 'That code is not valid or has expired' using errcode = '22023'; end if;
  perform 1 from public.groups g where g.id = gid for update; -- one membership change per group at a time

  if exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = uid and m.left_at is null) then
    return gid; -- already in
  end if;
  if (select count(*) from public.group_members m where m.group_id = gid and m.left_at is null) >= 20 then
    raise exception 'This group is full (20 people)' using errcode = '53400';
  end if;

  -- coming back is always as a plain member, whatever the person was before
  insert into public.group_members (group_id, user_id, display_name, role) values (gid, uid, dn, 'member')
  on conflict (group_id, user_id) do update set left_at = null, role = 'member', display_name = excluded.display_name, joined_at = now();
  -- a group nobody administers (the last admin left) is taken over by the next person to join
  if not exists (select 1 from public.group_members m where m.group_id = gid and m.left_at is null and m.role = 'admin') then
    update public.group_members set role = 'admin' where group_id = gid and user_id = uid;
  end if;
  return gid;
end;
$$;

create or replace function public.reset_invite(p_group uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare c text := public.new_invite_code();
begin
  if not public.is_group_admin(p_group) then raise exception 'Only a group admin can do this' using errcode = '42501'; end if;
  insert into public.group_invites (group_id, code, expires_at) values (p_group, c, now() + interval '7 days')
  on conflict (group_id) do update set code = excluded.code, expires_at = excluded.expires_at;
  return c;
end;
$$;

create or replace function public.leave_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  me public.group_members;
begin
  -- lock the row first: a concurrent expense or settlement naming this person waits for us, then finds them gone
  perform 1 from public.groups g where g.id = p_group for update; -- one membership change per group at a time
  select * into me from public.group_members m where m.group_id = p_group and m.user_id = uid and m.left_at is null for update;
  if not found then raise exception 'You are not in this group' using errcode = '42501'; end if;
  if public.group_balance(p_group, uid) <> 0 then
    raise exception 'Settle up first: your balance in this group is not zero' using errcode = '23514';
  end if;
  if me.role = 'admin'
     and exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id <> uid and m.left_at is null)
     and not exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id <> uid and m.left_at is null and m.role = 'admin') then
    raise exception 'Make someone else an admin before you leave' using errcode = '23514';
  end if;
  update public.group_members set left_at = now() where group_id = p_group and user_id = uid;
end;
$$;

create or replace function public.remove_member(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_admin(p_group) then raise exception 'Only a group admin can do this' using errcode = '42501'; end if;
  perform 1 from public.groups g where g.id = p_group for update; -- one membership change per group at a time
  if not public.is_group_admin(p_group) then raise exception 'Only a group admin can do this' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) then raise exception 'Use Leave group to remove yourself' using errcode = '22023'; end if;
  perform 1 from public.group_members m where m.group_id = p_group and m.user_id = p_user and m.left_at is null for update;
  if not found then
    raise exception 'That person is not in this group' using errcode = '22023';
  end if;
  if public.group_balance(p_group, p_user) <> 0 then
    raise exception 'They must settle up first: their balance in this group is not zero' using errcode = '23514';
  end if;
  update public.group_members set left_at = now() where group_id = p_group and user_id = p_user;
  -- the old code may be known to the person just removed
  update public.group_invites set code = public.new_invite_code(), expires_at = now() + interval '7 days' where group_id = p_group;
end;
$$;

create or replace function public.make_admin(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_admin(p_group) then raise exception 'Only a group admin can do this' using errcode = '42501'; end if;
  perform 1 from public.groups g where g.id = p_group for update; -- one membership change per group at a time
  update public.group_members set role = 'admin' where group_id = p_group and user_id = p_user and left_at is null;
  if not found then raise exception 'That person is not in this group' using errcode = '22023'; end if;
end;
$$;

create or replace function public.set_display_name(p_group uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare dn text := btrim(coalesce(p_name, ''));
begin
  if char_length(dn) not between 1 and 40 then raise exception 'Enter a name of 1 to 40 characters' using errcode = '22023'; end if;
  update public.group_members set display_name = dn
   where group_id = p_group and user_id = (select auth.uid()) and left_at is null;
  if not found then raise exception 'You are not in this group' using errcode = '42501'; end if;
end;
$$;

-- ---------------------------------------------------------------------------------
-- who may run what
-- Supabase gives anon and authenticated execute rights on new functions by default, so take them back explicitly.
-- ---------------------------------------------------------------------------------
revoke all on function public.is_group_member(uuid)               from public, anon, authenticated;
revoke all on function public.is_group_admin(uuid)                from public, anon, authenticated;
revoke all on function public.was_group_member(uuid, uuid)        from public, anon, authenticated;
revoke all on function public.group_balance(uuid, uuid)           from public, anon, authenticated;
revoke all on function public.new_invite_code()                   from public, anon, authenticated;
revoke all on function public.validate_entry_group()              from public, anon, authenticated;
revoke all on function public.validate_settlement()               from public, anon, authenticated;
revoke all on function public.names_former_member(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.enforce_row_cap()                   from public, anon, authenticated;
revoke all on function public.create_group(text, text, text)      from public, anon, authenticated;
revoke all on function public.join_group(text, text)              from public, anon, authenticated;
revoke all on function public.reset_invite(uuid)                  from public, anon, authenticated;
revoke all on function public.leave_group(uuid)                   from public, anon, authenticated;
revoke all on function public.remove_member(uuid, uuid)           from public, anon, authenticated;
revoke all on function public.make_admin(uuid, uuid)              from public, anon, authenticated;
revoke all on function public.set_display_name(uuid, text)        from public, anon, authenticated;

-- used inside the access rules, which run as the signed-in user
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_admin(uuid)  to authenticated;
-- called from the app
grant execute on function public.create_group(text, text, text) to authenticated;
grant execute on function public.join_group(text, text)         to authenticated;
grant execute on function public.reset_invite(uuid)             to authenticated;
grant execute on function public.leave_group(uuid)              to authenticated;
grant execute on function public.remove_member(uuid, uuid)      to authenticated;
grant execute on function public.make_admin(uuid, uuid)         to authenticated;
grant execute on function public.set_display_name(uuid, text)   to authenticated;

-- ---------------------------------------------------------------------------------
-- access rules (row-level security): everything denied unless a policy allows it
-- ---------------------------------------------------------------------------------
alter table public.entries       enable row level security;
alter table public.plan_blocks   enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.settlements   enable row level security;
alter table public.entries       force row level security;
alter table public.plan_blocks   force row level security;
alter table public.groups        force row level security;
alter table public.group_members force row level security;
alter table public.group_invites force row level security;
alter table public.settlements   force row level security;

revoke all on public.entries       from anon, authenticated;
revoke all on public.plan_blocks   from anon, authenticated;
revoke all on public.groups        from anon, authenticated;
revoke all on public.group_members from anon, authenticated;
revoke all on public.group_invites from anon, authenticated;
revoke all on public.settlements   from anon, authenticated;
grant select, insert, update, delete on public.entries     to authenticated;
grant select, insert, update, delete on public.plan_blocks to authenticated;
grant select, insert, update, delete on public.settlements to authenticated;
grant select on public.groups        to authenticated; -- writes go through the functions above
grant select on public.group_members to authenticated;
grant select on public.group_invites to authenticated;

-- entries: your own rows, plus the shared expenses of groups you are in
drop policy if exists entries_select on public.entries;
drop policy if exists entries_insert on public.entries;
drop policy if exists entries_update on public.entries;
drop policy if exists entries_delete on public.entries;
create policy entries_select on public.entries for select to authenticated
  using (owner_id = (select auth.uid()) or (group_id is not null and public.is_group_member(group_id)));
-- you write only your own rows, and only into groups you are in now
create policy entries_insert on public.entries for insert to authenticated
  with check (owner_id = (select auth.uid()) and (group_id is null or public.is_group_member(group_id)));
create policy entries_update on public.entries for update to authenticated
  using (owner_id = (select auth.uid()) and (group_id is null or public.is_group_member(group_id)))
  with check (owner_id = (select auth.uid()) and (group_id is null or public.is_group_member(group_id)));
create policy entries_delete on public.entries for delete to authenticated
  using (owner_id = (select auth.uid()) and (group_id is null or public.is_group_member(group_id)));

drop policy if exists plan_blocks_select on public.plan_blocks;
drop policy if exists plan_blocks_insert on public.plan_blocks;
drop policy if exists plan_blocks_update on public.plan_blocks;
drop policy if exists plan_blocks_delete on public.plan_blocks;
create policy plan_blocks_select on public.plan_blocks for select to authenticated
  using (owner_id = (select auth.uid()));
create policy plan_blocks_insert on public.plan_blocks for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy plan_blocks_update on public.plan_blocks for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy plan_blocks_delete on public.plan_blocks for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated
  using (public.is_group_member(id));

drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists group_invites_select on public.group_invites;
create policy group_invites_select on public.group_invites for select to authenticated
  using (public.is_group_admin(group_id));

-- settlements: members read them; only the person who recorded one (a party to it) changes it
drop policy if exists settlements_select on public.settlements;
drop policy if exists settlements_insert on public.settlements;
drop policy if exists settlements_update on public.settlements;
drop policy if exists settlements_delete on public.settlements;
create policy settlements_select on public.settlements for select to authenticated
  using (public.is_group_member(group_id));
create policy settlements_insert on public.settlements for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_group_member(group_id)
              and (from_user = (select auth.uid()) or to_user = (select auth.uid())));
create policy settlements_update on public.settlements for update to authenticated
  using (created_by = (select auth.uid()) and public.is_group_member(group_id))
  with check (created_by = (select auth.uid()) and public.is_group_member(group_id)
              and (from_user = (select auth.uid()) or to_user = (select auth.uid())));
create policy settlements_delete on public.settlements for delete to authenticated
  using (created_by = (select auth.uid()) and public.is_group_member(group_id));

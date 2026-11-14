-- Money Log, Releases 1 and 2 — database schema and access rules.
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
-- Read it first: nothing here is applied automatically. It is safe to run again, and safe to run on a database that
-- already holds the Release 1 version (objects use IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS).
--
-- What it creates
--   entries        one row per payment. group_id empty = private to its owner; set = a shared expense of that group
--   plan_blocks    the plan numbers you paste in from the spreadsheet's "App export" tab, and the categories and budgets
--                  set in the app, and the payments that repeat every month (one row per block)
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

-- Only the blocks the app uses can be stored, so one account holds at most seven small rows here
-- (categories = the categories and budgets set in the app, Release 4; recurring = payments that repeat every month;
-- goals = the goals and top-ups set in the app, version 1.10).
alter table public.plan_blocks drop constraint if exists plan_blocks_block_known;
alter table public.plan_blocks add constraint plan_blocks_block_known check (block in ('budget', 'due', 'networth', 'due_done', 'categories', 'recurring', 'goals'));

-- ---------------------------------------------------------------------------------
-- the shared ledger (Release 2)
-- ---------------------------------------------------------------------------------
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  kind        text not null check (kind in ('family', 'trip', 'flatmates', 'couple')),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  starts_on   date,         -- a trip's first day (optional)
  ends_on     date,         -- a trip's last day (optional)
  closed_at   timestamptz,  -- a trip that is over: it takes no new expenses and no new people (an admin can reopen it)
  usual_split jsonb,        -- flatmates: how a new expense is split by default, {"mode":"equal"} or {"mode":"percent","percent":{<user id>: 60, ...}}
  primary_admin uuid references auth.users (id) on delete set null -- version 1.28: the one admin who cannot be removed or demoted (see the end of this file)
);

-- The kinds a group can have. Family and trip came first; flatmates and couple were added later, so a database made
-- before then has the old, shorter list and this replaces it (safe to run again).
alter table public.groups drop constraint if exists groups_kind_check;
alter table public.groups add constraint groups_kind_check check (kind in ('family', 'trip', 'flatmates', 'couple'));

-- Version 1.9 added the trip dates, the closed date and the flatmates' usual split. A database made before then gets the
-- columns here (safe to run again). Each belongs to one kind only, and the table says so as well as the functions.
alter table public.groups add column if not exists starts_on date;
alter table public.groups add column if not exists ends_on date;
alter table public.groups add column if not exists closed_at timestamptz;
alter table public.groups add column if not exists usual_split jsonb;
alter table public.groups add column if not exists primary_admin uuid references auth.users (id) on delete set null;
alter table public.groups drop constraint if exists groups_trip_only;
alter table public.groups add constraint groups_trip_only check (kind = 'trip' or (starts_on is null and ends_on is null and closed_at is null));
alter table public.groups drop constraint if exists groups_flatmates_only;
alter table public.groups add constraint groups_flatmates_only check (kind = 'flatmates' or usual_split is null);
alter table public.groups drop constraint if exists groups_trip_dates_order;
alter table public.groups add constraint groups_trip_dates_order check (ends_on is null or starts_on is null or ends_on >= starts_on);

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

-- Is the caller the group's primary admin (the creator, unless the role was handed over)? Only that person gives or takes
-- away admin rights and hands the role over. Version 1.28.
create or replace function public.is_primary_admin(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.groups g
    join public.group_members m on m.group_id = g.id and m.user_id = g.primary_admin and m.left_at is null and m.role = 'admin'
    where g.id = gid and g.primary_admin = (select auth.uid())
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
  -- A closed trip takes no new expense and none moved into it. What is already there can still be edited, and settling up
  -- still works; an admin can reopen the trip.
  if uid is not null and (tg_op = 'INSERT' or new.group_id is distinct from old.group_id)
     and exists (select 1 from public.groups g where g.id = new.group_id and g.closed_at is not null) then
    raise exception 'This trip is closed' using errcode = '23514';
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
  if p_kind not in ('family', 'trip', 'flatmates', 'couple') then raise exception 'A group is a family, a trip, flatmates or a couple' using errcode = '22023'; end if;
  if char_length(dn) not between 1 and 40 then raise exception 'Enter the name others will see you as (1 to 40 characters)' using errcode = '22023'; end if;
  if (select count(*) from public.groups g where g.created_by = uid) >= 10 then
    raise exception 'You can create at most 10 groups' using errcode = '53400';
  end if;

  insert into public.groups (name, kind, created_by, primary_admin) values (nm, p_kind, uid, uid) returning id into gid;
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
  if exists (select 1 from public.groups g where g.id = gid and g.closed_at is not null) then
    raise exception 'This trip is closed' using errcode = '53400';
  end if;
  if (select count(*) from public.group_members m where m.group_id = gid and m.left_at is null) >= 20 then
    raise exception 'This group is full (20 people)' using errcode = '53400';
  end if;
  if (select g.kind from public.groups g where g.id = gid) = 'couple'
     and (select count(*) from public.group_members m where m.group_id = gid and m.left_at is null) >= 2 then
    raise exception 'A couple is only two people' using errcode = '53400';
  end if;

  -- coming back is always as a plain member, whatever the person was before
  insert into public.group_members (group_id, user_id, display_name, role) values (gid, uid, dn, 'member')
  on conflict (group_id, user_id) do update set left_at = null, role = 'member', display_name = excluded.display_name, joined_at = now();
  -- a group everyone has left is taken over by the next person to join (a group that still has people but no admin is
  -- taken over through claim_primary_admin, never by whoever holds an old code)
  if not exists (select 1 from public.group_members m where m.group_id = gid and m.left_at is null and m.user_id <> uid) then
    update public.group_members set role = 'admin' where group_id = gid and user_id = uid;
    update public.groups set primary_admin = uid where id = gid;
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
  if exists (select 1 from public.groups g where g.id = p_group and g.primary_admin = uid) then
    if exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id <> uid and m.left_at is null) then
      raise exception 'Hand over the primary admin role before you leave' using errcode = '23514';
    end if;
    update public.groups set primary_admin = null where id = p_group; -- the last person out: nobody is left to be in charge
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
  if exists (select 1 from public.groups g where g.id = p_group and g.primary_admin = p_user) then
    raise exception 'The primary admin cannot be removed' using errcode = '42501';
  end if;
  if exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = p_user and m.left_at is null and m.role = 'admin')
     and not public.is_primary_admin(p_group) then
    raise exception 'Only the primary admin can remove an admin' using errcode = '42501';
  end if;
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
  if not public.is_primary_admin(p_group) then raise exception 'Only the primary admin can do this' using errcode = '42501'; end if;
  perform 1 from public.groups g where g.id = p_group for update; -- one membership change per group at a time
  if not public.is_primary_admin(p_group) then raise exception 'Only the primary admin can do this' using errcode = '42501'; end if;
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

-- A trip's optional dates. Admins only, trips only.
create or replace function public.set_trip_dates(p_group uuid, p_starts date, p_ends date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_admin(p_group) then raise exception 'Only a group admin can do this' using errcode = '42501'; end if;
  if p_starts is not null and p_ends is not null and p_ends < p_starts then
    raise exception 'The trip cannot end before it starts' using errcode = '22023';
  end if;
  update public.groups set starts_on = p_starts, ends_on = p_ends where id = p_group and kind = 'trip';
  if not found then raise exception 'Only a trip has dates' using errcode = '22023'; end if;
end;
$$;

-- Close a trip (it takes no new expenses and no new people; settling up still works) or reopen it. Admins only, trips only.
create or replace function public.set_group_closed(p_group uuid, p_closed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_admin(p_group) then raise exception 'Only a group admin can do this' using errcode = '42501'; end if;
  if p_closed is null then raise exception 'Say whether the trip is closed' using errcode = '22023'; end if;
  update public.groups set closed_at = case when p_closed then coalesce(closed_at, now()) else null end
   where id = p_group and kind = 'trip';
  if not found then raise exception 'Only a trip can be closed' using errcode = '22023'; end if;
end;
$$;

-- Flatmates: how a new expense is split by default. {"mode":"equal"}, or {"mode":"percent","percent":{<user id>: 60, ...}}
-- naming current members only, adding up to 100. Null clears it. Admins only, flatmates only.
create or replace function public.set_usual_split(p_group uuid, p_split jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  pct numeric;
  total numeric := 0;
  n int := 0;
begin
  if not public.is_group_admin(p_group) then raise exception 'Only a group admin can do this' using errcode = '42501'; end if;
  perform 1 from public.groups g where g.id = p_group and g.kind = 'flatmates' for update;
  if not found then raise exception 'Only flatmates have a usual split' using errcode = '22023'; end if;

  if p_split is null or p_split = 'null'::jsonb then
    update public.groups set usual_split = null where id = p_group;
    return;
  end if;
  if jsonb_typeof(p_split) <> 'object' then raise exception 'The usual split must be an object' using errcode = '22023'; end if;
  if p_split ->> 'mode' = 'equal' then
    if p_split <> jsonb_build_object('mode', 'equal') then raise exception 'An equal split has nothing else in it' using errcode = '22023'; end if;
  elsif p_split ->> 'mode' = 'percent' then
    if (select count(*) from jsonb_object_keys(p_split)) <> 2 or jsonb_typeof(p_split -> 'percent') is distinct from 'object' then
      raise exception 'A percent split is a mode and a percent for each person' using errcode = '22023';
    end if;
    for k, v in select key, value from jsonb_each(p_split -> 'percent') loop
      n := n + 1;
      if n > 20 then raise exception 'Too many people in the split' using errcode = '22023'; end if;
      if k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'A percent is not keyed by a user id' using errcode = '22023';
      end if;
      if jsonb_typeof(v) <> 'number' then raise exception 'A percent must be a number' using errcode = '22023'; end if;
      pct := (v #>> '{}')::numeric;
      if pct < 0 or pct > 100 or scale(pct) > 2 then raise exception 'A percent is between 0 and 100, with at most 2 decimals' using errcode = '22023'; end if;
      perform 1 from public.group_members m where m.group_id = p_group and m.user_id = k::uuid and m.left_at is null;
      if not found then raise exception 'The split names someone who is not in this group' using errcode = '22023'; end if;
      total := total + pct;
    end loop;
    if total <> 100 then raise exception 'The percentages add up to %, not 100', total using errcode = '22023'; end if;
  else
    raise exception 'The usual split is equal or percent' using errcode = '22023';
  end if;
  update public.groups set usual_split = p_split where id = p_group;
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
revoke all on function public.set_trip_dates(uuid, date, date)    from public, anon, authenticated;
revoke all on function public.set_group_closed(uuid, boolean)     from public, anon, authenticated;
revoke all on function public.set_usual_split(uuid, jsonb)        from public, anon, authenticated;

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
grant execute on function public.set_trip_dates(uuid, date, date) to authenticated;
grant execute on function public.set_group_closed(uuid, boolean)  to authenticated;
grant execute on function public.set_usual_split(uuid, jsonb)     to authenticated;

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

-- =================================================================================
-- Release 3: receipt photos, edit history of shared expenses, "my share" link
-- =================================================================================

-- A private payment that records this account's share of someone else's shared expense (the "Add my share to my budget"
-- button). It only remembers which expense it came from, so the button is not offered twice.
alter table public.entries add column if not exists share_of uuid;

-- ---------------------------------------------------------------------------------
-- receipts: one row per photo; the photo itself is a file in the private Storage bucket "receipts"
-- The file lives at <owner id>/<receipt id>.jpg (the check below makes that the only possible path). The phone first
-- creates the row, then uploads the file, then sets uploaded_at. Deleting a payment deletes its photos' rows (soft) and
-- the phone then removes the files through the Storage API (deleting a file with SQL would leave it orphaned and billed).
-- ---------------------------------------------------------------------------------
create table if not exists public.receipts (
  id           uuid primary key,                       -- made on the phone
  entry_id     uuid not null references public.entries (id) on delete cascade,
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path         text not null unique,
  bytes        integer not null check (bytes > 0 and bytes <= 1048576),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  uploaded_at  timestamptz,                            -- the file is in Storage
  deleted_at   timestamptz,                            -- soft delete, so other phones learn about it
  purged_at    timestamptz,                            -- the file has been removed from Storage
  synced_at    timestamptz not null default now(),
  check (path = owner_id::text || '/' || id::text || '.jpg')
);

create index if not exists receipts_entry_idx on public.receipts (entry_id);
create index if not exists receipts_owner_idx on public.receipts (owner_id, purged_at);
create index if not exists receipts_synced_idx on public.receipts (synced_at);

-- Can the caller see this payment (their own, or a shared expense of a group they are in)? Definer, so it reads entries
-- whatever the caller's own rules say; it answers only about the caller.
create or replace function public.can_view_entry(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1 from public.entries e
    where e.id = eid
      and (e.owner_id = (select auth.uid()) or (e.group_id is not null and public.is_group_member(e.group_id)))
  );
$$;

-- Can the caller attach photos to this payment: it is theirs, not deleted, and (if shared) they are still in the group?
create or replace function public.can_edit_entry(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1 from public.entries e
    where e.id = eid and e.owner_id = (select auth.uid()) and e.deleted_at is null
      and (e.group_id is null or public.is_group_member(e.group_id))
  );
$$;

-- Used by the Storage rules below: may the caller upload a file at this path (they declared the photo first)?
create or replace function public.receipt_slot_open(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1 from public.receipts r
    where r.path = object_name and r.owner_id = (select auth.uid()) and r.deleted_at is null and r.purged_at is null
  );
$$;

-- ...and may the caller read it (their own photo, or one on a shared expense of a group they are in)?
create or replace function public.can_read_receipt(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1 from public.receipts r
    where r.path = object_name and r.deleted_at is null
      and (r.owner_id = (select auth.uid()) or public.can_view_entry(r.entry_id))
  );
$$;

-- At most 3 photos on a payment, and at most 300 photos per account whose file may still be stored (purged_at not set).
-- The cap is on the NUMBER of photos, not on the declared size: the database cannot see how big an uploaded file really is
-- (the phone declares it), and Storage only limits each file to 1 MB. So the real ceiling per account is 300 photos x 1 MB
-- = 300 MB, which keeps a stranger's account from filling the free 1 GB. Excludes the row itself, so re-sending the same
-- row is never refused.
create or replace function public.enforce_receipt_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if (select count(*) from public.receipts r where r.entry_id = new.entry_id and r.deleted_at is null and r.id <> new.id) >= 3 then
    raise exception 'A payment can carry at most 3 receipt photos' using errcode = '53400';
  end if;
  if (select count(*) from public.receipts r where r.owner_id = new.owner_id and r.purged_at is null and r.id <> new.id) >= 300 then
    raise exception 'This account has reached its limit of 300 receipt photos' using errcode = '53400';
  end if;
  return new;
end;
$$;

create or replace function public.keep_receipt_fixed()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if new.id <> old.id or new.entry_id <> old.entry_id or new.owner_id <> old.owner_id or new.path <> old.path or new.bytes <> old.bytes then
    raise exception 'A receipt can only be marked uploaded, deleted or purged' using errcode = '23514';
  end if;
  -- "purged" frees the account's quota, so it is allowed only once the file is really gone from Storage; otherwise an
  -- account could keep its files and still make room for more.
  if new.purged_at is not null and old.purged_at is null
     and exists (select 1 from storage.objects o where o.bucket_id = 'receipts' and o.name = new.path) then
    raise exception 'The file is still in storage: remove it before marking the photo purged' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- A payment that still has photos whose files may be in storage cannot be hard-deleted: that would drop the rows (the
-- foreign key cascades) while the files stay behind, unreachable and still billed, and would free the account's quota.
-- The normal way is to mark the payment deleted (the app does), remove the files, and only then delete the row.
-- (Skipped when there is no signed-in user, so the owner's maintenance in the SQL editor is not blocked.)
create or replace function public.keep_unpurged_receipts()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if (select auth.uid()) is not null and exists (select 1 from public.receipts r where r.entry_id = old.id and r.purged_at is null) then
    raise exception 'Delete this payment the normal way: its photos have to be removed first' using errcode = '23514';
  end if;
  return old;
end;
$$;

drop trigger if exists entries_keep_receipts on public.entries;
create trigger entries_keep_receipts before delete on public.entries
  for each row execute function public.keep_unpurged_receipts();

drop trigger if exists receipts_rules on public.receipts;
create trigger receipts_rules before insert on public.receipts
  for each row execute function public.enforce_receipt_rules();
drop trigger if exists receipts_fixed on public.receipts;
create trigger receipts_fixed before update on public.receipts
  for each row execute function public.keep_receipt_fixed();
drop trigger if exists receipts_keep_latest_edit on public.receipts;
create trigger receipts_keep_latest_edit before update on public.receipts
  for each row execute function public.keep_latest_edit();
drop trigger if exists receipts_touch_synced_at on public.receipts;
create trigger receipts_touch_synced_at before insert or update on public.receipts
  for each row execute function public.touch_synced_at();

-- Deleting a payment deletes its photos, whatever phone did it.
create or replace function public.delete_receipts_with_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    -- updated_at must beat the stored one (a phone whose clock runs ahead wrote it), or keep_latest_edit would skip this
    update public.receipts set deleted_at = clock_timestamp(), updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
     where entry_id = new.id and deleted_at is null;
  end if;
  return null;
end;
$$;

drop trigger if exists entries_delete_receipts on public.entries;
create trigger entries_delete_receipts after update on public.entries
  for each row execute function public.delete_receipts_with_entry();

-- ---------------------------------------------------------------------------------
-- entry_history: what changed in a shared expense, shown to the group. Written only by the trigger below.
-- ---------------------------------------------------------------------------------
create table if not exists public.entry_history (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.entries (id) on delete cascade,
  group_id    uuid not null references public.groups (id),
  changed_by  uuid not null,
  changed_at  timestamptz not null default clock_timestamp(),
  kind        text not null check (kind in ('created', 'edited', 'deleted', 'moved')),
  changes     jsonb not null
);

create index if not exists entry_history_entry_idx on public.entry_history (entry_id, changed_at desc);

-- Records what a member created, changed, or deleted. A payment made private again is logged for the group only as
-- "moved out", never with its values, so nothing private leaks into the group's history. Keeps the latest 100 per expense.
-- History is kept only for groups with at least two current members: in a group of one nobody else could read it, and
-- it would only be a way to pile up rows.
create or replace function public.group_has_company(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select (select count(*) from public.group_members m where m.group_id = gid and m.left_at is null) >= 2;
$$;

create or replace function public.log_entry_history()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  who uuid := coalesce((select auth.uid()), new.owner_id);
  diff jsonb := '{}'::jsonb;
  change_kind text := 'edited';
  after_values jsonb;
begin
  after_values := jsonb_build_object('amount', new.amount, 'category', new.category, 'note', new.note, 'entry_date', new.entry_date,
                                     'paid_by', new.paid_by, 'shares', new.shares);
  if tg_op = 'INSERT' then
    if new.group_id is not null and public.group_has_company(new.group_id) then
      insert into public.entry_history (entry_id, group_id, changed_by, kind, changes) values (new.id, new.group_id, who, 'created', after_values);
    end if;
    return null;
  end if;

  if old.group_id is not null and new.group_id is distinct from old.group_id and public.group_has_company(old.group_id) then
    insert into public.entry_history (entry_id, group_id, changed_by, kind, changes)
      values (new.id, old.group_id, who, 'moved', jsonb_build_object('group_id', jsonb_build_object('from', old.group_id, 'to', new.group_id)));
  end if;
  if new.group_id is null or not public.group_has_company(new.group_id) then return null; end if;
  if new.group_id is distinct from old.group_id then
    insert into public.entry_history (entry_id, group_id, changed_by, kind, changes) values (new.id, new.group_id, who, 'created', after_values);
    return null;
  end if;

  if new.amount is distinct from old.amount then diff := diff || jsonb_build_object('amount', jsonb_build_object('from', old.amount, 'to', new.amount)); end if;
  if new.category is distinct from old.category then diff := diff || jsonb_build_object('category', jsonb_build_object('from', old.category, 'to', new.category)); end if;
  if new.note is distinct from old.note then diff := diff || jsonb_build_object('note', jsonb_build_object('from', old.note, 'to', new.note)); end if;
  if new.entry_date is distinct from old.entry_date then diff := diff || jsonb_build_object('entry_date', jsonb_build_object('from', old.entry_date, 'to', new.entry_date)); end if;
  if new.paid_by is distinct from old.paid_by then diff := diff || jsonb_build_object('paid_by', jsonb_build_object('from', old.paid_by, 'to', new.paid_by)); end if;
  if new.shares is distinct from old.shares then diff := diff || jsonb_build_object('shares', jsonb_build_object('from', old.shares, 'to', new.shares)); end if;
  if new.deleted_at is distinct from old.deleted_at and new.deleted_at is not null then change_kind := 'deleted'; end if;
  if diff = '{}'::jsonb and change_kind = 'edited' then return null; end if; -- nothing a member would care about (exported_at, sync times)

  insert into public.entry_history (entry_id, group_id, changed_by, kind, changes) values (new.id, new.group_id, who, change_kind, diff);
  delete from public.entry_history h
   where h.entry_id = new.id
     and h.id in (select x.id from public.entry_history x where x.entry_id = new.id order by x.changed_at desc, x.id offset 100);
  return null;
end;
$$;

drop trigger if exists entries_history on public.entries;
create trigger entries_history after insert or update on public.entries
  for each row execute function public.log_entry_history();

-- ---------------------------------------------------------------------------------
-- the private Storage bucket for receipts, and who may use it
-- Files are JPEG only and at most 1 MB each (Storage enforces both on the bucket). Nothing here is public.
-- ---------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists receipts_objects_insert on storage.objects;
drop policy if exists receipts_objects_select on storage.objects;
drop policy if exists receipts_objects_delete on storage.objects;
-- upload: only into your own folder, and only for a photo you have declared in the receipts table
create policy receipts_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text and public.receipt_slot_open(name));
-- read: everything in your own folder (Storage must be able to SEE a file to let you delete it, even once its photo is
-- marked deleted), and the photos on shared expenses of groups you are in
create policy receipts_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.can_read_receipt(name)));
-- remove: from your own folder only
create policy receipts_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------------
-- who may run what, and the access rules for the new tables
-- ---------------------------------------------------------------------------------
revoke all on function public.can_view_entry(uuid)             from public, anon, authenticated;
revoke all on function public.can_edit_entry(uuid)             from public, anon, authenticated;
revoke all on function public.receipt_slot_open(text)          from public, anon, authenticated;
revoke all on function public.can_read_receipt(text)           from public, anon, authenticated;
revoke all on function public.enforce_receipt_rules()          from public, anon, authenticated;
revoke all on function public.keep_receipt_fixed()             from public, anon, authenticated;
revoke all on function public.keep_unpurged_receipts()         from public, anon, authenticated;
revoke all on function public.group_has_company(uuid)          from public, anon, authenticated;
revoke all on function public.delete_receipts_with_entry()     from public, anon, authenticated;
revoke all on function public.log_entry_history()              from public, anon, authenticated;
-- used inside the access rules, which run as the signed-in user
grant execute on function public.can_view_entry(uuid)    to authenticated;
grant execute on function public.can_edit_entry(uuid)    to authenticated;
grant execute on function public.receipt_slot_open(text) to authenticated;
grant execute on function public.can_read_receipt(text)  to authenticated;

alter table public.receipts      enable row level security;
alter table public.entry_history enable row level security;
alter table public.receipts      force row level security;
alter table public.entry_history force row level security;

revoke all on public.receipts      from anon, authenticated;
revoke all on public.entry_history from anon, authenticated;
grant select, insert, update on public.receipts to authenticated; -- no delete: a photo is marked deleted, then purged
grant select on public.entry_history to authenticated;            -- written only by the trigger

drop policy if exists receipts_select on public.receipts;
drop policy if exists receipts_insert on public.receipts;
drop policy if exists receipts_update on public.receipts;
create policy receipts_select on public.receipts for select to authenticated
  using (owner_id = (select auth.uid()) or public.can_view_entry(entry_id));
create policy receipts_insert on public.receipts for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.can_edit_entry(entry_id));
create policy receipts_update on public.receipts for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists entry_history_select on public.entry_history;
create policy entry_history_select on public.entry_history for select to authenticated
  using (public.is_group_member(group_id));

-- ---------------------------------------------------------------------------------
-- the profile (version 1.23): one row per account, so the name and the WhatsApp number follow the person to another phone
-- ---------------------------------------------------------------------------------
-- The email is not typed by the person: a trigger copies it from the sign-in, so the row always shows the account's own address.
-- The number is an Indian mobile number only (+91 and 10 digits starting 6 to 9) or empty. The phone sends its change time in
-- updated_at; the latest change wins (an older one is ignored, like entries). Not verified, and nothing is sent to it.
create table if not exists public.profiles (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default '' check (char_length(name) <= 40),
  email       text not null default '' check (char_length(email) <= 254),
  whatsapp    text not null default '' check (whatsapp = '' or whatsapp ~ '^\+91[6-9][0-9]{9}$'),
  updated_at  timestamptz not null default now()
);

create or replace function public.profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email := coalesce((select u.email from auth.users u where u.id = new.user_id), '');
  return new;
end;
$$;
revoke all on function public.profile_email() from public, anon, authenticated;

drop trigger if exists profiles_email on public.profiles;
create trigger profiles_email before insert or update on public.profiles
  for each row execute function public.profile_email();
drop trigger if exists profiles_keep_latest_edit on public.profiles;
create trigger profiles_keep_latest_edit before update on public.profiles
  for each row execute function public.keep_latest_edit();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated; -- no delete: the row goes with the account

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------
-- the sign-in record (version 1.25): two read-only functions, so the app can show where the account is signed in and what happened
-- ---------------------------------------------------------------------------------
-- Both run as the database owner (the `auth` tables are not readable by the app) but return only the signed-in person's own rows,
-- chosen by auth.uid() inside the function, never by an argument. No IP address is returned. Nothing can be written through them.
-- Supabase keeps a device (user agent) only for a session that is still signed in; the record of past events has a time and an action.
create or replace function public.my_sessions()
returns table (id uuid, created_at timestamptz, refreshed_at timestamptz, user_agent text, is_current boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id,
         s.created_at,
         greatest(s.created_at, coalesce(s.refreshed_at::timestamp at time zone 'UTC', s.updated_at, s.created_at)),
         s.user_agent,
         s.id::text = (select auth.jwt() ->> 'session_id')
    from auth.sessions s
   where s.user_id = (select auth.uid())
   order by s.created_at desc
   limit 20;
$$;

create or replace function public.my_sign_in_log(p_limit integer default 30)
returns table (at timestamptz, action text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.created_at, e.payload ->> 'action'
    from auth.audit_log_entries e
   where e.payload ->> 'actor_id' = (select auth.uid())::text
     and e.payload ->> 'action' in ('login', 'user_signedup', 'user_recovery_requested', 'user_modified', 'logout', 'token_revoked')
   order by e.created_at desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke all on function public.my_sessions()            from public, anon, authenticated;
revoke all on function public.my_sign_in_log(integer)  from public, anon, authenticated;
grant execute on function public.my_sessions()           to authenticated;
grant execute on function public.my_sign_in_log(integer) to authenticated;

-- ---------------------------------------------------------------------------------
-- income (version 1.26): an entry is money out (every entry until now) or money in
-- ---------------------------------------------------------------------------------
-- `kind` says which way the money went; the amount stays positive. Income is private to its owner: it cannot belong to a group and
-- cannot record a share of a shared expense. The app sends `kind` only for income, so a phone keeps syncing spending before this runs.
alter table public.entries add column if not exists kind text not null default 'out';
alter table public.entries drop constraint if exists entries_kind_known;
alter table public.entries add constraint entries_kind_known check (kind in ('out', 'in'));
alter table public.entries drop constraint if exists entries_income_private;
alter table public.entries add constraint entries_income_private check (kind = 'out' or (group_id is null and share_of is null));

-- ---------------------------------------------------------------------------------
-- primary admin and the Circle (version 1.28)
-- ---------------------------------------------------------------------------------
-- Primary admin. Every group has one: the person who made it, unless the role was handed over. The primary admin cannot be removed
-- or leave without handing the role on (remove_member, leave_group above), and only they give or take away admin rights.
-- The other admins still invite people and remove members who have settled up.
-- A group made before 1.28 gets its primary admin here: its creator while still an admin, else the longest-standing admin
-- (safe to run again: only groups with none are touched).
update public.groups g set primary_admin = coalesce(
    (select m.user_id from public.group_members m where m.group_id = g.id and m.user_id = g.created_by and m.left_at is null and m.role = 'admin'),
    (select m.user_id from public.group_members m where m.group_id = g.id and m.left_at is null and m.role = 'admin' order by m.joined_at, m.user_id limit 1))
  where g.primary_admin is null;

create or replace function public.revoke_admin(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_primary_admin(p_group) then raise exception 'Only the primary admin can do this' using errcode = '42501'; end if;
  perform 1 from public.groups g where g.id = p_group for update; -- one membership change per group at a time
  if not public.is_primary_admin(p_group) then raise exception 'Only the primary admin can do this' using errcode = '42501'; end if;
  if exists (select 1 from public.groups g where g.id = p_group and g.primary_admin = p_user) then
    raise exception 'The primary admin stays an admin: hand the role over first' using errcode = '23514';
  end if;
  update public.group_members set role = 'member' where group_id = p_group and user_id = p_user and left_at is null and role = 'admin';
  if not found then raise exception 'That person is not an admin of this group' using errcode = '22023'; end if;
end;
$$;

-- Hand the primary role to another person who is in the group now. The one handing over stays an admin.
create or replace function public.make_primary_admin(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_primary_admin(p_group) then raise exception 'Only the primary admin can do this' using errcode = '42501'; end if;
  perform 1 from public.groups g where g.id = p_group for update; -- one membership change per group at a time
  if not public.is_primary_admin(p_group) then raise exception 'Only the primary admin can do this' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) then raise exception 'You are the primary admin already' using errcode = '22023'; end if;
  update public.group_members set role = 'admin' where group_id = p_group and user_id = p_user and left_at is null;
  if not found then raise exception 'That person is not in this group' using errcode = '22023'; end if;
  update public.groups set primary_admin = p_user where id = p_group;
end;
$$;

-- A group whose primary admin is gone (the account was deleted) can be taken over by its longest-standing admin; a group that
-- has people but no admin at all, by its longest-standing member (who becomes an admin).
create or replace function public.claim_primary_admin(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  perform 1 from public.groups g where g.id = p_group for update; -- one membership change per group at a time
  if exists (
    select 1 from public.groups g
    join public.group_members m on m.group_id = g.id and m.user_id = g.primary_admin and m.left_at is null and m.role = 'admin'
    where g.id = p_group) then
    raise exception 'This group has a primary admin' using errcode = '23514';
  end if;
  if exists (select 1 from public.group_members m where m.group_id = p_group and m.left_at is null and m.role = 'admin') then
    if uid is distinct from (select m.user_id from public.group_members m where m.group_id = p_group and m.left_at is null and m.role = 'admin' order by m.joined_at, m.user_id limit 1) then
      raise exception 'Only the longest-standing admin can take over' using errcode = '42501';
    end if;
  elsif uid is distinct from (select m.user_id from public.group_members m where m.group_id = p_group and m.left_at is null order by m.joined_at, m.user_id limit 1) then
    raise exception 'Only the longest-standing member can take over a group with no admin' using errcode = '42501';
  end if;
  update public.group_members set role = 'admin' where group_id = p_group and user_id = uid;
  update public.groups set primary_admin = uid where id = p_group;
end;
$$;

-- The Circle: people you can share with. A link is a pair of people (stored once, the smaller id first). A person you share a
-- group with is in your Circle without a link (my_circle adds them). Nothing here is readable by the app directly: the tables have
-- no policies and no grants, and the functions below return only an id, a name and the names of shared groups.
create table if not exists public.circle_links (
  user_a      uuid not null references auth.users (id) on delete cascade,
  user_b      uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists circle_links_b_idx on public.circle_links (user_b);

-- A code one person sends another. It works once, for 7 days (20 hex characters, so it cannot be guessed). A used code keeps
-- used_at, even if the person who used it later deletes their account (used_by is then empty).
create table if not exists public.circle_invites (
  code        text primary key check (code ~ '^[0-9a-f]{20}$'),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_by     uuid references auth.users (id) on delete set null,
  used_at     timestamptz
);
create index if not exists circle_invites_owner_idx on public.circle_invites (owner_id);

alter table public.circle_links enable row level security;
alter table public.circle_links force row level security;
alter table public.circle_invites enable row level security;
alter table public.circle_invites force row level security;
revoke all on public.circle_links   from anon, authenticated;
revoke all on public.circle_invites from anon, authenticated;

-- How many people someone has linked (not counting people from shared groups).
create or replace function public.circle_link_count(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select count(*)::integer from public.circle_links l where l.user_a = p_user or l.user_b = p_user;
$$;

create or replace function public.circle_new_invite()
returns text
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  uid uuid := (select auth.uid());
  c text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 20); -- 80 bits: too many to guess
begin
  if uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if public.circle_link_count(uid) >= 100 then raise exception 'Your Circle is full (100 people)' using errcode = '53400'; end if;
  delete from public.circle_invites i where i.owner_id = uid and (i.expires_at < now() - interval '30 days' or (i.used_at is not null and i.used_at < now() - interval '30 days'));
  if (select count(*) from public.circle_invites i where i.owner_id = uid and i.used_at is null and i.expires_at > now()) >= 10 then
    raise exception 'You have 10 unused codes already: use or wait for one to expire' using errcode = '53400';
  end if;
  insert into public.circle_invites (code, owner_id, expires_at) values (c, uid, now() + interval '7 days');
  return c;
end;
$$;

-- Use someone's code: you and they are each in the other's Circle. Returns their name (empty if they have none).
create or replace function public.circle_join(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  uid uuid := (select auth.uid());
  norm text := lower(regexp_replace(coalesce(p_code, ''), '[^0-9a-fA-F]', '', 'g'));
  inv public.circle_invites;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  select * into inv from public.circle_invites i where i.code = norm and i.used_at is null and i.expires_at > now() for update;
  if not found then raise exception 'That code is not valid or has expired' using errcode = '22023'; end if;
  if inv.owner_id = uid then raise exception 'That is your own code' using errcode = '22023'; end if;
  if not exists (select 1 from public.circle_links l where l.user_a = least(uid, inv.owner_id) and l.user_b = greatest(uid, inv.owner_id)) then
    if public.circle_link_count(uid) >= 100 or public.circle_link_count(inv.owner_id) >= 100 then
      raise exception 'That code cannot be used' using errcode = '22023'; -- does not say whose Circle is full
    end if;
    insert into public.circle_links (user_a, user_b) values (least(uid, inv.owner_id), greatest(uid, inv.owner_id)) on conflict do nothing;
  end if;
  update public.circle_invites set used_by = uid, used_at = now() where code = inv.code;
  return coalesce((select p.name from public.profiles p where p.user_id = inv.owner_id), '');
end;
$$;

-- Take someone out of your Circle (both ways). Someone you still share a group with stays listed through that group.
create or replace function public.circle_remove(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  delete from public.circle_links l where l.user_a = least(uid, p_user) and l.user_b = greatest(uid, p_user);
  -- invitations to shared goals between the two lapse with it (a goal made later asks again)
  delete from public.shared_goal_members m using public.shared_goals g
   where g.id = m.goal_id and m.state = 'invited'
     and ((m.user_id = p_user and g.created_by = uid) or (m.user_id = uid and g.created_by = p_user));
end;
$$;

-- Your Circle: the people you linked, and everyone you share a group with now. For each: an id, a name (for someone you linked: their
-- profile name; for someone you only share a group with: the name they use in that group, so a group alias stays an alias), whether you linked them, and the names of the groups you share. Nothing else about them.
create or replace function public.my_circle()
returns table (user_id uuid, name text, linked boolean, shared_groups text[])
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then return; end if;
  return query
  with linked as (
    select case when l.user_a = uid then l.user_b else l.user_a end as other
      from public.circle_links l where l.user_a = uid or l.user_b = uid
  ), shared as (
    select o.user_id as other, g.name as group_name, o.display_name
      from public.group_members me
      join public.group_members o on o.group_id = me.group_id and o.user_id <> uid and o.left_at is null
      join public.groups g on g.id = me.group_id
     where me.user_id = uid and me.left_at is null
  ), everyone as (
    select other from linked union select other from shared
  )
  select e.other,
         case when exists (select 1 from linked k where k.other = e.other)
              then coalesce(nullif(btrim(p.name), ''), (select s.display_name from shared s where s.other = e.other order by s.group_name limit 1), '')
              else coalesce((select s.display_name from shared s where s.other = e.other order by s.group_name limit 1), nullif(btrim(p.name), ''), '')
         end,
         exists (select 1 from linked k where k.other = e.other),
         coalesce((select array_agg(distinct s.group_name order by s.group_name) from shared s where s.other = e.other), '{}')
    from everyone e
    left join public.profiles p on p.user_id = e.other
   order by 2, 1;
end;
$$;

revoke all on function public.is_primary_admin(uuid)            from public, anon, authenticated;
revoke all on function public.revoke_admin(uuid, uuid)          from public, anon, authenticated;
revoke all on function public.make_primary_admin(uuid, uuid)    from public, anon, authenticated;
revoke all on function public.claim_primary_admin(uuid)         from public, anon, authenticated;
revoke all on function public.circle_link_count(uuid)           from public, anon, authenticated;
revoke all on function public.circle_new_invite()               from public, anon, authenticated;
revoke all on function public.circle_join(text)                 from public, anon, authenticated;
revoke all on function public.circle_remove(uuid)               from public, anon, authenticated;
revoke all on function public.my_circle()                       from public, anon, authenticated;
grant execute on function public.is_primary_admin(uuid)         to authenticated;
grant execute on function public.revoke_admin(uuid, uuid)       to authenticated;
grant execute on function public.make_primary_admin(uuid, uuid) to authenticated;
grant execute on function public.claim_primary_admin(uuid)      to authenticated;
grant execute on function public.circle_new_invite()            to authenticated;
grant execute on function public.circle_join(text)              to authenticated;
grant execute on function public.circle_remove(uuid)            to authenticated;
grant execute on function public.my_circle()                    to authenticated;
-- circle_link_count is only called by the functions above (security definer): the app cannot call it.

-- ---------------------------------------------------------------------------------
-- shared goals (version 1.29)
-- ---------------------------------------------------------------------------------
-- One pot, many people: a target and a day; each person adds their own top-ups; everyone in it sees the total and who put in what.
-- Only people in the creator's Circle can be invited, and a person joins only by accepting. Nothing here is readable by the app
-- directly: the tables have no policies and no grants, and the functions below return one document (my_shared_goals).
create table if not exists public.shared_goals (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 60),
  target       numeric(12, 2) not null check (target > 0 and target < 1000000000),
  target_date  date not null check (target_date between '2000-01-01' and '2200-01-01'), -- no infinity
  created_by   uuid not null references auth.users (id) on delete cascade, -- the goal goes with its creator's account
  created_at   timestamptz not null default now()
);

-- invited: asked, not answered (an invitation lapses after 30 days). active: in it. left: out (their top-ups stay in the history, shown as left).
-- declined: said no; the creator cannot ask the same person to the same goal again.
create table if not exists public.shared_goal_members (
  goal_id       uuid not null references public.shared_goals (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  display_name  text not null default '' check (char_length(display_name) <= 40),
  state         text not null check (state in ('invited', 'active', 'left', 'declined')),
  invited_at    timestamptz not null default now(),
  primary key (goal_id, user_id)
);
create index if not exists shared_goal_members_user_idx on public.shared_goal_members (user_id);

create table if not exists public.shared_goal_topups (
  id          uuid primary key,
  goal_id     uuid not null references public.shared_goals (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  amount      numeric(12, 2) not null check (amount > 0 and amount < 1000000000),
  topup_date  date not null check (topup_date between '2000-01-01' and '2200-01-01'),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists shared_goal_topups_goal_idx on public.shared_goal_topups (goal_id);

alter table public.shared_goals        enable row level security;
alter table public.shared_goals        force row level security;
alter table public.shared_goal_members enable row level security;
alter table public.shared_goal_members force row level security;
alter table public.shared_goal_topups  enable row level security;
alter table public.shared_goal_topups  force row level security;
revoke all on public.shared_goals, public.shared_goal_members, public.shared_goal_topups from anon, authenticated;

-- Are these two people in each other's Circle (linked, or sharing a group now)? Internal.
create or replace function public.circle_has(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select p_a <> p_b and (
    exists (select 1 from public.circle_links l where l.user_a = least(p_a, p_b) and l.user_b = greatest(p_a, p_b))
    or exists (select 1 from public.group_members x join public.group_members y on y.group_id = x.group_id and y.user_id = p_b and y.left_at is null
                where x.user_id = p_a and x.left_at is null)
  );
$$;

-- How many shared goals a person is in (the cap is 20; invitations do not count), and how many people a goal holds or has asked (the cap is 10).
create or replace function public.shared_goal_count(p_user uuid)
returns integer language sql stable security definer set search_path = '' set row_security = off
as $$ select count(*)::integer from public.shared_goal_members m where m.user_id = p_user and m.state = 'active'; $$;
create or replace function public.shared_goal_people(p_goal uuid)
returns integer language sql stable security definer set search_path = '' set row_security = off
as $$ select count(*)::integer from public.shared_goal_members m where m.goal_id = p_goal and (m.state = 'active' or (m.state = 'invited' and m.invited_at > now() - interval '30 days')); $$;

-- Lock the goal and say who made it: every change below starts here, so two changes to one goal never overlap.
create or replace function public.lock_shared_goal(p_goal uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare owner uuid;
begin
  select g.created_by into owner from public.shared_goals g where g.id = p_goal for update;
  if owner is null then raise exception 'That goal is not here' using errcode = '22023'; end if;
  return owner;
end;
$$;

-- Ask someone (in the creator's Circle) to join. Used by create_shared_goal and invite_to_shared_goal.
create or replace function public.ask_to_join_shared_goal(p_goal uuid, p_owner uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare cur public.shared_goal_members;
begin
  if not public.circle_has(p_owner, p_user) then raise exception 'You can only invite people in your Circle' using errcode = '42501'; end if;
  -- one invitation at a time per person, so the caps below hold even when two people ask the same person together
  perform pg_advisory_xact_lock(hashtextextended('shared-goal:' || p_user::text, 0));
  select * into cur from public.shared_goal_members m where m.goal_id = p_goal and m.user_id = p_user;
  -- already in, already asked and still waiting, or said no: nothing to do (a "no" is final for this goal)
  if found and (cur.state in ('active', 'declined') or (cur.state = 'invited' and cur.invited_at > now() - interval '30 days')) then return; end if;
  if public.shared_goal_people(p_goal) >= 10 then raise exception 'A shared goal holds at most 10 people' using errcode = '53400'; end if;
  -- a person is not flooded: at most 10 invitations waiting, at most 3 from the same creator, and room in their own 20
  if (select count(*) from public.shared_goal_members m where m.user_id = p_user and m.state = 'invited' and m.invited_at > now() - interval '30 days') >= 10
     or (select count(*) from public.shared_goal_members m join public.shared_goals g on g.id = m.goal_id
          where m.user_id = p_user and g.created_by = p_owner and m.state = 'invited' and m.invited_at > now() - interval '30 days') >= 3
     or public.shared_goal_count(p_user) >= 20 then
    raise exception 'That person cannot be invited right now' using errcode = '53400';
  end if;
  insert into public.shared_goal_members (goal_id, user_id, state) values (p_goal, p_user, 'invited')
  on conflict (goal_id, user_id) do update set state = 'invited', invited_at = now();
end;
$$;

create or replace function public.create_shared_goal(p_name text, p_target numeric, p_date date, p_display_name text, p_invite uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  uid uuid := (select auth.uid());
  nm text := btrim(coalesce(p_name, ''));
  dn text := btrim(coalesce(p_display_name, ''));
  gid uuid;
  u uuid;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if char_length(nm) not between 1 and 60 then raise exception 'Give the goal a name of 1 to 60 characters' using errcode = '22023'; end if;
  if p_target is null or p_target <= 0 or p_target >= 1000000000 or scale(p_target) > 2 then raise exception 'The target must be above zero, with at most 2 decimals' using errcode = '22023'; end if;
  if p_date is null or p_date < current_date - 1 or p_date > current_date + interval '50 years' then raise exception 'Pick a target date after today' using errcode = '22023'; end if;
  if char_length(dn) not between 1 and 40 then raise exception 'Enter the name others will see you as (1 to 40 characters)' using errcode = '22023'; end if;
  if coalesce(array_length(p_invite, 1), 0) > 9 then raise exception 'A shared goal holds at most 10 people' using errcode = '53400'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shared-goal:' || uid::text, 0));
  if public.shared_goal_count(uid) >= 20 then raise exception 'You are in as many shared goals as one account can keep' using errcode = '53400'; end if;
  insert into public.shared_goals (name, target, target_date, created_by) values (nm, p_target, p_date, uid) returning id into gid;
  insert into public.shared_goal_members (goal_id, user_id, display_name, state) values (gid, uid, dn, 'active');
  foreach u in array coalesce((select array_agg(distinct x order by x) from unnest(p_invite) x), '{}') loop -- sorted: two creators asking the same people never wait on each other in a circle
    perform public.ask_to_join_shared_goal(gid, uid, u);
  end loop;
  return gid;
end;
$$;

create or replace function public.invite_to_shared_goal(p_goal uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare uid uuid := (select auth.uid());
begin
  if public.lock_shared_goal(p_goal) is distinct from uid then raise exception 'Only the person who made the goal can do this' using errcode = '42501'; end if;
  perform public.ask_to_join_shared_goal(p_goal, uid, p_user);
end;
$$;

-- Answer an invitation. Declining forgets it; accepting makes the person a member under the name they give.
create or replace function public.answer_shared_goal(p_goal uuid, p_accept boolean, p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  uid uuid := (select auth.uid());
  dn text := btrim(coalesce(p_display_name, ''));
begin
  perform public.lock_shared_goal(p_goal);
  if not exists (select 1 from public.shared_goal_members m where m.goal_id = p_goal and m.user_id = uid and m.state = 'invited' and m.invited_at > now() - interval '30 days') then
    raise exception 'There is no invitation to answer' using errcode = '22023';
  end if;
  if not coalesce(p_accept, false) then
    update public.shared_goal_members set state = 'declined' where goal_id = p_goal and user_id = uid; -- remembered: the creator cannot ask again
    return;
  end if;
  if char_length(dn) not between 1 and 40 then raise exception 'Enter the name others will see you as (1 to 40 characters)' using errcode = '22023'; end if;
  update public.shared_goal_members set state = 'active', display_name = dn where goal_id = p_goal and user_id = uid;
end;
$$;

create or replace function public.leave_shared_goal(p_goal uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare uid uuid := (select auth.uid());
begin
  if public.lock_shared_goal(p_goal) = uid then raise exception 'The person who made the goal deletes it instead of leaving' using errcode = '23514'; end if;
  update public.shared_goal_members set state = 'left' where goal_id = p_goal and user_id = uid and state = 'active';
  if not found then raise exception 'You are not in this goal' using errcode = '42501'; end if;
end;
$$;

-- The creator takes someone out (their top-ups stay in the history, as left) or withdraws an invitation.
create or replace function public.remove_from_shared_goal(p_goal uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare uid uuid := (select auth.uid());
begin
  if public.lock_shared_goal(p_goal) is distinct from uid then raise exception 'Only the person who made the goal can do this' using errcode = '42501'; end if;
  if p_user = uid then raise exception 'You made this goal: delete it instead' using errcode = '22023'; end if;
  delete from public.shared_goal_members where goal_id = p_goal and user_id = p_user and state = 'invited';
  update public.shared_goal_members set state = 'left' where goal_id = p_goal and user_id = p_user and state = 'active';
end;
$$;

create or replace function public.edit_shared_goal(p_goal uuid, p_name text, p_target numeric, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare nm text := btrim(coalesce(p_name, ''));
begin
  if public.lock_shared_goal(p_goal) is distinct from (select auth.uid()) then raise exception 'Only the person who made the goal can do this' using errcode = '42501'; end if;
  if char_length(nm) not between 1 and 60 then raise exception 'Give the goal a name of 1 to 60 characters' using errcode = '22023'; end if;
  if p_target is null or p_target <= 0 or p_target >= 1000000000 or scale(p_target) > 2 then raise exception 'The target must be above zero, with at most 2 decimals' using errcode = '22023'; end if;
  if p_date is null or p_date < '2000-01-01' or p_date > current_date + interval '50 years' then raise exception 'Pick a target date' using errcode = '22023'; end if;
  update public.shared_goals set name = nm, target = p_target, target_date = p_date where id = p_goal;
end;
$$;

create or replace function public.delete_shared_goal(p_goal uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if public.lock_shared_goal(p_goal) is distinct from (select auth.uid()) then raise exception 'Only the person who made the goal can do this' using errcode = '42501'; end if;
  delete from public.shared_goals where id = p_goal;
end;
$$;

create or replace function public.add_shared_topup(p_goal uuid, p_id uuid, p_amount numeric, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare uid uuid := (select auth.uid());
begin
  perform public.lock_shared_goal(p_goal);
  if not exists (select 1 from public.shared_goal_members m where m.goal_id = p_goal and m.user_id = uid and m.state = 'active') then
    raise exception 'You are not in this goal' using errcode = '42501';
  end if;
  if p_id is null then raise exception 'A top-up needs an id' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000 or scale(p_amount) > 2 then raise exception 'The amount must be above zero, with at most 2 decimals' using errcode = '22023'; end if;
  -- a day up to one ahead of the server's is allowed: the phone's today may be a day ahead (India in the early morning)
  if p_date is null or p_date > current_date + 1 or p_date < current_date - interval '10 years' then raise exception 'Pick a day that is today or earlier' using errcode = '22023'; end if;
  if (select count(*) from public.shared_goal_topups t where t.goal_id = p_goal and t.user_id = uid) >= 2000 then
    raise exception 'That is the most top-ups one person can keep in a goal' using errcode = '53400';
  end if;
  insert into public.shared_goal_topups (id, goal_id, user_id, amount, topup_date) values (p_id, p_goal, uid, p_amount, p_date)
  on conflict (id) do nothing;
  -- the same top-up sent twice (a retry) is stored once; an id already used for something else is refused, never silently dropped
  if not found and not exists (select 1 from public.shared_goal_topups t where t.id = p_id and t.goal_id = p_goal and t.user_id = uid and t.amount = p_amount and t.topup_date = p_date) then
    raise exception 'That top-up id is already used' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.remove_shared_topup(p_goal uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare uid uuid := (select auth.uid());
begin
  perform public.lock_shared_goal(p_goal);
  update public.shared_goal_topups set deleted_at = now()
   where id = p_id and goal_id = p_goal and user_id = uid and deleted_at is null
     and exists (select 1 from public.shared_goal_members m where m.goal_id = p_goal and m.user_id = uid and m.state = 'active');
  if not found then raise exception 'That top-up is not yours or is gone' using errcode = '42501'; end if;
end;
$$;

-- Everything the caller may see, as one document: {"goals": [...]}.
-- An invitation shows only the goal, its target, its day and who made it. A member also sees the people (id, the name each gave, and
-- invited, active or left) and every top-up (id, who, amount, day). A person who has left sees nothing of the goal any more.
create or replace function public.my_shared_goals()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then return jsonb_build_object('goals', '[]'::jsonb); end if;
  return jsonb_build_object('goals', coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'target', g.target, 'date', g.target_date, 'created_by', g.created_by,
        'me', me.state,
        'creator_name', coalesce((select c.display_name from public.shared_goal_members c where c.goal_id = g.id and c.user_id = g.created_by), ''),
        'members', case when me.state = 'active' then coalesce((
            select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', m.display_name, 'state', m.state) order by m.invited_at, m.user_id)
              from public.shared_goal_members m where m.goal_id = g.id and m.state <> 'declined' and (m.state <> 'invited' or m.invited_at > now() - interval '30 days')), '[]'::jsonb) else '[]'::jsonb end,
        'topups', case when me.state = 'active' then coalesce((
            select jsonb_agg(jsonb_build_object('id', t.id, 'user_id', t.user_id, 'amount', t.amount, 'date', t.topup_date) order by t.topup_date desc, t.created_at desc, t.id)
              from public.shared_goal_topups t where t.goal_id = g.id and t.deleted_at is null), '[]'::jsonb) else '[]'::jsonb end
      ) order by g.target_date, g.name, g.id)
    from public.shared_goals g
    join public.shared_goal_members me on me.goal_id = g.id and me.user_id = uid and (me.state = 'active' or (me.state = 'invited' and me.invited_at > now() - interval '30 days'))
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.circle_has(uuid, uuid)                                    from public, anon, authenticated;
revoke all on function public.shared_goal_count(uuid)                                   from public, anon, authenticated;
revoke all on function public.shared_goal_people(uuid)                                  from public, anon, authenticated;
revoke all on function public.lock_shared_goal(uuid)                                    from public, anon, authenticated;
revoke all on function public.ask_to_join_shared_goal(uuid, uuid, uuid)                 from public, anon, authenticated;
revoke all on function public.create_shared_goal(text, numeric, date, text, uuid[])     from public, anon, authenticated;
revoke all on function public.invite_to_shared_goal(uuid, uuid)                         from public, anon, authenticated;
revoke all on function public.answer_shared_goal(uuid, boolean, text)                   from public, anon, authenticated;
revoke all on function public.leave_shared_goal(uuid)                                   from public, anon, authenticated;
revoke all on function public.remove_from_shared_goal(uuid, uuid)                       from public, anon, authenticated;
revoke all on function public.edit_shared_goal(uuid, text, numeric, date)               from public, anon, authenticated;
revoke all on function public.delete_shared_goal(uuid)                                  from public, anon, authenticated;
revoke all on function public.add_shared_topup(uuid, uuid, numeric, date)               from public, anon, authenticated;
revoke all on function public.remove_shared_topup(uuid, uuid)                           from public, anon, authenticated;
revoke all on function public.my_shared_goals()                                         from public, anon, authenticated;
grant execute on function public.create_shared_goal(text, numeric, date, text, uuid[])  to authenticated;
grant execute on function public.invite_to_shared_goal(uuid, uuid)                      to authenticated;
grant execute on function public.answer_shared_goal(uuid, boolean, text)                to authenticated;
grant execute on function public.leave_shared_goal(uuid)                                to authenticated;
grant execute on function public.remove_from_shared_goal(uuid, uuid)                    to authenticated;
grant execute on function public.edit_shared_goal(uuid, text, numeric, date)            to authenticated;
grant execute on function public.delete_shared_goal(uuid)                               to authenticated;
grant execute on function public.add_shared_topup(uuid, uuid, numeric, date)            to authenticated;
grant execute on function public.remove_shared_topup(uuid, uuid)                        to authenticated;
grant execute on function public.my_shared_goals()                                      to authenticated;
-- circle_has, shared_goal_count, shared_goal_people, lock_shared_goal and ask_to_join_shared_goal are internal: the app cannot call them.

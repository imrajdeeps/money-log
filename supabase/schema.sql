-- Money Log, Release 1 — database schema and access rules.
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
-- Read it first: nothing here is applied automatically. It is safe to run again
-- (objects use IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS).
--
-- What it creates
--   entries      one row per payment you log on the phone
--   plan_blocks  the plan numbers you paste in from the spreadsheet's "App export" tab
--                (one row per block; Release 1 uses block = 'budget')
--
-- Access rule, in one sentence: a signed-in user can read and write ONLY rows whose
-- owner_id is their own user id; the anonymous role has no access at all.

-- ---------------------------------------------------------------------------------
-- entries
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

-- ---------------------------------------------------------------------------------
-- plan_blocks
-- ---------------------------------------------------------------------------------
create table if not exists public.plan_blocks (
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  block        text not null check (char_length(block) between 1 and 40),
  imported_at  timestamptz not null default now(),
  payload      jsonb not null check (octet_length(payload::text) < 262144),
  primary key (owner_id, block)
);

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

-- ---------------------------------------------------------------------------------
-- latest edit wins, on the server too
-- A write whose updated_at is OLDER than the stored row's is ignored, so a phone that was offline for days, or whose
-- clock is behind, can never overwrite a newer edit made elsewhere. An equal updated_at is accepted (re-sending the
-- same edit is harmless). Triggers fire in name order, so this runs before entries_touch_synced_at.
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

-- ---------------------------------------------------------------------------------
-- access rules (row-level security): everything denied unless a policy allows it
-- ---------------------------------------------------------------------------------
alter table public.entries     enable row level security;
alter table public.plan_blocks enable row level security;
alter table public.entries     force row level security;
alter table public.plan_blocks force row level security;

revoke all on public.entries     from anon, authenticated;
revoke all on public.plan_blocks from anon, authenticated;
grant select, insert, update, delete on public.entries     to authenticated;
grant select, insert, update, delete on public.plan_blocks to authenticated;

drop policy if exists entries_select on public.entries;
drop policy if exists entries_insert on public.entries;
drop policy if exists entries_update on public.entries;
drop policy if exists entries_delete on public.entries;
create policy entries_select on public.entries for select to authenticated
  using (owner_id = (select auth.uid()));
create policy entries_insert on public.entries for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy entries_update on public.entries for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy entries_delete on public.entries for delete to authenticated
  using (owner_id = (select auth.uid()));

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

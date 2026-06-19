-- Migration: let users remove a RECEIVED tape from their own library.
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query). Idempotent.
--
-- A received tape belongs to its CREATOR, so we don't delete it — we record that this
-- user has hidden it. getReceivedTapes() then filters these out. The hide persists even
-- if the old share link is reopened later (the "I want it gone for good" case), and the
-- creator's analytics are untouched.

create table if not exists hidden_received_tapes (
  user_id    uuid not null references profiles (id) on delete cascade,
  tape_id    uuid not null references tapes (id)    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tape_id)
);

alter table hidden_received_tapes enable row level security;

drop policy if exists "Users read own hides" on hidden_received_tapes;
create policy "Users read own hides"
  on hidden_received_tapes for select using (auth.uid() = user_id);

drop policy if exists "Users add own hides" on hidden_received_tapes;
create policy "Users add own hides"
  on hidden_received_tapes for insert with check (auth.uid() = user_id);

drop policy if exists "Users remove own hides" on hidden_received_tapes;
create policy "Users remove own hides"
  on hidden_received_tapes for delete using (auth.uid() = user_id);

-- Table grants — SQL-editor-created tables don't inherit anon/authenticated grants,
-- so RLS alone would still throw 42501 "permission denied" (same fix as the social tables).
grant select, insert, delete on table hidden_received_tapes to authenticated;

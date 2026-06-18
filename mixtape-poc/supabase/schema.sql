-- MixTape Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ─────────────────────────────────────────────────────────────────────────────
-- PROFILES  (one row per auth user, auto-created on first sign-in)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id         uuid primary key references auth.users on delete cascade,
  email      text,
  plan       text not null default 'free',   -- 'free' | 'pro' (future monetisation hook)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "Users can read own profile" on profiles;
create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- Auto-create a profile row when a new user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();


-- ─────────────────────────────────────────────────────────────────────────────
-- TAPES
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists tapes (
  id         uuid primary key default gen_random_uuid(),
  share_id   text unique not null default lower(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  creator_id uuid references profiles (id) on delete set null,

  tape_name  text not null default '',
  skin       text not null default 'rainbow',
  note       text not null default '',

  -- Tracks stored as JSONB arrays.
  -- Each track object shape:
  -- {
  --   id, title, artist, durationMs, durationLabel,
  --   platform_ids: { youtube: "...", apple_music: "..." },   ← engine-agnostic
  --   ytConfirmed: bool
  -- }
  tracks_a   jsonb not null default '[]',
  tracks_b   jsonb not null default '[]',

  status     text not null default 'published',  -- 'draft' | 'published'

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table tapes enable row level security;

-- Anyone can read a published tape (needed for share links)
drop policy if exists "Anyone can read published tapes" on tapes;
create policy "Anyone can read published tapes"
  on tapes for select using (status = 'published');

-- Creators can read their own tapes (including drafts)
drop policy if exists "Creators can read own tapes" on tapes;
create policy "Creators can read own tapes"
  on tapes for select using (auth.uid() = creator_id);

-- Creators can insert
drop policy if exists "Creators can insert tapes" on tapes;
create policy "Creators can insert tapes"
  on tapes for insert with check (auth.uid() = creator_id);

-- Creators can update their own tapes
drop policy if exists "Creators can update own tapes" on tapes;
create policy "Creators can update own tapes"
  on tapes for update using (auth.uid() = creator_id);

-- Creators can delete their own tapes (without this, library "delete" is blocked
-- by RLS and silently does nothing).
drop policy if exists "Creators can delete own tapes" on tapes;
create policy "Creators can delete own tapes"
  on tapes for delete using (auth.uid() = creator_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- TAPE RECIPIENTS
-- Tracks who a tape was sent to. Enables "your tape was opened" notifications.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists tape_recipients (
  id              uuid primary key default gen_random_uuid(),
  tape_id         uuid not null references tapes (id) on delete cascade,
  recipient_email text,              -- optional — only if creator provides it
  opened_at       timestamptz,       -- set when tape_opened event fires
  played_at       timestamptz,       -- set when tape_played event fires
  completed_at    timestamptz,       -- set when tape_completed event fires
  created_at      timestamptz not null default now()
);

alter table tape_recipients enable row level security;

-- Creators can read recipients for their tapes
drop policy if exists "Creators can read own tape recipients" on tape_recipients;
create policy "Creators can read own tape recipients"
  on tape_recipients for select
  using (
    exists (
      select 1 from tapes where tapes.id = tape_id and tapes.creator_id = auth.uid()
    )
  );

-- Anyone can insert a recipient row (anon users opening a tape)
drop policy if exists "Anyone can insert tape recipients" on tape_recipients;
create policy "Anyone can insert tape recipients"
  on tape_recipients for insert with check (true);

-- Anyone can update a recipient row (to record opened_at / played_at)
drop policy if exists "Anyone can update tape recipients" on tape_recipients;
create policy "Anyone can update tape recipients"
  on tape_recipients for update using (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- EVENTS  (analytics: tape_opened | tape_played | tape_completed)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists events (
  id           uuid primary key default gen_random_uuid(),
  tape_id      uuid references tapes (id) on delete cascade,
  event_type   text not null,           -- 'tape_opened' | 'tape_played' | 'tape_completed'
  session_id   uuid,                    -- client-generated UUID per browser session — groups repeat plays
  viewer_id    uuid references profiles (id) on delete set null,  -- null = anonymous
  metadata     jsonb not null default '{}',  -- spare bag for future fields (side played, track count, etc.)
  created_at   timestamptz not null default now()
);

alter table events enable row level security;

-- Anyone can insert events (anon listeners)
drop policy if exists "Anyone can insert events" on events;
create policy "Anyone can insert events"
  on events for insert with check (true);

-- Creators can read events for their tapes
drop policy if exists "Creators can read own tape events" on events;
create policy "Creators can read own tape events"
  on events for select
  using (
    exists (
      select 1 from tapes where tapes.id = tape_id and tapes.creator_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- HELPER: updated_at auto-stamp
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tapes_updated_at on tapes;
create trigger tapes_updated_at
  before update on tapes
  for each row execute procedure set_updated_at();

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure set_updated_at();


-- ═════════════════════════════════════════════════════════════════════════════
-- SOCIAL + V1 SCHEMA  (added June 2026)
-- These objects are used by the deployed app (db.js, useNotifications.js) but
-- were originally created ad-hoc in the SQL editor and never written back here.
-- This whole section is IDEMPOTENT — safe to run (or re-run) in the Supabase
-- SQL Editor to verify and complete your project's schema.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Missing columns on TAPES (cover photo, cover colour, forwarding) ──────────
alter table tapes add column if not exists cover_image_url text;
alter table tapes add column if not exists cover_color     text;
alter table tapes add column if not exists allow_forward   boolean not null default false;


-- ── REACTIONS (❤️ likes) ──────────────────────────────────────────────────────
create table if not exists reactions (
  id         uuid primary key default gen_random_uuid(),
  tape_id    uuid not null references tapes (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tape_id, user_id)
);

alter table reactions enable row level security;

drop policy if exists "Anyone can read reactions" on reactions;
create policy "Anyone can read reactions"
  on reactions for select using (true);

drop policy if exists "Users can like as themselves" on reactions;
create policy "Users can like as themselves"
  on reactions for insert with check (auth.uid() = user_id);

drop policy if exists "Users can remove own like" on reactions;
create policy "Users can remove own like"
  on reactions for delete using (auth.uid() = user_id);


-- ── COMMENTS ──────────────────────────────────────────────────────────────────
create table if not exists comments (
  id          uuid primary key default gen_random_uuid(),
  tape_id     uuid not null references tapes (id) on delete cascade,
  user_id     uuid not null references profiles (id) on delete cascade,
  author_name text,   -- display name only (NEVER the raw email — this table is world-readable)
  body        text not null,
  created_at  timestamptz not null default now()
);

alter table comments enable row level security;

drop policy if exists "Anyone can read comments" on comments;
create policy "Anyone can read comments"
  on comments for select using (true);

drop policy if exists "Users can comment as themselves" on comments;
create policy "Users can comment as themselves"
  on comments for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete own comment" on comments;
create policy "Users can delete own comment"
  on comments for delete using (auth.uid() = user_id);


-- ── NOTIFICATIONS (in-app bell — likes / comments / plays) ────────────────────
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,  -- recipient (tape creator)
  type       text not null,                 -- 'like' | 'comment' | 'play'
  tape_id    uuid references tapes (id) on delete cascade,
  from_email text,                          -- actor's email (null if anonymous)
  message    text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;

drop policy if exists "Users read own notifications" on notifications;
create policy "Users read own notifications"
  on notifications for select using (auth.uid() = user_id);

drop policy if exists "Users update own notifications" on notifications;
create policy "Users update own notifications"
  on notifications for update using (auth.uid() = user_id);

-- Live delivery: notifications must be in the realtime publication
-- (wrapped so re-running doesn't error if already added).
do $$
begin
  alter publication supabase_realtime add table notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;


-- ── NOTIFICATION TRIGGERS (security definer — bypass RLS to insert for creator) ─

-- New like → notify the tape creator (skip self-likes)
create or replace function notify_on_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_creator uuid; v_name text; v_from text;
begin
  select creator_id, tape_name into v_creator, v_name from tapes where id = new.tape_id;
  if v_creator is null or v_creator = new.user_id then return new; end if;
  select email into v_from from profiles where id = new.user_id;
  insert into notifications (user_id, type, tape_id, from_email, message)
  values (v_creator, 'like', new.tape_id, v_from,
          coalesce(v_from, 'Someone') || ' loved "' || coalesce(nullif(v_name, ''), 'your tape') || '"');
  return new;
end; $$;

drop trigger if exists on_reaction_created on reactions;
create trigger on_reaction_created
  after insert on reactions
  for each row execute procedure notify_on_like();

-- New comment → notify the tape creator (skip self-comments)
create or replace function notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_creator uuid; v_name text;
begin
  select creator_id, tape_name into v_creator, v_name from tapes where id = new.tape_id;
  if v_creator is null or v_creator = new.user_id then return new; end if;
  insert into notifications (user_id, type, tape_id, from_email, message)
  values (v_creator, 'comment', new.tape_id, new.user_email,
          coalesce(new.user_email, 'Someone') || ' commented on "' || coalesce(nullif(v_name, ''), 'your tape') || '"');
  return new;
end; $$;

drop trigger if exists on_comment_created on comments;
create trigger on_comment_created
  after insert on comments
  for each row execute procedure notify_on_comment();

-- Tape played → notify the tape creator (only on 'tape_played', skip creator's own plays)
create or replace function notify_on_play()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_creator uuid; v_name text; v_from text;
begin
  if new.event_type <> 'tape_played' then return new; end if;
  select creator_id, tape_name into v_creator, v_name from tapes where id = new.tape_id;
  if v_creator is null or v_creator = new.viewer_id then return new; end if;
  if new.viewer_id is not null then
    select email into v_from from profiles where id = new.viewer_id;
  end if;
  insert into notifications (user_id, type, tape_id, from_email, message)
  values (v_creator, 'play', new.tape_id, v_from,
          coalesce(v_from, 'Someone') || ' played "' || coalesce(nullif(v_name, ''), 'your tape') || '"');
  return new;
end; $$;

drop trigger if exists on_play_event on events;
create trigger on_play_event
  after insert on events
  for each row execute procedure notify_on_play();


-- ── STORAGE: cover-photo bucket (used by db.js uploadCoverPhoto) ──────────────
-- Bucket "tape-covers" must exist and be public. Create it idempotently:
insert into storage.buckets (id, name, public)
values ('tape-covers', 'tape-covers', true)
on conflict (id) do nothing;

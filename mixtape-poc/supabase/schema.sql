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

create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);

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
create policy "Anyone can read published tapes"
  on tapes for select using (status = 'published');

-- Creators can read their own tapes (including drafts)
create policy "Creators can read own tapes"
  on tapes for select using (auth.uid() = creator_id);

-- Creators can insert
create policy "Creators can insert tapes"
  on tapes for insert with check (auth.uid() = creator_id);

-- Creators can update their own tapes
create policy "Creators can update own tapes"
  on tapes for update using (auth.uid() = creator_id);


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
create policy "Creators can read own tape recipients"
  on tape_recipients for select
  using (
    exists (
      select 1 from tapes where tapes.id = tape_id and tapes.creator_id = auth.uid()
    )
  );

-- Anyone can insert a recipient row (anon users opening a tape)
create policy "Anyone can insert tape recipients"
  on tape_recipients for insert with check (true);

-- Anyone can update a recipient row (to record opened_at / played_at)
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
create policy "Anyone can insert events"
  on events for insert with check (true);

-- Creators can read events for their tapes
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

create trigger tapes_updated_at
  before update on tapes
  for each row execute procedure set_updated_at();

create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure set_updated_at();

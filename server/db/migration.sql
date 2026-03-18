-- InstaWorld — Supabase database migration
-- Run this in your Supabase SQL Editor (https://app.supabase.com → SQL Editor)

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Users table (one row per Instagram account)
create table if not exists public.users (
  id                   uuid primary key default uuid_generate_v4(),
  instagram_id         text unique not null,
  username             text not null,
  follower_count       integer not null default 0,
  profile_picture_url  text not null default '',
  building_position_x  float not null default 0,
  building_position_z  float not null default 0,
  created_at           timestamptz not null default now()
);

-- Index for fast username lookups (search bar)
create index if not exists users_username_idx on public.users (lower(username));

-- Index for building position uniqueness checks
create index if not exists users_position_idx on public.users (building_position_x, building_position_z);

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.users enable row level security;

-- Anyone (guests + logged-in users) can read all buildings
create policy "Public read"
  on public.users for select
  using (true);

-- Allow anon key (server backend) to insert and update
-- The server is the only one that calls these — it validates via Instagram OAuth first
create policy "Backend insert"
  on public.users for insert
  with check (true);

create policy "Backend update"
  on public.users for update
  using (true)
  with check (true);

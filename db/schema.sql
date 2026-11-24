-- Jarvis Board schema (cloudhike Postgres). Idempotent: safe to run repeatedly.
create extension if not exists pgcrypto;

create table if not exists boards (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  "order" integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists boards_user_idx on boards (user_id, "order");

create table if not exists widgets (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  user_id text not null,
  type text not null,
  title text not null,
  size text not null default 'M' check (size in ('S','M','L')),
  position integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  refresh_rule text,
  created_at timestamptz not null default now()
);
create index if not exists widgets_board_idx on widgets (board_id, position);
create index if not exists widgets_user_idx on widgets (user_id);

create table if not exists widget_data (
  widget_id uuid primary key references widgets(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists connections (
  user_id text not null,
  toolkit text not null,
  status text not null default 'disconnected',
  updated_at timestamptz not null default now(),
  primary key (user_id, toolkit)
);

create unique index if not exists boards_user_name_uniq on boards (user_id, name);

create table if not exists user_settings (
  user_id text primary key,
  ai_provider text,
  updated_at timestamptz not null default now()
);

-- Fixed grid placement (12 columns). Null until first placed.
alter table widgets add column if not exists x integer;
alter table widgets add column if not exists y integer;
alter table widgets add column if not exists w integer;
alter table widgets add column if not exists h integer;

-- Composio connections (one row per user + toolkit).
alter table connections add column if not exists connected_account_id text;
alter table connections add column if not exists connected_at timestamptz;
alter table connections add column if not exists last_synced_at timestamptz;

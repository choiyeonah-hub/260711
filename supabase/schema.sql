-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
-- Stores every saju-based lotto draw: birth info, saju analysis, and the recommended numbers.

create table if not exists saju_draws (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  birth_date date not null,
  birth_time text,
  gender text check (gender in ('male', 'female', 'unspecified')),
  pillars jsonb,
  element_counts jsonb,
  dominant_element text,
  blurb text,
  numbers integer[] not null
);

-- RLS is enabled with no policies: only the service_role key (used by the
-- api/saju.js serverless function) can read or write this table.
alter table saju_draws enable row level security;

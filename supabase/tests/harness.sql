-- Test harness. This file is NOT part of the portal and is never run against
-- the real project.
--
-- Its only job is to give a bare PostgreSQL instance the few things the
-- managed platform provides, so that supabase/schema.sql and
-- supabase/tests/isolation.sql can be executed exactly as written, with no
-- edits, before anybody pastes them into a dashboard.
--
-- What it emulates, and nothing more:
--   the four roles the schema grants to,
--   auth.jwt() and auth.uid() reading request.jwt.claims, which is how
--     PostgREST passes the verified token into the session,
--   auth.users, so a seat can be bound to an account,
--   storage.buckets, storage.objects and storage.foldername.
--
-- Where the emulation is a guess rather than a documented fact it says so.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
create role anon nologin;
create role authenticated nologin;
create role supabase_auth_admin nologin;

-- ---------------------------------------------------------------------------
-- auth
-- ---------------------------------------------------------------------------
create schema if not exists auth;

create table auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  created_at timestamptz not null default now()
);

-- The claims of the verified token are placed in request.jwt.claims for the
-- life of the request. Reading them with the "missing_ok" form of
-- current_setting means these return null rather than erroring when no token
-- is present, which is what lets the audit trigger run during seeding.
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb;
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), ''
  )::uuid;
$$;

grant usage on schema auth to anon, authenticated, supabase_auth_admin;
grant execute on function auth.jwt() to anon, authenticated, supabase_auth_admin;
grant execute on function auth.uid() to anon, authenticated, supabase_auth_admin;
grant select on auth.users to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- storage
-- ---------------------------------------------------------------------------
create schema if not exists storage;

create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id),
  name       text,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

-- The public documentation shows this function in use, as
-- (storage.foldername(name))[1], but does not publish its signature or return
-- type, which is recorded as unverified in RESEARCH.md. The behaviour
-- implemented here is the one that documented usage requires: for the path
-- "private/file.txt" the first element is "private", so the function returns
-- the folder segments and drops the file name.
create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  if array_length(parts, 1) is null or array_length(parts, 1) < 2 then
    return array[]::text[];
  end if;
  return parts[1 : array_length(parts, 1) - 1];
end;
$$;

grant usage on schema storage to anon, authenticated;
grant execute on function storage.foldername(text) to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

-- ---------------------------------------------------------------------------
-- Nine accounts, one per seeded seat, so the seat binding and the session
-- enforcement tests have something real to bind to. On the live project these
-- are created in the dashboard.
-- ---------------------------------------------------------------------------
insert into auth.users (email) values
  ('harborline.admin@fieldstone.example'),
  ('harborline.manager@fieldstone.example'),
  ('harborline.lo@fieldstone.example'),
  ('bayoucity.admin@fieldstone.example'),
  ('bayoucity.manager@fieldstone.example'),
  ('bayoucity.lo@fieldstone.example'),
  ('redoak.admin@fieldstone.example'),
  ('redoak.manager@fieldstone.example'),
  ('redoak.lo@fieldstone.example');

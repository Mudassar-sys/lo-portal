-- Fieldstone Lending Network: schema, row level security, storage and seed.
--
-- Run once in the Supabase SQL editor. Safe to re-run: it drops and recreates
-- everything it owns.
--
-- Reading order for a reviewer:
--   1. Tables. Every tenant table carries org_id not null.
--   2. Indexes. Every column a policy filters on is indexed.
--   3. Grants. Nothing is exposed to the Data API implicitly any more.
--   4. Policies. Every policy names the role with "to authenticated".
--   5. The access token hook. It is what puts org_id, org_role and seat_id
--      into the token, and it is what enforces one session per named seat.
--   6. Storage. The same tenant rule applied to object paths.
--   7. Audit. Written only by a security definer trigger.
--   8. Seed data.
--   9. Row level security is enabled and forced at the very end, so that the
--      seed inserts in step 8 run before the table owner loses its exemption.
--
-- Two notes a reviewer will look for.
--
-- First: the token claim carrying the portal role is called org_role, NOT
-- role. The standard role claim is what Supabase uses to choose the Postgres
-- role for the request, documented as "The Postgres role to use when applying
-- Row Level Security policies" at supabase.com/docs/guides/auth/jwts.
-- Overwriting it with org_admin, manager or loan_officer would break every
-- request. So role stays authenticated and the portal role travels beside it.
--
-- Second: no policy reads user_metadata. End users can modify user_metadata,
-- so it is never a basis for access. Every claim used below is written by the
-- hook, which runs as supabase_auth_admin and which the user cannot call.

-- ---------------------------------------------------------------------------
-- 0. Drop, in dependency order, so the file can be re-run.
-- ---------------------------------------------------------------------------
drop policy if exists docs_select on storage.objects;
drop policy if exists docs_insert on storage.objects;
drop policy if exists docs_update on storage.objects;
drop policy if exists docs_delete on storage.objects;

drop function if exists public.custom_access_token_hook(jsonb);
drop function if exists public.claim_seat_session(uuid);
drop function if exists public.submit_intake(text, text, text, text, text);
drop function if exists public.write_audit();

drop table if exists public.audit_log cascade;
drop table if exists public.ledger_entries cascade;
drop table if exists public.submissions cascade;
drop table if exists public.scenario_results cascade;
drop table if exists public.scenarios cascade;
drop table if exists public.documents cascade;
drop table if exists public.borrowers cascade;
drop table if exists public.intake_links cascade;
drop table if exists public.seats cascade;
drop table if exists public.organizations cascade;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

-- A tenant. One row per lender organisation on the network.
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  display_name  text not null,
  logo_url      text,
  accent_color  text not null default '#4f7cff' check (accent_color ~* '^#[0-9a-f]{6}$'),
  premium       boolean not null default false,
  created_at    timestamptz not null default now()
);

-- A named seat inside one organisation. The seat is the unit of licensing and
-- the unit of session enforcement: one live session per seat, not per user.
--
-- login_email is how a seeded seat binds to a real auth user the first time
-- that person signs in. Inserting into auth.users from SQL is not a documented
-- interface, so the seed does not create accounts; it names them, and the hook
-- claims the seat on first sign in.
create table public.seats (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  label             text not null,
  role              text not null check (role in ('org_admin', 'manager', 'loan_officer')),
  login_email       text unique,
  user_id           uuid unique references auth.users(id) on delete set null,
  active_session_id uuid,
  is_demo_admin     boolean not null default false,
  created_at        timestamptz not null default now()
);

-- A public, per organisation intake link. The token decides the tenant, so an
-- unauthenticated caller can never choose which organisation it writes into.
create table public.intake_links (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  token      text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.borrowers (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  first_name      text not null,
  last_name       text not null,
  email           text,
  phone           text,
  source          text not null default 'manual' check (source in ('manual', 'csv', 'intake')),
  created_by_seat uuid references public.seats(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table public.documents (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  borrower_id      uuid not null references public.borrowers(id) on delete cascade,
  storage_path     text not null unique,
  filename         text not null,
  size_bytes       bigint not null check (size_bytes >= 0),
  uploaded_by_seat uuid references public.seats(id) on delete set null,
  created_at       timestamptz not null default now()
);

create table public.scenarios (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  borrower_id       uuid not null references public.borrowers(id) on delete cascade,
  property_address  text not null,
  purchase_price    numeric(14, 2) not null check (purchase_price > 0),
  loan_amount       numeric(14, 2) not null check (loan_amount > 0),
  ltv               numeric(5, 2) not null check (ltv > 0 and ltv <= 100),
  credit_band       text not null check (credit_band in ('740+', '700-739', '660-699', '620-659', 'below-620')),
  requested_by_seat uuid references public.seats(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- What the matching service returns. Ranges only, and an alias in place of the
-- lender's identity, so the portal never holds a real lender name.
create table public.scenario_results (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  scenario_id    uuid not null references public.scenarios(id) on delete cascade,
  lender_alias   text not null,
  rate_low       numeric(5, 3) not null check (rate_low > 0),
  rate_high      numeric(5, 3) not null check (rate_high >= rate_low),
  ltv_max        numeric(5, 2) not null check (ltv_max > 0 and ltv_max <= 100),
  term_months    integer not null check (term_months > 0),
  fee_range_low  numeric(12, 2) not null check (fee_range_low >= 0),
  fee_range_high numeric(12, 2) not null check (fee_range_high >= fee_range_low),
  created_at     timestamptz not null default now()
);

create table public.submissions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  scenario_id   uuid not null references public.scenarios(id) on delete cascade,
  status        text not null default 'draft'
                check (status in ('draft', 'submitted', 'in_review', 'approved', 'declined')),
  assigned_seat uuid references public.seats(id) on delete set null,
  submitted_at  timestamptz,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

create table public.ledger_entries (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  kind          text not null check (kind in ('origination_fee', 'referral_fee', 'adjustment')),
  amount_cents  bigint not null,
  period        text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  reconciled    boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Append only from the application's point of view: authenticated holds no
-- insert, update or delete grant on this table at all. Only the security
-- definer trigger writes to it.
create table public.audit_log (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  actor_seat uuid references public.seats(id) on delete set null,
  action     text not null,
  table_name text not null,
  record_id  uuid,
  details    jsonb not null default '{}'::jsonb,
  at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Indexes. Every column a policy filters on is indexed, because a policy is
--    evaluated against each candidate row.
-- ---------------------------------------------------------------------------
create index seats_org_id_idx              on public.seats (org_id);
create index intake_links_org_id_idx       on public.intake_links (org_id);
create index borrowers_org_id_idx          on public.borrowers (org_id);
create index documents_org_id_idx          on public.documents (org_id);
create index scenarios_org_id_idx          on public.scenarios (org_id);
create index scenario_results_org_id_idx   on public.scenario_results (org_id);
create index submissions_org_id_idx        on public.submissions (org_id);
create index ledger_entries_org_id_idx     on public.ledger_entries (org_id);
create index audit_log_org_id_idx          on public.audit_log (org_id, at desc);

-- Working indexes for the screens.
create index seats_user_id_idx             on public.seats (user_id);
create index borrowers_org_email_idx       on public.borrowers (org_id, lower(email));
create index borrowers_org_name_idx        on public.borrowers (org_id, last_name, first_name);
create index documents_borrower_idx        on public.documents (borrower_id);
create index scenarios_borrower_idx        on public.scenarios (borrower_id);
create index scenario_results_scenario_idx on public.scenario_results (scenario_id);
create index submissions_status_idx        on public.submissions (org_id, status, created_at desc);
create index submissions_assigned_idx      on public.submissions (assigned_seat);
create index ledger_period_idx             on public.ledger_entries (org_id, period, reconciled);

-- ---------------------------------------------------------------------------
-- 3. Grants.
--
-- New tables in the public schema are no longer exposed to the Data API
-- automatically. That is the default for new projects since 30 May 2026 and it
-- is enforced on every existing project from 30 October 2026, so the grants
-- below are written out rather than inherited.
-- (supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
--
-- anon receives nothing at all. The only unauthenticated write path in the
-- product is the public borrower intake form, and that goes through one
-- security definer function, not through table access.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;

-- Column level on purpose. An org_admin brands the organisation; it must not
-- be able to grant itself the premium tier or rename the slug its intake
-- links are built from.
grant select                         on public.organizations    to authenticated;
grant update (display_name, logo_url, accent_color)
                                     on public.organizations    to authenticated;

-- Column level on purpose, and this one is a privilege boundary rather than a
-- nicety. If authenticated could update every column of seats, an org_admin
-- could set is_demo_admin on its own seat and reach the cross tenant demo
-- switch, or point login_email at somebody else's account. Only the two
-- columns an administrator legitimately edits are writable, and the session
-- columns are moved by public.claim_seat_session and by the token hook.
grant select                         on public.seats            to authenticated;
grant update (label, role)           on public.seats            to authenticated;
grant select, insert, update, delete on public.intake_links     to authenticated;
grant select, insert, update, delete on public.borrowers        to authenticated;
grant select, insert, update, delete on public.documents        to authenticated;
grant select, insert, update, delete on public.scenarios        to authenticated;
grant select, insert                 on public.scenario_results to authenticated;
grant select, insert, update         on public.submissions      to authenticated;
grant select, insert, update, delete on public.ledger_entries   to authenticated;

-- Read only, and only through a policy. No write grant exists, so even a bug
-- in a server action cannot forge or erase an audit row.
grant select on public.audit_log to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Policies.
--
-- Shape notes, because the shape is the argument:
--   USING decides which existing rows are visible or touchable.
--   WITH CHECK validates the row after the write.
--   An insert policy takes WITH CHECK only and a delete policy takes USING
--   only; Postgres rejects the other combinations. Update is the one command
--   that carries both, and every update policy below states both, so a row
--   cannot be moved from one tenant into another.
--   The claim read is wrapped in a select so the optimizer runs it once per
--   statement instead of once per row.
--   Every policy names the role with "to authenticated".
-- ---------------------------------------------------------------------------

-- organizations: you see your own tenant, and only an org_admin can rebrand it.
create policy organizations_select on public.organizations
  for select to authenticated
  using (id = (select auth.jwt() ->> 'org_id')::uuid);

create policy organizations_update on public.organizations
  for update to authenticated
  using (id = (select auth.jwt() ->> 'org_id')::uuid
         and (select auth.jwt() ->> 'org_role') = 'org_admin')
  with check (id = (select auth.jwt() ->> 'org_id')::uuid
              and (select auth.jwt() ->> 'org_role') = 'org_admin');

-- seats: everyone in the tenant can see the seat roster, because assignment
-- needs it. Only an org_admin can change a seat, and the columns that carry
-- session state are changed by a function, not by a client update.
create policy seats_select on public.seats
  for select to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid);

create policy seats_update on public.seats
  for update to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid
         and (select auth.jwt() ->> 'org_role') = 'org_admin')
  with check (org_id = (select auth.jwt() ->> 'org_id')::uuid
              and (select auth.jwt() ->> 'org_role') = 'org_admin');

-- The hook runs as supabase_auth_admin and must be able to read and update
-- this table to resolve the seat and enforce the session.
grant all on table public.seats to supabase_auth_admin;
revoke all on table public.seats from anon, public;

create policy seats_auth_admin on public.seats
  as permissive for select
  to supabase_auth_admin
  using (true);

create policy seats_auth_admin_update on public.seats
  as permissive for update
  to supabase_auth_admin
  using (true)
  with check (true);

-- intake_links
create policy intake_links_select on public.intake_links
  for select to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid);

create policy intake_links_insert on public.intake_links
  for insert to authenticated
  with check (org_id = (select auth.jwt() ->> 'org_id')::uuid
              and (select auth.jwt() ->> 'org_role') in ('org_admin', 'manager'));

create policy intake_links_update on public.intake_links
  for update to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid
         and (select auth.jwt() ->> 'org_role') in ('org_admin', 'manager'))
  with check (org_id = (select auth.jwt() ->> 'org_id')::uuid
              and (select auth.jwt() ->> 'org_role') in ('org_admin', 'manager'));

create policy intake_links_delete on public.intake_links
  for delete to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid
         and (select auth.jwt() ->> 'org_role') = 'org_admin');

-- borrowers
create policy borrowers_select on public.borrowers
  for select to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid);

create policy borrowers_insert on public.borrowers
  for insert to authenticated
  with check (org_id = (select auth.jwt() ->> 'org_id')::uuid
              and (select auth.jwt() ->> 'org_role') in ('org_admin', 'manager', 'loan_officer'));

create policy borrowers_update on public.borrowers
  for update to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid)
  with check (org_id = (select auth.jwt() ->> 'org_id')::uuid);

create policy borrowers_delete on public.borrowers
  for delete to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid
         and (select auth.jwt() ->> 'org_role') in ('org_admin', 'manager'));

-- documents
create policy documents_select on public.documents
  for select to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid);

create policy documents_insert on public.documents
  for insert to authenticated
  with check (org_id = (select auth.jwt() ->> 'org_id')::uuid
              and (select auth.jwt() ->> 'org_role') in ('org_admin', 'manager', 'loan_officer'));

create policy documents_update on public.documents
  for update to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid)
  with check (org_id = (select auth.jwt() ->> 'org_id')::uuid);

create policy documents_delete on public.documents
  for delete to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid
         and (select auth.jwt() ->> 'org_role') in ('org_admin', 'manager'));

-- scenarios
create policy scenarios_select on public.scenarios
  for select to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid);

create policy scenarios_insert on public.scenarios
  for insert to authenticated
  with check (org_id = (select auth.jwt() ->> 'org_id')::uuid
              and (select auth.jwt() ->> 'org_role') in ('org_admin', 'manager', 'loan_officer'));

create policy scenarios_update on public.scenarios
  for update to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid)
  with check (org_id = (select auth.jwt() ->> 'org_id')::uuid);

create policy scenarios_delete on public.scenarios
  for delete to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid
         and (select auth.jwt() ->> 'org_role') in ('org_admin', 'manager'));

-- scenario_results: results are written once by the matching call and then
-- read. No update and no delete grant exists, so a result cannot be edited
-- after the fact, which is the point of a protected quote.
create policy scenario_results_select on public.scenario_results
  for select to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid);

create policy scenario_results_insert on public.scenario_results
  for insert to authenticated
  with check (org_id = (select auth.jwt() ->> 'org_id')::uuid);

-- submissions: any seat can raise one, only a manager or an org_admin can
-- change one, which is where assignment and the status machine live.
create policy submissions_select on public.submissions
  for select to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid);

create policy submissions_insert on public.submissions
  for insert to authenticated
  with check (org_id = (select auth.jwt() ->> 'org_id')::uuid
              and (select auth.jwt() ->> 'org_role') in ('org_admin', 'manager', 'loan_officer'));

create policy submissions_update on public.submissions
  for update to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid
         and (select auth.jwt() ->> 'org_role') in ('org_admin', 'manager'))
  with check (org_id = (select auth.jwt() ->> 'org_id')::uuid
              and (select auth.jwt() ->> 'org_role') in ('org_admin', 'manager'));

-- ledger_entries
create policy ledger_entries_select on public.ledger_entries
  for select to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid);

create policy ledger_entries_insert on public.ledger_entries
  for insert to authenticated
  with check (org_id = (select auth.jwt() ->> 'org_id')::uuid
              and (select auth.jwt() ->> 'org_role') in ('org_admin', 'manager'));

create policy ledger_entries_update on public.ledger_entries
  for update to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid
         and (select auth.jwt() ->> 'org_role') in ('org_admin', 'manager'))
  with check (org_id = (select auth.jwt() ->> 'org_id')::uuid
              and (select auth.jwt() ->> 'org_role') in ('org_admin', 'manager'));

create policy ledger_entries_delete on public.ledger_entries
  for delete to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid
         and (select auth.jwt() ->> 'org_role') = 'org_admin');

-- audit_log: read your own tenant's trail. There is no write policy because
-- there is no write grant.
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid);

-- ---------------------------------------------------------------------------
-- 5. The custom access token hook.
--
-- It runs on every token issuance and every refresh, which is what makes seat
-- enforcement work: a session that has lost its seat stops being refreshable.
--
-- Signature is fixed by the platform:
--   public.custom_access_token_hook(event jsonb) returns jsonb
-- The event carries user_id, claims and authentication_method. The returned
-- claims must still contain iss, aud, exp, iat, sub, role, aal, session_id,
-- email, phone and is_anonymous, so the hook adds to the claims object and
-- never replaces it.
-- Returning {"error": {"http_code": ..., "message": ...}} refuses the token.
-- (supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)
-- ---------------------------------------------------------------------------
-- Volatile, not stable: it writes to seats when it claims one, and Postgres
-- refuses a data modifying statement inside a non volatile function.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_user_id    uuid;
  v_session_id uuid;
  v_email      text;
  v_claims     jsonb;
  v_seat       public.seats;
begin
  v_claims     := event -> 'claims';
  v_user_id    := nullif(event ->> 'user_id', '')::uuid;
  v_session_id := nullif(v_claims ->> 'session_id', '')::uuid;
  v_email      := lower(coalesce(v_claims ->> 'email', ''));

  select * into v_seat from public.seats where user_id = v_user_id;

  -- First sign in for a seeded seat: bind the seat to this account by the
  -- email the seat was seeded with.
  if v_seat.id is null and v_email <> '' then
    update public.seats
       set user_id = v_user_id
     where lower(login_email) = v_email
       and user_id is null
    returning * into v_seat;
  end if;

  -- No seat, no portal. A signed in account without a seat gets no token, so
  -- it can never reach the Data API as an authenticated caller at all.
  if v_seat.id is null then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'No seat on this network is assigned to this account.'
      )
    );
  end if;

  -- Named seat session enforcement.
  --
  -- The seat holds the one session id allowed to use it, and the rule turns on
  -- why the token is being issued. The event says so: authentication_method is
  -- token_refresh when an existing session is extending itself, and names the
  -- sign in method otherwise.
  --
  --   A fresh sign in takes the seat. That is the whole point of a named seat:
  --   the person moves to another machine and carries on.
  --
  --   A refresh from a session that no longer holds the seat is refused, which
  --   is what ends the displaced session. It cannot be ended any sooner: an
  --   access token that has already been issued stays valid until it expires,
  --   which is why the project's token lifetime is set to 600 seconds. Ten
  --   minutes is the worst case, and it is stated rather than hidden.
  if v_session_id is not null
     and v_seat.active_session_id is not null
     and v_seat.active_session_id <> v_session_id then

    if coalesce(event ->> 'authentication_method', '') = 'token_refresh' then
      return jsonb_build_object(
        'error', jsonb_build_object(
          'http_code', 403,
          'message', 'This seat has been taken over on another device.'
        )
      );
    end if;

    update public.seats set active_session_id = v_session_id where id = v_seat.id;
    v_seat.active_session_id := v_session_id;
  end if;

  -- Claim an unoccupied seat for this session.
  if v_seat.active_session_id is null and v_session_id is not null then
    update public.seats set active_session_id = v_session_id where id = v_seat.id;
    v_seat.active_session_id := v_session_id;
  end if;

  v_claims := jsonb_set(v_claims, '{org_id}',        to_jsonb(v_seat.org_id::text));
  v_claims := jsonb_set(v_claims, '{org_role}',      to_jsonb(v_seat.role));
  v_claims := jsonb_set(v_claims, '{seat_id}',       to_jsonb(v_seat.id::text));
  v_claims := jsonb_set(v_claims, '{is_demo_admin}', to_jsonb(v_seat.is_demo_admin));

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;

grant execute
  on function public.custom_access_token_hook
  to supabase_auth_admin;

revoke execute
  on function public.custom_access_token_hook
  from authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- 6. Seat takeover and public intake: the two writes that cannot be expressed
--    as a plain table policy, each confined to one security definer function
--    with an empty search_path.
-- ---------------------------------------------------------------------------

-- Take the caller's own seat for the caller's current session. It can only
-- ever touch the row whose user_id is the caller, so it cannot be used to
-- disturb anyone else's seat, and it cannot change org_id or role.
create or replace function public.claim_seat_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.seats
     set active_session_id = p_session_id
   where user_id = auth.uid();
end;
$$;

revoke execute on function public.claim_seat_session(uuid) from public, anon;
grant execute on function public.claim_seat_session(uuid) to authenticated;

-- The public borrower intake. The token resolves the tenant, so the caller
-- never names an organisation and cannot write into one it was not given a
-- link for. An inactive or unknown token writes nothing.
create or replace function public.submit_intake(
  p_token      text,
  p_first_name text,
  p_last_name  text,
  p_email      text,
  p_phone      text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id      uuid;
  v_borrower_id uuid;
begin
  if coalesce(trim(p_first_name), '') = '' or coalesce(trim(p_last_name), '') = '' then
    raise exception 'A first name and a last name are required.';
  end if;

  select org_id into v_org_id
    from public.intake_links
   where token = p_token
     and active;

  if v_org_id is null then
    raise exception 'This intake link is not active.';
  end if;

  insert into public.borrowers (org_id, first_name, last_name, email, phone, source)
  values (v_org_id, trim(p_first_name), trim(p_last_name),
          nullif(trim(p_email), ''), nullif(trim(p_phone), ''), 'intake')
  returning id into v_borrower_id;

  insert into public.audit_log (org_id, actor_seat, action, table_name, record_id, details)
  values (v_org_id, null, 'borrower.intake', 'borrowers', v_borrower_id,
          jsonb_build_object('source', 'public_intake'));

  return v_borrower_id;
end;
$$;

revoke execute on function public.submit_intake(text, text, text, text, text) from public;
grant execute on function public.submit_intake(text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Storage.
--
-- One private bucket. The object path starts with the organisation id, and the
-- policies compare that first path segment to the caller's org_id claim, so an
-- object cannot be read, written or removed across a tenant boundary. Download
-- links are short lived signed URLs created on the server.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('borrower-docs', 'borrower-docs', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy docs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'borrower-docs'
         and (storage.foldername(name))[1] = (select auth.jwt() ->> 'org_id'));

create policy docs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'borrower-docs'
              and (storage.foldername(name))[1] = (select auth.jwt() ->> 'org_id'));

create policy docs_update on storage.objects
  for update to authenticated
  using (bucket_id = 'borrower-docs'
         and (storage.foldername(name))[1] = (select auth.jwt() ->> 'org_id'))
  with check (bucket_id = 'borrower-docs'
              and (storage.foldername(name))[1] = (select auth.jwt() ->> 'org_id'));

create policy docs_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'borrower-docs'
         and (storage.foldername(name))[1] = (select auth.jwt() ->> 'org_id')
         and (select auth.jwt() ->> 'org_role') in ('org_admin', 'manager'));

-- ---------------------------------------------------------------------------
-- 8. Audit trigger. The only writer of audit_log.
--
-- It is security definer because authenticated holds no insert grant on the
-- table. org_id is taken from the row, and the actor from the seat_id claim,
-- so a client cannot attribute an action to somebody else.
-- ---------------------------------------------------------------------------
create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old        jsonb;
  v_new        jsonb;
  v_row        jsonb;
  v_org_id     uuid;
  v_actor_seat uuid;
  v_details    jsonb := '{}'::jsonb;
begin
  v_actor_seat := nullif(auth.jwt() ->> 'seat_id', '')::uuid;

  -- One trigger function serves every audited table, so it must never name a
  -- column of a particular table. Naming old.status here would make the
  -- function unusable on a table without a status column. Converting the row
  -- to jsonb first keeps it generic.
  if tg_op <> 'INSERT' then
    v_old := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    v_new := to_jsonb(new);
  end if;

  v_row := coalesce(v_new, v_old);

  -- organizations is the tenant, so it is keyed by id and carries no org_id.
  -- Every other audited table carries org_id. Asking the row which one it has
  -- keeps this function generic.
  if v_row ? 'org_id' then
    v_org_id := (v_row ->> 'org_id')::uuid;
  else
    v_org_id := (v_row ->> 'id')::uuid;
  end if;

  if tg_op = 'UPDATE' and v_new ? 'status'
     and coalesce(v_old ->> 'status', '') <> coalesce(v_new ->> 'status', '') then
    v_details := jsonb_build_object('from', v_old ->> 'status', 'to', v_new ->> 'status');
  end if;

  insert into public.audit_log (org_id, actor_seat, action, table_name, record_id, details)
  values (v_org_id,
          v_actor_seat,
          tg_table_name || '.' || lower(tg_op),
          tg_table_name,
          (v_row ->> 'id')::uuid,
          v_details);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.write_audit() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Seed data.
--
-- Three lender organisations on the network, nine named seats, forty
-- borrowers, eighteen financing scenarios with protected results, twelve
-- submissions in every stage of the workflow, a fee ledger with a mix of
-- reconciled and unreconciled entries, and one public intake link per
-- organisation.
--
-- The triggers are attached after this section so that the audit trail starts
-- with real actions instead of the seed, and a short history is then written
-- explicitly.
-- ---------------------------------------------------------------------------

insert into public.organizations (slug, display_name, accent_color, premium) values
  ('harborline-mortgage',  'Harborline Mortgage Group',   '#4f7cff', true),
  ('bayou-city-lending',   'Bayou City Lending Co',       '#16a34a', false),
  ('red-oak-residential',  'Red Oak Residential Finance', '#d97706', true);

-- Nine named seats, three per organisation. login_email is the account each
-- seat binds to on first sign in; the accounts themselves are created in the
-- dashboard, because writing to auth.users from SQL is not a documented
-- interface and is not relied on here.
--
-- One seat carries is_demo_admin so a reviewer can prove the tenant boundary
-- from a single login. It is a demo affordance and it is removed for
-- production. Note that authenticated cannot write this column at all: the
-- update grant on seats covers label and role only.
insert into public.seats (org_id, label, role, login_email, is_demo_admin)
select o.id, v.label, v.role, v.login_email, v.is_demo_admin
from (values
  ('harborline-mortgage', 'Portal administrator', 'org_admin',    'harborline.admin@fieldstone.example',   true),
  ('harborline-mortgage', 'Production manager',   'manager',      'harborline.manager@fieldstone.example', false),
  ('harborline-mortgage', 'Loan officer, seat 1', 'loan_officer', 'harborline.lo@fieldstone.example',      false),
  ('bayou-city-lending',  'Portal administrator', 'org_admin',    'bayoucity.admin@fieldstone.example',    false),
  ('bayou-city-lending',  'Production manager',   'manager',      'bayoucity.manager@fieldstone.example',  false),
  ('bayou-city-lending',  'Loan officer, seat 1', 'loan_officer', 'bayoucity.lo@fieldstone.example',       false),
  ('red-oak-residential', 'Portal administrator', 'org_admin',    'redoak.admin@fieldstone.example',       false),
  ('red-oak-residential', 'Production manager',   'manager',      'redoak.manager@fieldstone.example',     false),
  ('red-oak-residential', 'Loan officer, seat 1', 'loan_officer', 'redoak.lo@fieldstone.example',          false)
) as v(slug, label, role, login_email, is_demo_admin)
join public.organizations o on o.slug = v.slug;

insert into public.intake_links (org_id, token) values
  ((select id from public.organizations where slug = 'harborline-mortgage'),  'hlm-intake-4f81c2a7'),
  ((select id from public.organizations where slug = 'bayou-city-lending'),   'bcl-intake-9d34e0b6'),
  ((select id from public.organizations where slug = 'red-oak-residential'),  'ror-intake-7a25f8d1');

-- Forty borrowers. The index decides the tenant, so the split is 15, 14, 11
-- and a reviewer can see at a glance that no row is shared.
insert into public.borrowers (org_id, first_name, last_name, email, phone, source, created_by_seat)
select o.id,
       v.first_name,
       v.last_name,
       lower(v.first_name || '.' || v.last_name || '@example.com'),
       '713-' || lpad((200 + v.n)::text, 3, '0') || '-' || lpad((1000 + v.n * 7)::text, 4, '0'),
       case when v.n % 5 = 0 then 'csv' when v.n % 7 = 0 then 'intake' else 'manual' end,
       (select s.id from public.seats s
         where s.org_id = o.id and s.role = 'loan_officer' limit 1)
from (values
  ( 1, 'Marisol',  'Vega'),      ( 2, 'Dwight',   'Okonkwo'),  ( 3, 'Priya',    'Raman'),
  ( 4, 'Caleb',    'Fontenot'),  ( 5, 'Yolanda',  'Briggs'),   ( 6, 'Hector',   'Salinas'),
  ( 7, 'Nadia',    'Farouk'),    ( 8, 'Trevor',   'Lindqvist'),( 9, 'Imani',    'Bell'),
  (10, 'Rafael',   'Montoya'),   (11, 'Deborah',  'Chastain'), (12, 'Minh',     'Tran'),
  (13, 'Aisha',    'Kamara'),    (14, 'Grant',    'Whitfield'),(15, 'Lupita',   'Cardenas'),
  (16, 'Omar',     'Haddad'),    (17, 'Bethany',  'Pruitt'),   (18, 'Darnell',  'Ruiz'),
  (19, 'Svetlana', 'Popov'),     (20, 'Kwame',    'Mensah'),   (21, 'Rosalind', 'Archer'),
  (22, 'Felipe',   'Guerrero'),  (23, 'Chandra',  'Patel'),    (24, 'Bryson',   'Kettle'),
  (25, 'Noelia',   'Duarte'),    (26, 'Marcus',   'Devereaux'),(27, 'Halima',   'Yusuf'),
  (28, 'Erik',     'Sandoval'),  (29, 'Tamara',   'Blanchard'),(30, 'Vikram',   'Sethi'),
  (31, 'Colette',  'Dubois'),    (32, 'Andre',    'Beaumont'), (33, 'Selena',   'Marquez'),
  (34, 'Jonah',    'Krieger'),   (35, 'Fatima',   'Zubair'),   (36, 'Preston',  'Ainsley'),
  (37, 'Adaeze',   'Nwosu'),     (38, 'Milo',     'Castaneda'),(39, 'Roberta',  'Finch'),
  (40, 'Emmanuel', 'Osei')
) as v(n, first_name, last_name)
join public.organizations o
  on o.slug = case
                when v.n <= 15 then 'harborline-mortgage'
                when v.n <= 29 then 'bayou-city-lending'
                else                'red-oak-residential'
              end;

-- Eighteen scenarios. The property address is unique, so the later inserts
-- join on it rather than on a fragile row number.
insert into public.scenarios (org_id, borrower_id, property_address, purchase_price, loan_amount, ltv, credit_band, requested_by_seat)
select b.org_id,
       b.id,
       v.address,
       v.purchase_price,
       round(v.purchase_price * v.ltv / 100, 2),
       v.ltv,
       v.credit_band,
       (select s.id from public.seats s
         where s.org_id = b.org_id and s.role = 'loan_officer' limit 1)
from (values
  ('Marisol',  'Vega',      '2118 Westheimer Rd, Houston, TX 77098',   415000.00, 80.00, '740+'),
  ('Dwight',   'Okonkwo',   '4407 Kirby Dr, Houston, TX 77098',        620000.00, 75.00, '700-739'),
  ('Priya',    'Raman',     '910 Heights Blvd, Houston, TX 77008',     289000.00, 90.00, '660-699'),
  ('Caleb',    'Fontenot',  '3316 Bissonnet St, Houston, TX 77005',    875000.00, 70.00, '740+'),
  ('Yolanda',  'Briggs',    '1204 Yale St, Houston, TX 77008',         352500.00, 85.00, '700-739'),
  ('Hector',   'Salinas',   '6015 Memorial Dr, Houston, TX 77007',    1250000.00, 65.00, '740+'),
  ('Nadia',    'Farouk',    '2450 Buffalo Speedway, Houston, TX 77019',498000.00, 80.00, '620-659'),
  ('Trevor',   'Lindqvist', '5122 Richmond Ave, Houston, TX 77056',    725000.00, 75.00, '700-739'),
  ('Imani',    'Bell',      '1811 Washington Ave, Houston, TX 77007',  268000.00, 95.00, '660-699'),
  ('Rafael',   'Montoya',   '720 Studewood St, Houston, TX 77007',     545000.00, 80.00, '740+'),
  ('Omar',     'Haddad',    '3901 Holcombe Blvd, Houston, TX 77021',   192500.00, 90.00, '620-659'),
  ('Bethany',  'Pruitt',    '1650 W Gray St, Houston, TX 77019',       960000.00, 70.00, '740+'),
  ('Kwame',    'Mensah',    '8330 Post Oak Blvd, Houston, TX 77027',  1450000.00, 60.00, '740+'),
  ('Chandra',  'Patel',     '2205 Shepherd Dr, Houston, TX 77019',     434000.00, 85.00, '700-739'),
  ('Noelia',   'Duarte',    '14320 Grant Rd, Cypress, TX 77429',       315000.00, 90.00, '660-699'),
  ('Colette',  'Dubois',    '2708 Alabama St, Houston, TX 77004',      228000.00, 95.00, 'below-620'),
  ('Fatima',   'Zubair',    '11507 Beechnut St, Houston, TX 77072',    275500.00, 85.00, '660-699'),
  ('Emmanuel', 'Osei',      '605 Sawyer St, Houston, TX 77007',        588000.00, 80.00, '700-739')
) as v(first_name, last_name, address, purchase_price, ltv, credit_band)
join public.borrowers b
  on b.first_name = v.first_name and b.last_name = v.last_name;

-- Protected results. Three lenders quote, identified only by an alias, and
-- only where their maximum LTV actually covers the request. A scenario above
-- every lender's limit therefore returns fewer rows, or none, which is the
-- honest outcome and the empty state the portal has to handle.
insert into public.scenario_results (org_id, scenario_id, lender_alias, rate_low, rate_high, ltv_max, term_months, fee_range_low, fee_range_high)
select sc.org_id,
       sc.id,
       a.alias,
       band.rate + a.rate_offset,
       band.rate + a.rate_offset + 0.500,
       a.ltv_max,
       a.term_months,
       round(sc.loan_amount * a.fee_low_pct / 100, 2),
       round(sc.loan_amount * a.fee_high_pct / 100, 2)
from public.scenarios sc
cross join (values
  ('Lender A', 0.000, 80.00, 360, 0.75, 1.10),
  ('Lender B', 0.125, 90.00, 360, 0.90, 1.35),
  ('Lender C', 0.250, 97.00, 240, 0.60, 0.95)
) as a(alias, rate_offset, ltv_max, term_months, fee_low_pct, fee_high_pct)
cross join lateral (
  select case sc.credit_band
           when '740+'    then 6.125
           when '700-739' then 6.375
           when '660-699' then 6.750
           when '620-659' then 7.250
           else                7.875
         end as rate
) band
where a.ltv_max >= sc.ltv;

-- Twelve submissions covering every state of the machine.
insert into public.submissions (org_id, scenario_id, status, assigned_seat, submitted_at, decided_at)
select sc.org_id,
       sc.id,
       v.status,
       (select s.id from public.seats s
         where s.org_id = sc.org_id and s.role = v.seat_role limit 1),
       case when v.submitted_days is null then null
            else now() - (v.submitted_days || ' days')::interval end,
       case when v.decided_days is null then null
            else now() - (v.decided_days || ' days')::interval end
-- Spread across all three tenants on purpose: six, four and two. A demo where
-- only the first organisation has data proves nothing when the reviewer
-- switches tenant.
from (values
  ('2118 Westheimer Rd, Houston, TX 77098',    'approved',  'manager',      22,        15),
  ('4407 Kirby Dr, Houston, TX 77098',         'in_review', 'manager',       9,        null::int),
  ('910 Heights Blvd, Houston, TX 77008',      'declined',  'loan_officer', 18,        11),
  ('3316 Bissonnet St, Houston, TX 77005',     'approved',  'manager',      27,        19),
  ('1204 Yale St, Houston, TX 77008',          'submitted', 'loan_officer',  4,        null::int),
  ('6015 Memorial Dr, Houston, TX 77007',      'approved',  'org_admin',    31,        24),
  ('3901 Holcombe Blvd, Houston, TX 77021',    'draft',     'loan_officer', null::int, null::int),
  ('1650 W Gray St, Houston, TX 77019',        'submitted', 'org_admin',     3,        null::int),
  ('8330 Post Oak Blvd, Houston, TX 77027',    'approved',  'manager',      20,        13),
  ('2205 Shepherd Dr, Houston, TX 77019',      'in_review', 'manager',       7,        null::int),
  ('11507 Beechnut St, Houston, TX 77072',     'approved',  'manager',      24,        16),
  ('605 Sawyer St, Houston, TX 77007',         'declined',  'loan_officer', 12,         8)
) as v(address, status, seat_role, submitted_days, decided_days)
join public.scenarios sc on sc.property_address = v.address;

-- The fee ledger. Origination and referral fees on the approved files, two
-- adjustments, and a deliberate mix of reconciled and unreconciled so the
-- reconciliation view has something to flag.
insert into public.ledger_entries (org_id, submission_id, kind, amount_cents, period, reconciled)
select sub.org_id,
       sub.id,
       v.kind,
       round(sc.loan_amount * v.pct / 100 * 100)::bigint,
       v.period,
       v.reconciled
from (values
  ('2118 Westheimer Rd, Houston, TX 77098',  'origination_fee', 1.000,  '2026-08', true),
  ('2118 Westheimer Rd, Houston, TX 77098',  'referral_fee',    0.250,  '2026-08', true),
  ('3316 Bissonnet St, Houston, TX 77005',   'origination_fee', 1.000,  '2026-08', true),
  ('3316 Bissonnet St, Houston, TX 77005',   'referral_fee',    0.250,  '2026-08', false),
  ('6015 Memorial Dr, Houston, TX 77007',    'origination_fee', 0.875,  '2026-08', true),
  ('6015 Memorial Dr, Houston, TX 77007',    'referral_fee',    0.250,  '2026-09', false),
  ('6015 Memorial Dr, Houston, TX 77007',    'adjustment',     -0.125,  '2026-09', false),
  ('910 Heights Blvd, Houston, TX 77008',    'adjustment',     -0.500,  '2026-09', false),
  ('8330 Post Oak Blvd, Houston, TX 77027',  'origination_fee', 1.000,  '2026-09', true),
  ('8330 Post Oak Blvd, Houston, TX 77027',  'referral_fee',    0.250,  '2026-09', false),
  ('1650 W Gray St, Houston, TX 77019',      'adjustment',     -0.250,  '2026-09', false),
  ('11507 Beechnut St, Houston, TX 77072',   'origination_fee', 1.000,  '2026-09', false),
  ('11507 Beechnut St, Houston, TX 77072',   'referral_fee',    0.250,  '2026-09', false),
  ('605 Sawyer St, Houston, TX 77007',       'adjustment',     -0.375,  '2026-09', false)
) as v(address, kind, pct, period, reconciled)
join public.scenarios sc on sc.property_address = v.address
join public.submissions sub on sub.scenario_id = sc.id;

-- ---------------------------------------------------------------------------
-- 10. Audit triggers, attached after the seed.
-- ---------------------------------------------------------------------------
create trigger audit_organizations  after insert or update or delete on public.organizations  for each row execute function public.write_audit();
create trigger audit_seats          after insert or update or delete on public.seats          for each row execute function public.write_audit();
create trigger audit_borrowers      after insert or update or delete on public.borrowers      for each row execute function public.write_audit();
create trigger audit_documents      after insert or update or delete on public.documents      for each row execute function public.write_audit();
create trigger audit_scenarios      after insert or update or delete on public.scenarios      for each row execute function public.write_audit();
create trigger audit_submissions    after insert or update or delete on public.submissions    for each row execute function public.write_audit();
create trigger audit_ledger_entries after insert or update or delete on public.ledger_entries for each row execute function public.write_audit();

-- A short, plausible history so the audit screen is not empty on first load.
insert into public.audit_log (org_id, actor_seat, action, table_name, record_id, details, at)
select sub.org_id,
       (select s.id from public.seats s where s.org_id = sub.org_id and s.role = v.seat_role limit 1),
       v.action,
       'submissions',
       sub.id,
       v.details::jsonb,
       now() - (v.days_ago || ' days')::interval
from (values
  ('2118 Westheimer Rd, Houston, TX 77098', 'manager',      'submissions.update', '{"from": "in_review", "to": "approved"}', 15),
  ('3316 Bissonnet St, Houston, TX 77005',  'manager',      'submissions.update', '{"from": "in_review", "to": "approved"}', 19),
  ('910 Heights Blvd, Houston, TX 77008',   'loan_officer', 'submissions.update', '{"from": "in_review", "to": "declined"}', 11),
  ('6015 Memorial Dr, Houston, TX 77007',   'org_admin',    'submissions.update', '{"from": "in_review", "to": "approved"}', 24),
  ('8330 Post Oak Blvd, Houston, TX 77027', 'manager',      'submissions.update', '{"from": "in_review", "to": "approved"}', 13),
  ('11507 Beechnut St, Houston, TX 77072',  'manager',      'submissions.update', '{"from": "in_review", "to": "approved"}', 16),
  ('605 Sawyer St, Houston, TX 77007',      'loan_officer', 'submissions.update', '{"from": "in_review", "to": "declined"}',  8)
) as v(address, seat_role, action, details, days_ago)
join public.scenarios sc on sc.property_address = v.address
join public.submissions sub on sub.scenario_id = sc.id;

-- ---------------------------------------------------------------------------
-- 11. Row level security, last.
--
-- Enabled and forced together. ENABLE turns the policies on, and with RLS
-- enabled and no matching policy the default is deny: "If no policy exists for
-- the table, a default-deny policy is used, meaning that no rows are visible
-- or can be modified" (postgresql.org/docs/current/ddl-rowsecurity.html).
-- FORCE removes the table owner's own exemption, because "Table owners
-- normally bypass row security as well, though a table owner can choose to be
-- subject to row security" (same page). It is last in the file so the seed
-- above runs while the owner is still exempt.
--
-- What FORCE does not do: a role holding the BYPASSRLS attribute still
-- bypasses policies. The project's secret key maps to such a role, which is
-- exactly why it is used only by seeding and never in request handling. Every
-- request in the portal runs as the signed in user, under these policies.
-- ---------------------------------------------------------------------------
alter table public.organizations    enable row level security;
alter table public.organizations    force  row level security;
alter table public.seats            enable row level security;
alter table public.seats            force  row level security;
alter table public.intake_links     enable row level security;
alter table public.intake_links     force  row level security;
alter table public.borrowers        enable row level security;
alter table public.borrowers        force  row level security;
alter table public.documents        enable row level security;
alter table public.documents        force  row level security;
alter table public.scenarios        enable row level security;
alter table public.scenarios        force  row level security;
alter table public.scenario_results enable row level security;
alter table public.scenario_results force  row level security;
alter table public.submissions      enable row level security;
alter table public.submissions      force  row level security;
alter table public.ledger_entries   enable row level security;
alter table public.ledger_entries   force  row level security;
alter table public.audit_log        enable row level security;
alter table public.audit_log        force  row level security;

-- ---------------------------------------------------------------------------
-- 12. What the seed produced, for the operator running this file.
-- ---------------------------------------------------------------------------
select o.display_name,
       o.premium,
       (select count(*) from public.seats            x where x.org_id = o.id) as seats,
       (select count(*) from public.borrowers        x where x.org_id = o.id) as borrowers,
       (select count(*) from public.scenarios        x where x.org_id = o.id) as scenarios,
       (select count(*) from public.scenario_results x where x.org_id = o.id) as results,
       (select count(*) from public.submissions      x where x.org_id = o.id) as submissions,
       (select count(*) from public.ledger_entries   x where x.org_id = o.id) as ledger_entries,
       (select count(*) from public.audit_log        x where x.org_id = o.id) as audit_rows
from public.organizations o
order by o.display_name;

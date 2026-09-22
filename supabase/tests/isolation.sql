-- Tenant isolation tests for the Fieldstone Lending Network portal.
--
-- Run this in the Supabase SQL editor after supabase/schema.sql. It runs
-- inside one transaction and rolls back, so it changes nothing.
--
-- It returns one row per test. Every row must read "pass". A row reading
-- "skipped" names what is missing and what to do about it. A failure raises
-- and aborts with the reason, because a test that reports a soft failure gets
-- ignored.
--
-- How the tests impersonate a seat: they set request.jwt.claims for the
-- transaction and switch to the authenticated role, which is exactly what
-- PostgREST does per request. No test runs as the table owner, and no test
-- uses a service credential, so what passes here is what the policies
-- actually enforce.
--
-- Two behaviours to keep in mind when reading the assertions:
--
--   A write blocked by WITH CHECK raises SQLSTATE 42501. Every negative write
--   test asserts that specific code, not merely "an error", so a test cannot
--   pass because of a typo or a missing column.
--
--   A write blocked by USING does not raise at all: the row is simply not a
--   candidate, so the statement reports zero rows affected. The role tests
--   below therefore assert zero rows affected AND that the row survived.

begin;

create temporary table test_results (
  n       integer generated always as identity,
  name    text not null,
  outcome text not null,
  detail  text
) on commit drop;

-- Several tests record their result from inside an exception handler, while
-- the session is still impersonating a seat. The scratch table therefore has
-- to be writable by the impersonated roles. It is a temporary table in a
-- transaction that always rolls back, so this grants nothing that outlives the
-- test run.
-- pg_temp is a search path alias, not a grantable name, so the real schema
-- name has to be looked up.
do $$
declare
  temp_schema text;
begin
  select nspname into temp_schema from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to authenticated, anon', temp_schema);
  execute format('grant select, insert on %I.test_results to authenticated, anon', temp_schema);
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Every seat sees its own tenant in full, and nothing of any other tenant.
-- ---------------------------------------------------------------------------
do $$
declare
  v_seats    jsonb;
  v_seat     jsonb;
  v_expected jsonb;
  v_want     jsonb;
  v_slug     text;
  v_org      uuid;
  n          bigint;
  foreign_n  bigint;
begin
  -- Materialise the seat list before any role switch, because once the
  -- session is the authenticated role this query would itself be filtered.
  select jsonb_agg(jsonb_build_object(
           'seat_id', s.id, 'org_id', s.org_id, 'org_role', s.role,
           'slug', o.slug, 'label', s.label))
    into v_seats
    from public.seats s
    join public.organizations o on o.id = s.org_id;

  v_expected := jsonb_build_object(
    'harborline-mortgage',  jsonb_build_object('borrowers', 15, 'scenarios', 10, 'results', 26, 'submissions', 6, 'ledger', 8,  'audit', 4),
    'bayou-city-lending',   jsonb_build_object('borrowers', 14, 'scenarios',  5, 'results', 12, 'submissions', 4, 'ledger', 3,  'audit', 1),
    'red-oak-residential',  jsonb_build_object('borrowers', 11, 'scenarios',  3, 'results',  6, 'submissions', 2, 'ledger', 3,  'audit', 2)
  );

  for v_seat in select e from jsonb_array_elements(v_seats) as e
  loop
    v_slug := v_seat ->> 'slug';
    v_org  := (v_seat ->> 'org_id')::uuid;
    v_want := v_expected -> v_slug;

    perform set_config('request.jwt.claims', jsonb_build_object(
      'sub',           gen_random_uuid()::text,
      'role',          'authenticated',
      'session_id',    gen_random_uuid()::text,
      'org_id',        v_org::text,
      'org_role',      v_seat ->> 'org_role',
      'seat_id',       v_seat ->> 'seat_id',
      'is_demo_admin', false
    )::text, true);
    execute 'set local role authenticated';

    -- Own tenant, in full.
    select count(*) into n from public.borrowers;
    if n <> (v_want ->> 'borrowers')::bigint then
      raise exception '% (%): expected % borrowers, saw %', v_slug, v_seat ->> 'label', v_want ->> 'borrowers', n;
    end if;

    select count(*) into n from public.scenarios;
    if n <> (v_want ->> 'scenarios')::bigint then
      raise exception '% : expected % scenarios, saw %', v_slug, v_want ->> 'scenarios', n;
    end if;

    select count(*) into n from public.scenario_results;
    if n <> (v_want ->> 'results')::bigint then
      raise exception '% : expected % scenario results, saw %', v_slug, v_want ->> 'results', n;
    end if;

    select count(*) into n from public.submissions;
    if n <> (v_want ->> 'submissions')::bigint then
      raise exception '% : expected % submissions, saw %', v_slug, v_want ->> 'submissions', n;
    end if;

    select count(*) into n from public.ledger_entries;
    if n <> (v_want ->> 'ledger')::bigint then
      raise exception '% : expected % ledger entries, saw %', v_slug, v_want ->> 'ledger', n;
    end if;

    -- The audit trail only grows: the token hook writes a row every time a
    -- seat is claimed by a new session. So this one is a floor, not an equality.
    select count(*) into n from public.audit_log;
    if n < (v_want ->> 'audit')::bigint then
      raise exception '% : expected at least % audit rows, saw %', v_slug, v_want ->> 'audit', n;
    end if;

    -- One organisation, one roster, one intake link.
    select count(*) into n from public.organizations;
    if n <> 1 then raise exception '% : expected to see 1 organisation, saw %', v_slug, n; end if;

    select count(*) into n from public.seats;
    if n <> 3 then raise exception '% : expected 3 seats, saw %', v_slug, n; end if;

    select count(*) into n from public.intake_links;
    if n <> 1 then raise exception '% : expected 1 intake link, saw %', v_slug, n; end if;

    -- And now the targeted version of the same question: ask for another
    -- tenant's rows by org_id directly. Every one of these must be empty.
    select
      (select count(*) from public.borrowers        where org_id <> v_org)
    + (select count(*) from public.documents        where org_id <> v_org)
    + (select count(*) from public.scenarios        where org_id <> v_org)
    + (select count(*) from public.scenario_results where org_id <> v_org)
    + (select count(*) from public.submissions      where org_id <> v_org)
    + (select count(*) from public.ledger_entries   where org_id <> v_org)
    + (select count(*) from public.audit_log        where org_id <> v_org)
    + (select count(*) from public.intake_links     where org_id <> v_org)
    + (select count(*) from public.seats            where org_id <> v_org)
    + (select count(*) from public.organizations    where id     <> v_org)
      into foreign_n;

    if foreign_n <> 0 then
      raise exception '% (%): % rows of another tenant were visible', v_slug, v_seat ->> 'label', foreign_n;
    end if;

    execute 'reset role';
  end loop;

  insert into test_results (name, outcome, detail) values
    ('every seat sees its own tenant in full', 'pass', '9 seats checked across 3 organisations'),
    ('cross tenant read returns zero rows',    'pass', '10 tables queried by foreign org_id, per seat');
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Writes across the tenant boundary, as a loan officer in the first
--    organisation.
-- ---------------------------------------------------------------------------
do $$
declare
  v_org_a      uuid;
  v_org_b      uuid;
  v_seat_lo_a  uuid;
  v_borrower_a uuid;
  v_borrower_b uuid;
  v_state      text;
  affected     bigint;
  n            bigint;
begin
  select id into v_org_a from public.organizations where slug = 'harborline-mortgage';
  select id into v_org_b from public.organizations where slug = 'bayou-city-lending';
  select id into v_seat_lo_a from public.seats where org_id = v_org_a and role = 'loan_officer';
  select id into v_borrower_a from public.borrowers where org_id = v_org_a order by last_name limit 1;
  select id into v_borrower_b from public.borrowers where org_id = v_org_b order by last_name limit 1;

  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', gen_random_uuid()::text, 'role', 'authenticated',
    'session_id', gen_random_uuid()::text,
    'org_id', v_org_a::text, 'org_role', 'loan_officer',
    'seat_id', v_seat_lo_a::text, 'is_demo_admin', false
  )::text, true);
  execute 'set local role authenticated';

  -- 2a. Insert a borrower stamped with the other tenant's org_id.
  begin
    insert into public.borrowers (org_id, first_name, last_name, source)
    values (v_org_b, 'Injected', 'Row', 'manual');
    raise exception 'cross tenant insert was allowed';
  exception
    when insufficient_privilege then
      insert into test_results (name, outcome, detail) values
        ('cross tenant insert is rejected', 'pass', 'WITH CHECK raised SQLSTATE 42501');
  end;

  -- 2b. Move one of our own rows into the other tenant.
  begin
    update public.borrowers set org_id = v_org_b where id = v_borrower_a;
    raise exception 'moving a row to another tenant was allowed';
  exception
    when insufficient_privilege then
      insert into test_results (name, outcome, detail) values
        ('changing org_id on a row is rejected', 'pass', 'WITH CHECK raised SQLSTATE 42501');
  end;

  -- 2c. Update another tenant's row. Blocked by USING, so it is not an error:
  --     it simply matches nothing.
  update public.borrowers set last_name = 'Tampered' where id = v_borrower_b;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'updated % rows of another tenant', affected;
  end if;
  insert into test_results (name, outcome, detail) values
    ('update of a foreign row affects no rows', 'pass', 'USING matched nothing, 0 rows affected');

  -- 2d. A loan officer has no delete policy on borrowers. Also USING, so also
  --     silent: zero rows affected and the row is still there afterwards.
  delete from public.borrowers where id = v_borrower_a;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'loan_officer deleted % borrower rows', affected;
  end if;
  execute 'reset role';
  select count(*) into n from public.borrowers where id = v_borrower_a;
  if n <> 1 then
    raise exception 'the borrower row did not survive the loan_officer delete';
  end if;
  insert into test_results (name, outcome, detail) values
    ('loan_officer delete is refused', 'pass', '0 rows affected and the row survives');

  -- 2e. The audit trail is not writable by the application at all. There is
  --     no insert grant, so this fails on privileges before any policy runs.
  execute 'set local role authenticated';
  begin
    insert into public.audit_log (org_id, action, table_name)
    values (v_org_a, 'forged.entry', 'borrowers');
    raise exception 'audit_log accepted an insert from authenticated';
  exception
    when insufficient_privilege then
      insert into test_results (name, outcome, detail) values
        ('audit_log rejects application writes', 'pass', 'no insert grant, SQLSTATE 42501');
  end;

  -- 2f. The token hook is not callable by a signed in user. If it were, a
  --     user could mint their own claims.
  begin
    perform public.custom_access_token_hook('{}'::jsonb);
    raise exception 'authenticated was able to execute the token hook';
  exception
    when insufficient_privilege then
      insert into test_results (name, outcome, detail) values
        ('token hook is not executable by users', 'pass', 'execute revoked, SQLSTATE 42501');
  end;

  execute 'reset role';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2b. The scenario surface: the tenant boundary on scenarios and on the
--     protected results, and the rule that a scenario cannot borrow more than
--     the property costs.
-- ---------------------------------------------------------------------------
do $$
declare
  v_org_a       uuid;
  v_org_b       uuid;
  v_seat_lo_a   uuid;
  v_borrower_b  uuid;
  v_scenario_a  uuid;
  v_borrower_a  uuid;
  affected      bigint;
begin
  select id into v_org_a from public.organizations where slug = 'harborline-mortgage';
  select id into v_org_b from public.organizations where slug = 'bayou-city-lending';
  select id into v_seat_lo_a from public.seats where org_id = v_org_a and role = 'loan_officer';
  select id into v_borrower_a from public.borrowers where org_id = v_org_a order by last_name limit 1;
  select id into v_borrower_b from public.borrowers where org_id = v_org_b order by last_name limit 1;
  select id into v_scenario_a from public.scenarios where org_id = v_org_a limit 1;

  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', gen_random_uuid()::text, 'role', 'authenticated',
    'session_id', gen_random_uuid()::text,
    'org_id', v_org_a::text, 'org_role', 'loan_officer',
    'seat_id', v_seat_lo_a::text, 'is_demo_admin', false
  )::text, true);
  execute 'set local role authenticated';

  -- A scenario stamped with the other tenant's org_id.
  begin
    insert into public.scenarios (org_id, borrower_id, property_address, purchase_price,
                                  down_payment, loan_purpose, loan_amount, ltv, credit_band)
    values (v_org_b, v_borrower_b, '1 Nowhere St, Houston, TX 77002',
            400000, 80000, 'purchase', 320000, 80, '740+');
    raise exception 'a scenario was written into another tenant';
  exception
    when insufficient_privilege then
      insert into test_results (name, outcome, detail) values
        ('cross tenant scenario insert is rejected', 'pass', 'WITH CHECK raised SQLSTATE 42501');
  end;

  -- A protected result stamped with the other tenant's org_id.
  begin
    insert into public.scenario_results (org_id, scenario_id, lender_alias, rate_low, rate_high,
                                         ltv_max, term_months, fee_range_low, fee_range_high)
    values (v_org_b, v_scenario_a, 'Lender Z', 5.000, 5.500, 80, 360, 1000, 2000);
    raise exception 'a scenario result was written into another tenant';
  exception
    when insufficient_privilege then
      insert into test_results (name, outcome, detail) values
        ('cross tenant scenario result insert is rejected', 'pass', 'WITH CHECK raised SQLSTATE 42501');
  end;

  -- A quote is evidence. Nobody holds update or delete on it, so it cannot be
  -- rewritten after the borrower has seen it.
  begin
    update public.scenario_results set rate_low = 0.001 where org_id = v_org_a;
    raise exception 'a scenario result was edited after the fact';
  exception
    when insufficient_privilege then
      insert into test_results (name, outcome, detail) values
        ('scenario results cannot be edited after the fact', 'pass', 'no update grant, SQLSTATE 42501');
  end;

  -- The deposit and the loan have to add up to the price.
  begin
    insert into public.scenarios (org_id, borrower_id, property_address, purchase_price,
                                  down_payment, loan_purpose, loan_amount, ltv, credit_band)
    values (v_org_a, v_borrower_a, '2 Nowhere St, Houston, TX 77002',
            400000, 80000, 'purchase', 400000, 100, '740+');
    raise exception 'a scenario borrowed more than the property costs';
  exception
    when check_violation then
      insert into test_results (name, outcome, detail) values
        ('a scenario cannot borrow more than the property costs', 'pass',
         'the loan and the deposit must equal the price, SQLSTATE 23514');
  end;

  execute 'reset role';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Storage objects obey the same boundary.
-- ---------------------------------------------------------------------------
do $$
declare
  v_org_a     uuid;
  v_org_b     uuid;
  v_seat_lo_a uuid;
begin
  select id into v_org_a from public.organizations where slug = 'harborline-mortgage';
  select id into v_org_b from public.organizations where slug = 'bayou-city-lending';
  select id into v_seat_lo_a from public.seats where org_id = v_org_a and role = 'loan_officer';

  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', gen_random_uuid()::text, 'role', 'authenticated',
    'session_id', gen_random_uuid()::text,
    'org_id', v_org_a::text, 'org_role', 'loan_officer',
    'seat_id', v_seat_lo_a::text, 'is_demo_admin', false
  )::text, true);
  execute 'set local role authenticated';

  -- Our own folder is writable.
  begin
    insert into storage.objects (bucket_id, name)
    values ('borrower-docs', v_org_a::text || '/probe/own.pdf');
    insert into test_results (name, outcome, detail) values
      ('storage write inside own tenant folder', 'pass', 'object path starting with our org_id accepted');
  exception
    when insufficient_privilege then
      raise exception 'storage refused a write to our own tenant folder';
  end;

  -- The other tenant's folder is not.
  begin
    insert into storage.objects (bucket_id, name)
    values ('borrower-docs', v_org_b::text || '/probe/stolen.pdf');
    raise exception 'storage accepted a write into another tenant folder';
  exception
    when insufficient_privilege then
      insert into test_results (name, outcome, detail) values
        ('storage write into a foreign folder is rejected', 'pass', 'storage.objects WITH CHECK raised SQLSTATE 42501');
  end;

  -- And it cannot be read either.
  execute 'reset role';
  insert into storage.objects (bucket_id, name)
  values ('borrower-docs', v_org_b::text || '/probe/planted.pdf');
  execute 'set local role authenticated';
  if exists (select 1 from storage.objects where name like v_org_b::text || '%') then
    raise exception 'an object in another tenant folder was visible';
  end if;
  insert into test_results (name, outcome, detail) values
    ('storage read of a foreign folder returns nothing', 'pass', 'object planted outside the policy is invisible');

  execute 'reset role';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Role boundaries inside one tenant, including the two that would let an
--    administrator escalate out of the tenant altogether.
-- ---------------------------------------------------------------------------
do $$
declare
  v_org_a        uuid;
  v_seat_admin_a uuid;
  affected       bigint;
begin
  select id into v_org_a from public.organizations where slug = 'harborline-mortgage';
  select id into v_seat_admin_a from public.seats where org_id = v_org_a and role = 'org_admin';

  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', gen_random_uuid()::text, 'role', 'authenticated',
    'session_id', gen_random_uuid()::text,
    'org_id', v_org_a::text, 'org_role', 'org_admin',
    'seat_id', v_seat_admin_a::text, 'is_demo_admin', false
  )::text, true);
  execute 'set local role authenticated';

  -- An org_admin may rebrand its own organisation.
  update public.organizations set display_name = 'Harborline Mortgage Group (renamed)' where id = v_org_a;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'an org_admin could not rename its own organisation';
  end if;
  insert into test_results (name, outcome, detail) values
    ('org_admin can rebrand its own tenant', 'pass', '1 row affected');

  -- It may not grant itself the premium tier: premium is not in the column
  -- level update grant.
  begin
    update public.organizations set premium = true where id = v_org_a;
    raise exception 'an org_admin was able to set the premium flag';
  exception
    when insufficient_privilege then
      insert into test_results (name, outcome, detail) values
        ('org_admin cannot grant itself the premium tier', 'pass', 'premium is outside the column grant, SQLSTATE 42501');
  end;

  -- And it may not make itself the demo administrator, which is the account
  -- that can look across tenants.
  begin
    update public.seats set is_demo_admin = true where id = v_seat_admin_a;
    raise exception 'an org_admin was able to set is_demo_admin';
  exception
    when insufficient_privilege then
      insert into test_results (name, outcome, detail) values
        ('org_admin cannot make itself demo admin', 'pass', 'is_demo_admin is outside the column grant, SQLSTATE 42501');
  end;

  execute 'reset role';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The public intake path. An unauthenticated caller has no table access at
--    all, and the one function it can call decides the tenant from the token.
-- ---------------------------------------------------------------------------
do $$
declare
  v_org_a      uuid;
  v_org_b      uuid;
  v_token_a    text;
  v_borrower   uuid;
  v_landed_org uuid;
  n            bigint;
begin
  select id into v_org_a from public.organizations where slug = 'harborline-mortgage';
  select id into v_org_b from public.organizations where slug = 'bayou-city-lending';
  select token into v_token_a from public.intake_links where org_id = v_org_a;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';

  -- No table reads for anon.
  begin
    perform 1 from public.borrowers limit 1;
    raise exception 'anon was able to read borrowers';
  exception
    when insufficient_privilege then
      insert into test_results (name, outcome, detail) values
        ('anon has no table access', 'pass', 'select on borrowers raised SQLSTATE 42501');
  end;

  -- The intake function works, and the token alone decides the tenant.
  v_borrower := public.submit_intake(v_token_a, 'Walk', 'In', 'walk.in@example.com', '713-555-0134');
  execute 'reset role';

  select org_id into v_landed_org from public.borrowers where id = v_borrower;
  if v_landed_org <> v_org_a then
    raise exception 'the intake row landed in the wrong tenant';
  end if;
  insert into test_results (name, outcome, detail) values
    ('public intake writes only into the token tenant', 'pass', 'the function takes no organisation argument');

  -- The branding function gives an anonymous visitor the three fields the
  -- intake page needs and nothing else, and only for a live link.
  execute 'set local role anon';
  select count(*) into n from public.intake_branding(v_token_a);
  if n <> 1 then
    raise exception 'the intake branding lookup returned % rows for a live token', n;
  end if;
  select count(*) into n from public.intake_branding('not-a-real-token');
  if n <> 0 then
    raise exception 'the intake branding lookup answered for an unknown token';
  end if;
  insert into test_results (name, outcome, detail) values
    ('intake branding is readable only for a live token', 'pass',
     'one row for the real token, none for an unknown one, and no table grant either way');
  execute 'reset role';

  -- An unknown or inactive token writes nothing.
  execute 'set local role anon';
  begin
    perform public.submit_intake('not-a-real-token', 'Should', 'Fail', null, null);
    raise exception 'an unknown intake token was accepted';
  exception
    when raise_exception then
      insert into test_results (name, outcome, detail) values
        ('unknown intake token is refused', 'pass', 'the function raises and writes nothing');
  end;
  execute 'reset role';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. The access token hook: the claims it writes, the claim it must not
--    touch, and one live session per named seat.
--
-- This one needs at least one real account in auth.users, because a seat is
-- bound to an account. If none exists yet the test records itself as skipped
-- and says what to do, rather than quietly reporting a pass.
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid       uuid;
  v_org_a     uuid;
  v_seat       uuid;
  v_session_1 uuid := gen_random_uuid();
  v_session_2 uuid := gen_random_uuid();
  v_first     jsonb;
  v_second    jsonb;
  v_third     jsonb;
  v_fourth    jsonb;
  v_holder    uuid;
begin
  select id into v_uid from auth.users order by created_at limit 1;

  if v_uid is null then
    insert into test_results (name, outcome, detail) values
      ('token hook stamps the tenant claims', 'skipped',
       'auth.users is empty. Create the nine seat accounts, then re-run this file.'),
      ('token hook leaves the role claim alone', 'skipped',
       'same reason.'),
      ('one live session per named seat', 'skipped',
       'same reason.'),
      ('a fresh sign in takes the seat over', 'skipped',
       'same reason.');
    return;
  end if;

  select id into v_org_a from public.organizations where slug = 'harborline-mortgage';
  select id into v_seat from public.seats where org_id = v_org_a and role = 'loan_officer';

  -- Bind the seat to a real account for the duration of this transaction.
  update public.seats set user_id = v_uid, active_session_id = null where id = v_seat;

  v_first := public.custom_access_token_hook(jsonb_build_object(
    'user_id', v_uid::text,
    'authentication_method', 'password',
    'claims', jsonb_build_object(
      'iss', 'test', 'aud', 'authenticated', 'exp', 0, 'iat', 0,
      'sub', v_uid::text, 'role', 'authenticated', 'aal', 'aal1',
      'session_id', v_session_1::text, 'email', 'seat@example.com',
      'phone', '', 'is_anonymous', false)
  ));

  if v_first -> 'error' is not null then
    raise exception 'the hook refused the first token: %', v_first -> 'error';
  end if;
  if (v_first -> 'claims' ->> 'org_id')::uuid <> v_org_a then
    raise exception 'the hook stamped the wrong org_id: %', v_first -> 'claims' ->> 'org_id';
  end if;
  if v_first -> 'claims' ->> 'org_role' <> 'loan_officer' then
    raise exception 'the hook stamped the wrong org_role: %', v_first -> 'claims' ->> 'org_role';
  end if;
  if (v_first -> 'claims' ->> 'seat_id')::uuid <> v_seat then
    raise exception 'the hook stamped the wrong seat_id';
  end if;
  insert into test_results (name, outcome, detail) values
    ('token hook stamps the tenant claims', 'pass', 'org_id, org_role and seat_id all present and correct');

  -- The standard role claim decides which Postgres role runs the request. If
  -- the hook overwrote it with a portal role, every request would break.
  if v_first -> 'claims' ->> 'role' <> 'authenticated' then
    raise exception 'the hook overwrote the role claim with %', v_first -> 'claims' ->> 'role';
  end if;
  if v_first -> 'claims' ->> 'session_id' <> v_session_1::text then
    raise exception 'the hook disturbed the session_id claim';
  end if;
  insert into test_results (name, outcome, detail) values
    ('token hook leaves the role claim alone', 'pass', 'role is still authenticated and session_id is untouched');

  -- A second device on the same seat. The seat now holds session one, so a
  -- token for session two must be refused.
  v_second := public.custom_access_token_hook(jsonb_build_object(
    'user_id', v_uid::text,
    'authentication_method', 'token_refresh',
    'claims', jsonb_build_object(
      'iss', 'test', 'aud', 'authenticated', 'exp', 0, 'iat', 0,
      'sub', v_uid::text, 'role', 'authenticated', 'aal', 'aal1',
      'session_id', v_session_2::text, 'email', 'seat@example.com',
      'phone', '', 'is_anonymous', false)
  ));

  if v_second -> 'error' ->> 'http_code' <> '403' then
    raise exception 'a refresh was issued for a seat the session no longer holds: %', v_second;
  end if;
  insert into test_results (name, outcome, detail) values
    ('one live session per named seat', 'pass', 'the displaced refresh was refused with http_code 403');

  -- A fresh sign in on a second device is a takeover, not a lockout. The seat
  -- moves to the new session, and it is then the original session that can no
  -- longer refresh. Without this the product would lock people out of their
  -- own seat whenever they changed machine.
  v_third := public.custom_access_token_hook(jsonb_build_object(
    'user_id', v_uid::text,
    'authentication_method', 'password',
    'claims', jsonb_build_object(
      'iss', 'test', 'aud', 'authenticated', 'exp', 0, 'iat', 0,
      'sub', v_uid::text, 'role', 'authenticated', 'aal', 'aal1',
      'session_id', v_session_2::text, 'email', 'seat@example.com',
      'phone', '', 'is_anonymous', false)
  ));

  if v_third -> 'error' is not null then
    raise exception 'a fresh sign in was refused instead of taking the seat: %', v_third -> 'error';
  end if;

  select active_session_id into v_holder from public.seats where id = v_seat;
  if v_holder <> v_session_2 then
    raise exception 'the seat did not move to the new session';
  end if;

  -- And now the original session is the one that cannot refresh.
  v_fourth := public.custom_access_token_hook(jsonb_build_object(
    'user_id', v_uid::text,
    'authentication_method', 'token_refresh',
    'claims', jsonb_build_object(
      'iss', 'test', 'aud', 'authenticated', 'exp', 0, 'iat', 0,
      'sub', v_uid::text, 'role', 'authenticated', 'aal', 'aal1',
      'session_id', v_session_1::text, 'email', 'seat@example.com',
      'phone', '', 'is_anonymous', false)
  ));

  if v_fourth -> 'error' ->> 'http_code' <> '403' then
    raise exception 'the displaced original session could still refresh: %', v_fourth;
  end if;

  insert into test_results (name, outcome, detail) values
    ('a fresh sign in takes the seat over', 'pass', 'the seat moved, and the original session can no longer refresh');
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Structural checks. These are the rules the schema claims to follow, read
--    back out of the catalogue rather than taken on trust.
-- ---------------------------------------------------------------------------
do $$
declare
  bad text;
  n   bigint;
begin
  -- Every tenant table has row level security enabled and forced.
  select string_agg(c.relname, ', ') into bad
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public'
     and c.relkind = 'r'
     and c.relname in ('organizations','seats','intake_links','borrowers','documents',
                       'scenarios','scenario_results','submissions','ledger_entries','audit_log')
     and (c.relrowsecurity is false or c.relforcerowsecurity is false);
  if bad is not null then
    raise exception 'row level security is not enabled and forced on: %', bad;
  end if;
  insert into test_results (name, outcome, detail) values
    ('RLS enabled and forced on every tenant table', 'pass', '10 tables checked in pg_class');

  -- Every policy names a role. A policy with no role applies to public.
  select string_agg(policyname, ', ') into bad
    from pg_policies
   where schemaname = 'public' and (roles is null or roles = '{public}');
  if bad is not null then
    raise exception 'these policies do not name a role: %', bad;
  end if;
  insert into test_results (name, outcome, detail) values
    ('every policy names its role', 'pass', 'no policy applies to public');

  -- No policy reads user_metadata, which end users can edit.
  select string_agg(policyname, ', ') into bad
    from pg_policies
   where schemaname in ('public', 'storage')
     and (coalesce(qual, '') || coalesce(with_check, '')) like '%user_metadata%';
  if bad is not null then
    raise exception 'these policies read user_metadata: %', bad;
  end if;
  insert into test_results (name, outcome, detail) values
    ('no policy reads user_metadata', 'pass', 'checked public and storage policies');

  -- Every org_id column a policy filters on is indexed.
  select string_agg(t.tablename, ', ') into bad
    from (values ('organizations'),('seats'),('intake_links'),('borrowers'),('documents'),
                 ('scenarios'),('scenario_results'),('submissions'),('ledger_entries'),('audit_log')) as t(tablename)
   where t.tablename <> 'organizations'
     and not exists (
       select 1 from pg_indexes i
        where i.schemaname = 'public'
          and i.tablename = t.tablename
          and i.indexdef like '%(org_id%'
     );
  if bad is not null then
    raise exception 'org_id is not the leading index column on: %', bad;
  end if;
  insert into test_results (name, outcome, detail) values
    ('org_id is indexed on every tenant table', 'pass', 'organizations is keyed by id, the rest by org_id');

  -- anon holds no privilege on any table in the public schema.
  select string_agg(distinct table_name, ', ') into bad
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon';
  if bad is not null then
    raise exception 'anon has table privileges on: %', bad;
  end if;
  insert into test_results (name, outcome, detail) values
    ('anon has no table privileges', 'pass', 'the public intake runs through one function instead');

  -- authenticated cannot write the audit trail.
  select count(*) into n
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'audit_log'
     and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE');
  if n <> 0 then
    raise exception 'authenticated holds % write grants on audit_log', n;
  end if;
  insert into test_results (name, outcome, detail) values
    ('audit_log has no write grant for users', 'pass', 'select only, written by the trigger');
end;
$$;

-- ---------------------------------------------------------------------------
-- Results.
-- ---------------------------------------------------------------------------
select n, name, outcome, detail from test_results order by n;

select outcome, count(*) as tests
from test_results
group by outcome
order by outcome;

rollback;

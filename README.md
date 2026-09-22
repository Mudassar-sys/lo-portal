# Fieldstone Lending Network: loan officer portal

A working multi-tenant portal for loan officers. Lender organisations are
tenants. Tenant isolation is enforced in the database and in storage, not in
the user interface.

This repository is a prototype built to be inspected. The schema, the policies
and the tests that prove the tenant boundary are meant to be read first.

## Status

Day 1. Schema, tenant policies, the access token hook, seed data and auth are
in. Screens land on Day 2. This README is filled in as each part does.

## Demo access

Nine seats across three lender organisations, three seats each. The addresses
are listed on the sign in page and in `supabase/SETUP.md`, and they use the
reserved `.example` top level domain so they cannot reach a real mailbox.

All nine share one password. It is set by `npm run seed:users` from
`DEMO_PASSWORD` in `.env.local`, it is never printed by any script and never
committed, and it is the owner's to choose and the owner's to hand out.

## What it proves

To be written once the isolation tests pass. See VERIFICATION.md for the
evidence table.

## How to run

To be written.

## Threat model

To be written.

## The isolation policies, explained

To be written.

## Mapping to SQL Server row level security and EF Core

To be written.

## Research log

Every version, flag and API shape this build relies on is recorded in
RESEARCH.md with the official source and the date it was read.

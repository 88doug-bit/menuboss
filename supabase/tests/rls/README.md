# RLS Verification Matrix (CI-blocking)

`matrix.test.sql` is the pgTAP implementation of the RLS matrix mandated by
Product PRD v0.2 §11 (decision D10). Run with the Supabase CLI:

```sh
supabase start          # local stack (applies migrations + seed)
supabase test db        # runs pgTAP files under supabase/tests/
```

## Coverage

- Scenarios 1–10 of the §11 matrix: private-plan isolation, read-only shares,
  sharing mutations, creation bootstrap + orphan fail-closed, profile
  privilege escalation, attribution integrity, vocabulary protection,
  hard-delete denial, audit isolation, anon denial — plus the D8 date-range
  triggers and the coverage-manifest assertion (RLS enabled on every table).
- **Scenario 11 (Realtime parity / unshare cutoff) is NOT covered here** —
  pgTAP cannot exercise the Realtime path. It belongs to the integration
  suite (two Supabase JS clients over websockets). Tracked as a Wave 2 task;
  Phase 1 is not complete without it.

## Process rule (from Product PRD v0.2 §11)

Any migration that touches a policy, a policy-referenced function
(`current_household_id`, `is_family_member`, `is_family_admin`,
`can_view_meal_plan`, `can_edit_meal_plan`, `plan_creating_household`),
a security trigger, or adds a table MUST extend this matrix in the same PR.
The coverage-manifest assertion fails the suite if any public table has RLS
disabled; per-table policy coverage is reviewed against the §11 grid.

## Fixtures

Personas and fixed UUIDs come from `supabase/seed.sql` (see the reference
card at the bottom of that file). The test creates its own plans/recipes
inside a rolled-back transaction — it never dirties the database.

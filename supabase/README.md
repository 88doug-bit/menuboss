# Supabase — local config note

The Supabase CLI was **not installed** on the scaffold machine, so `supabase init`
was not run and no `config.toml` was generated. The directory layout below was
created manually to match `PHASE1_PLAN.md` "Repo conventions":

```
supabase/
  migrations/
    0001_schema.sql      # tables, constraints, indexes (Grok)  — present
    0002_security.sql    # RLS enable-all, policies, triggers (Claude) — TODO
    0003_functions.sql   # generate_shopping_list, weekly_protein_rollup — present
  seed.sql               # units, portion categories, taxonomy, test households/personas
  tests/
    rls/                 # pgTAP RLS matrix (Claude) — placeholder
    functions/           # SQL aggregation function tests — present
```

## To enable local Supabase

1. Install the CLI: https://supabase.com/docs/guides/cli (e.g. `scoop install supabase`,
   `npm i -g supabase`, or the Windows installer).
2. From the repo root run `supabase init` to generate `config.toml`, then
   `supabase start` to boot the local stack.
3. Migrations in `migrations/` apply in filename order (`0001` -> `0002` -> `0003`).
   `0002_security.sql` must exist before the stack is considered secure.
4. Run pgTAP RLS tests once the harness in `tests/rls/` lands.

No service-role key is ever used in request paths (Product PRD §10.5); the app
connects with the anon key + caller JWT and relies on RLS.

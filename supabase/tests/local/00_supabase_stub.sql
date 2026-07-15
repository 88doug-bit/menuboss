-- LOCAL-ONLY Supabase environment stub (no Docker available).
-- Recreates the minimum surface our migrations/tests need from the Supabase
-- platform: the auth schema + auth.uid(), and the anon/authenticated roles.
-- CI uses the real Supabase stack; this file is never applied there.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

-- Mirrors Supabase: uid = jwt claims 'sub', NULL outside a request context.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    ''
  )::uuid;
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

-- Minimal auth.users so 0005's provisioning triggers install and are testable
-- locally (the real table has many more columns; provisioning touches only
-- id + email).
CREATE TABLE IF NOT EXISTS auth.users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

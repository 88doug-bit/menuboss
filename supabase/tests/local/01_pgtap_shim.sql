-- LOCAL-ONLY pgTAP-compatible shim (no Docker → no `supabase test db`).
-- Implements exactly the assertion surface our test files use:
--   plan, ok, is, lives_ok, throws_ok(sql,errcode,errmsg,desc), results_eq, finish.
-- CI runs the real pgTAP; this shim exists so the identical, unmodified
-- test files can run against the portable local Postgres.
--
-- SECURITY NOTE: lives_ok/throws_ok are SECURITY INVOKER on purpose — the
-- tested SQL must execute as the CURRENT persona (SET ROLE + jwt claims),
-- otherwise every RLS assertion would pass vacuously as superuser.

CREATE OR REPLACE FUNCTION plan(n integer)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _tap_state (
    planned integer NOT NULL,
    ran     integer NOT NULL DEFAULT 0,
    failed  integer NOT NULL DEFAULT 0
  ) ON COMMIT DROP;
  DELETE FROM _tap_state;
  INSERT INTO _tap_state (planned) VALUES (n);
  -- Personas write assertion results too; temp table is session-wide.
  GRANT SELECT, INSERT, UPDATE ON _tap_state TO PUBLIC;
  RETURN format('1..%s', n);
END $$;

CREATE OR REPLACE FUNCTION _tap_record(p_pass boolean, p_desc text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  UPDATE _tap_state SET ran = ran + 1, failed = failed + CASE WHEN p_pass THEN 0 ELSE 1 END;
  IF NOT p_pass THEN
    RAISE WARNING 'TAP-FAIL: %', p_desc;
  END IF;
  RETURN (CASE WHEN p_pass THEN 'ok' ELSE 'NOT OK' END) || ' - ' || p_desc;
END $$;

CREATE OR REPLACE FUNCTION ok(p boolean, d text)
RETURNS text LANGUAGE sql AS $$ SELECT _tap_record(COALESCE(p, false), d); $$;

CREATE OR REPLACE FUNCTION is(a anyelement, b anyelement, d text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF a IS NOT DISTINCT FROM b THEN
    RETURN _tap_record(true, d);
  END IF;
  RETURN _tap_record(false, format('%s [got: %s, want: %s]', d, a::text, b::text));
END $$;

CREATE OR REPLACE FUNCTION lives_ok(p_sql text, d text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN _tap_record(true, d);
EXCEPTION WHEN OTHERS THEN
  RETURN _tap_record(false, format('%s [died: %s %s]', d, SQLSTATE, SQLERRM));
END $$;

CREATE OR REPLACE FUNCTION throws_ok(p_sql text, p_errcode text, p_errmsg text, d text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN _tap_record(false, format('%s [no error thrown]', d));
EXCEPTION WHEN OTHERS THEN
  IF p_errcode IS NULL OR SQLSTATE = p_errcode THEN
    RETURN _tap_record(true, d);
  END IF;
  RETURN _tap_record(false, format('%s [got SQLSTATE %s, want %s: %s]', d, SQLSTATE, p_errcode, SQLERRM));
END $$;

-- Typed, order-sensitive comparison (matches real pgTAP semantics: numeric
-- 15.00 equals 15). Position is pinned via row_number, values compared with
-- native equality through EXCEPT ALL in both directions.
CREATE OR REPLACE FUNCTION results_eq(p_query text, p_expected text, d text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  extra_got  integer;
  extra_want integer;
BEGIN
  EXECUTE format(
    'SELECT count(*) FROM (
       (SELECT row_number() OVER () rn, t.* FROM (%s) t)
       EXCEPT ALL
       (SELECT row_number() OVER () rn, t.* FROM (%s) t)
     ) x', p_query, p_expected) INTO extra_got;
  EXECUTE format(
    'SELECT count(*) FROM (
       (SELECT row_number() OVER () rn, t.* FROM (%s) t)
       EXCEPT ALL
       (SELECT row_number() OVER () rn, t.* FROM (%s) t)
     ) x', p_expected, p_query) INTO extra_want;
  IF extra_got = 0 AND extra_want = 0 THEN
    RETURN _tap_record(true, d);
  END IF;
  RETURN _tap_record(false,
    format('%s [%s row(s) only in got, %s row(s) only in want]', d, extra_got, extra_want));
END $$;

CREATE OR REPLACE FUNCTION finish()
RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE
  v_planned integer;
  v_ran     integer;
  v_failed  integer;
BEGIN
  EXECUTE 'SELECT planned, ran, failed FROM _tap_state'
    INTO v_planned, v_ran, v_failed;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'TAP: % of % assertions FAILED', v_failed, v_ran;
  END IF;
  IF v_ran IS DISTINCT FROM v_planned THEN
    RAISE EXCEPTION 'TAP: planned % assertions but ran %', v_planned, v_ran;
  END IF;
  RETURN NEXT format('TAP: all %s assertions passed', v_ran);
END $$;

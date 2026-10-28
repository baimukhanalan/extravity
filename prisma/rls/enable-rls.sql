-- Row-Level Security: defense-in-depth second layer.
--
-- IMPORTANT — read prisma/rls/README.md first. This does NOT go in the Prisma
-- migration chain on purpose:
--   * Postgres RLS is bypassed by the table owner and by roles with BYPASSRLS.
--     Neon's default role owns the tables, so enabling RLS while the app still
--     connects as that role would enforce nothing — security theater. RLS only
--     becomes real once the app connects as a dedicated, non-owner role.
--   * Applying it silently could also break the app if the session variable
--     `app.user_id` is not set on every connection.
--
-- So this is a deliberate ops step: create the restricted role, point the app's
-- DATABASE_URL at it, ensure the app sets `app.user_id` per request (see the
-- Prisma extension in the README), then run this file once.
--
-- What it protects: the clearly user-owned tables, each scoped to
-- `current_setting('app.user_id')`. Cross-party tables (parent/counsellor
-- links) keep their server-side ownership checks, which the security audit
-- confirms are the enforced layer regardless of RLS.

BEGIN;

-- 1. A restricted role the app connects as. It is NOT the table owner and does
--    NOT have BYPASSRLS, so policies actually apply to it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'CHANGE_ME_IN_RUNBOOK';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- 2. Helper: the current request's user id, as a uuid, or NULL when unset.
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

-- 3. Enable + FORCE RLS and add an owner policy on each user-owned table.
--    FORCE makes the policy apply even to the table owner in dev, so mistakes
--    surface early. "User" is quoted — it is a reserved word.
DO $$
DECLARE
  t text;
  -- table name : column that holds the owning user's id
  pairs text[][] := ARRAY[
    ARRAY['User', 'id'],
    ARRAY['StudentProfile', 'userId'],
    ARRAY['SavedOpportunity', 'userId'],
    ARRAY['Application', 'userId'],
    ARRAY['Document', 'userId'],
    ARRAY['Achievement', 'userId'],
    ARRAY['Notification', 'userId'],
    ARRAY['UserSubmission', 'userId'],
    ARRAY['Subscription', 'userId'],
    ARRAY['NotificationPreference', 'userId'],
    ARRAY['AiGeneration', 'userId'],
    ARRAY['Payment', 'userId']
  ];
  row text[];
BEGIN
  FOREACH row SLICE 1 IN ARRAY pairs LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', row[1]);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', row[1]);
    EXECUTE format('DROP POLICY IF EXISTS owner_isolation ON %I', row[1]);
    EXECUTE format(
      'CREATE POLICY owner_isolation ON %I USING (%I = app_current_user_id()) WITH CHECK (%I = app_current_user_id())',
      row[1], row[2], row[2]
    );
  END LOOP;
END
$$;

COMMIT;

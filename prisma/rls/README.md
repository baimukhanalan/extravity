# Row-Level Security (RLS) — prepared second layer

RLS is provided as a **ready-to-activate** defense-in-depth layer, not enabled
by default. This document explains why, and how to turn it on correctly.

## Why it's not in the migration chain

Postgres RLS is **bypassed by the table owner** and by any role with
`BYPASSRLS`. On Neon the default connection role owns the tables, so enabling
RLS while the app still connects as that role would enforce **nothing** — it
would only create a false sense of security. Worse, applying it without setting
the `app.user_id` session variable on every request would break every query.

So RLS is a deliberate ops step, not an automatic migration. The **enforced**
authorization layer today is the server-side ownership checks in the Server
Actions and route handlers (`where: { userId: user.id }`, `organizerId !==`,
active-link checks). The security audit confirms these are consistent. RLS adds
a database-level backstop on top of them.

## What it protects

The clearly user-owned tables, each scoped to the request's user id:
`User`, `StudentProfile`, `SavedOpportunity`, `Application`, `Document`,
`Achievement`, `Notification`, `UserSubmission`, `Subscription`,
`NotificationPreference`, `AiGeneration`, `Payment`.

Cross-party tables (parent/counsellor links, opportunities, moderation) keep
their server-side checks — their access rules are relational, not a single
owner column, and are not a good fit for a one-column RLS policy.

## Activation runbook

1. **Pick a strong password** for the restricted role and edit
   `enable-rls.sql` (replace `CHANGE_ME_IN_RUNBOOK`), or create the role
   yourself and delete the `CREATE ROLE` block.

2. **Apply the policies** (as the owner/admin connection, direct unpooled URL):

   ```bash
   psql "<neon-owner-unpooled-url>" -f prisma/rls/enable-rls.sql
   ```

3. **Point the app at the restricted role.** Change `DATABASE_URL` (and the
   unpooled URL used for migrations stays on the owner). The app now connects as
   `app_user`, which RLS applies to.

4. **Set the session variable per request.** Route user-scoped reads/writes
   through `withUser()` from `lib/prisma-rls.ts`, which runs them in a
   transaction that first does `SET LOCAL app.user_id` — required under Neon's
   transaction pooling, where a plain `SET` would not persist across statements.

   Migrations and seeding keep using the owner connection and the plain client.

5. **Verify.** As `app_user`, a query without the variable set must return zero
   user-owned rows; with it set to a user id, only that user's rows appear:

   ```sql
   SET app.user_id = '';           -- unset
   SELECT count(*) FROM "Application";   -- expect 0
   SET app.user_id = '<some-user-uuid>';
   SELECT count(*) FROM "Application";   -- expect only that user's rows
   ```

## Rollback

```sql
-- Per table: ALTER TABLE "<T>" DISABLE ROW LEVEL SECURITY;
-- Then repoint DATABASE_URL back to the owner role.
```

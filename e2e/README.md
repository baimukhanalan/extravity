# End-to-end tests (Playwright)

These specs run against a **real production build** talking to a **real Postgres**, so
they exercise Server Actions, the database, redirects and the CSP — not just rendering.
Playwright itself builds the app, seeds demo data, and starts the server (see
`playwright.config.ts` → `webServer`).

## What's covered (23 tests / 13 files)

- **registration** — signup → onboarding → start an application (the core new-user spine).
- **levers** — save a named search from the feed; record an outcome review on an opportunity.
- **moderation** — student submits a link → moderator approves it (two roles / two contexts).
- **payment** — paid checkout remains unavailable without a live acquirer in a production build.
- **application-history** — removed opportunities stay in the student's history.
- **catalog-search** — multiword queries find a title even when the words are separated by another word.
- **ingest-expiration** — expired parser records remain traceable but never enter the catalog queue.
- **ingest-triage** — a Telegram recap is flagged while an open competition remains in the review queue.
- **internal-delivery** — a consented application reaches the verified organizer's inbox once, even under concurrent delivery attempts; revocation and safety stops block delivery.
- **access-control** — logged-out users are redirected to `/login`; a student can't reach `/admin`;
  unauthenticated `/api/account/export` returns 401, while an authenticated student exports only their own data without cache.
- **account-deletion** — a student with a queued submission can delete the account; pending work is removed and access is revoked.

## Run it in CI

Already wired: `.github/workflows/ci.yml` → job **`e2e`** spins up a throwaway Postgres,
runs `prisma migrate deploy`, installs Chromium, and runs `npm run e2e` on every push/PR to `main`.
Nothing to do — a red e2e blocks the merge.

## Run it locally

Prereqs: Docker (for Postgres) and the Playwright browser.

```bash
# 1) Start local Postgres and create a dedicated e2e database.
docker compose up -d postgres
docker compose exec postgres createdb -U postgres extravity_e2e

# 2) Install the Playwright browser (once)
npx playwright install chromium

# 3) Migrate the local test database, then run the suite.
export E2E_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/extravity_e2e?schema=public"
DATABASE_URL="$E2E_DATABASE_URL" npx prisma migrate deploy
npm run e2e
```

- Interactive/debug mode: replace the last line with `npm run e2e:ui`.
- On failure, a Playwright **trace** is retained (`trace: retain-on-failure`) — open it with
  `npx playwright show-trace <path-from-the-report>`.
- The seed creates demo accounts (password `password123`): `student@demo.kz`, `admin@demo.kz`,
  `organizer@demo.kz`, `counselor@demo.kz`, `parent@demo.kz`.

## Notes / gotchas

- The E2E runner rejects remote hosts and database names without `e2e` or `test`
  before it can seed anything. It adds a media-backed catalog fixture only to this database.
- The runner pins its database and test-only parser, worker, and auth secrets for both Playwright and the local app. The app listens on HTTP localhost, while the receipt URL uses a test-only HTTPS public origin.
- Playwright refuses to reuse a server already listening on the test port, so the suite cannot silently hit a different app or database.
- Tests use per-run unique data where it matters (submission URL, saved-search name) so repeated
  local runs against a persistent DB don't collide.
- Known e2e coverage gaps to add next: organizer publish → moderation,
  parent consent, counselor invite, login-failure/rate-limit, public-portfolio privacy.

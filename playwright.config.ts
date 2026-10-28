import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests exercise the three flows that would hurt most if they broke:
 * registration → onboarding, a paid subscription (mock provider), and the
 * moderator approving a user submission.
 *
 * They run against a real production build talking to the local Postgres, so
 * they cover Server Actions, the database, and redirects — not just rendering.
 * The dev server is started by Playwright with SEED_DEMO on so the demo admin
 * and student accounts exist.
 */
const PORT = Number(process.env.E2E_PORT ?? 3130);
const BASE_URL = `http://localhost:${PORT}`;
const E2E_PUBLIC_APP_URL = "https://extravity.example";
const e2eDatabaseUrl = process.env.E2E_DATABASE_URL;
const e2eParserSecret = "local-e2e-parser-secret-0123456789abcdef";
const e2eAuthSecret = "local-e2e-auth-secret-0123456789abcdef";
if (!e2eDatabaseUrl) {
  throw new Error("E2E_DATABASE_URL is required. Use a dedicated local test database; the suite writes demo data.");
}
const e2eDatabase = new URL(e2eDatabaseUrl);
const e2eDatabaseName = decodeURIComponent(e2eDatabase.pathname.replace(/^\//, ""));
if (!["localhost", "127.0.0.1", "::1"].includes(e2eDatabase.hostname)
  || !/(?:^|[_-])(e2e|test)(?:$|[_-])/i.test(e2eDatabaseName)) {
  throw new Error("E2E_DATABASE_URL must point to a dedicated local database with e2e or test in its name.");
}
process.env.DATABASE_URL = e2eDatabaseUrl;
process.env.PARSER_INGEST_SECRET = e2eParserSecret;
process.env.AUTH_SECRET = e2eAuthSecret;
process.env.NEXT_PUBLIC_APP_URL = E2E_PUBLIC_APP_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // shared DB — keep flows from racing each other
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    // Keep a trace whenever a test fails, so CI/local failures are debuggable.
    trace: "retain-on-failure",
    locale: "ru-RU",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // Build once, then serve — closer to production than `next dev`.
    command: `npm run build && SEED_DEMO=true npm run db:seed && npx tsx scripts/seed-e2e-catalog.ts && PORT=${PORT} npm run start`,
    url: `${BASE_URL}/api/health`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      SEED_DEMO: "true",
      PORT: String(PORT),
      DATABASE_URL: e2eDatabaseUrl,
      PARSER_INGEST_SECRET: e2eParserSecret,
      AUTH_SECRET: e2eAuthSecret,
      NEXT_PUBLIC_APP_URL: E2E_PUBLIC_APP_URL,
    },
  },
});

import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Server-side authorization is the most security-relevant behavior in the app,
 * yet the happy-path specs never exercise it. These tests assert the guard rails:
 * logged-out users are bounced to /login from every portal, a student cannot
 * reach staff-only admin pages, and the personal-data export refuses anonymous
 * callers. No DB mutation, no seeded-data assumptions beyond the demo student.
 */

const PROTECTED_ROUTES = [
  "/app",
  "/app/settings",
  "/app/applications",
  "/app/documents",
  "/admin",
  "/admin/moderation",
  "/admin/users",
  "/organizer",
  "/counselor",
  "/parent",
];

test.describe("access control", () => {
  test("logged-out users are redirected to /login from every protected route", async ({ page }) => {
    for (const path of PROTECTED_ROUTES) {
      await page.goto(path);
      await expect(page, `expected ${path} to redirect an anonymous user to /login`).toHaveURL(/\/login/, {
        timeout: 15_000,
      });
    }
  });

  test("a signed-in student cannot reach the staff-only admin portal", async ({ page }) => {
    await login(page, "student@demo.kz");
    await page.goto("/admin/moderation");
    // requireAdmin() sends a non-staff account back to /app.
    await expect(page).not.toHaveURL(/\/admin/, { timeout: 15_000 });
  });

  test("unauthenticated personal-data export is rejected with 401", async ({ request }) => {
    const res = await request.get("/api/account/export");
    expect(res.status()).toBe(401);
  });

  test("signed-in student exports only their own account data without cache", async ({ page }) => {
    await login(page, "student@demo.kz");
    const response = await page.request.get("/api/account/export");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["content-disposition"]).toMatch(/^attachment; filename="extracurriculars-kz-/);
    const data = await response.json();
    expect(data.account.email).toBe("student@demo.kz");
    expect(data.account.role).toBe("STUDENT");
    expect(data.profile?.userId).toBe(data.account.id);
    for (const key of ["applications", "saved", "savedSearches", "documents", "achievements", "reviews", "notifications", "consents"]) {
      expect(Array.isArray(data[key])).toBe(true);
      for (const item of data[key]) {
        expect(item.studentUserId ?? item.userId).toBe(data.account.id);
      }
    }
  });
});

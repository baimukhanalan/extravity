import { type Page, expect } from "@playwright/test";

/** Logs in through the real form and waits for the post-login redirect. */
export async function login(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  // Login redirects away from /login on success.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

/** A fresh, unique email so repeated runs don't collide on the unique index. */
export function uniqueEmail(prefix = "e2e"): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}+${Date.now()}${rand}@example.kz`;
}

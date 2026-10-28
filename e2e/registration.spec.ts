import { test, expect } from "@playwright/test";
import { uniqueEmail } from "./helpers";

/**
 * A brand-new visitor signs up, gets routed through onboarding, lands in the
 * portal, opens the catalog and starts an application. This is the spine of the
 * product — if it breaks, nobody can use the site.
 */
test("registration → onboarding → start an application", async ({ page }) => {
  const email = uniqueEmail("signup");

  // --- Sign up ---
  await page.goto("/signup");
  await page.locator("#firstName").fill("Асель");
  await page.locator("#lastName").fill("Тестова");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("password123");
  await page.getByRole("button", { name: "Создать профиль" }).click();

  // Signup redirects to onboarding.
  await expect(page).toHaveURL(/\/app\/onboarding/, { timeout: 20_000 });

  // --- Complete onboarding via the skip shortcut ---
  await page.getByRole("button", { name: /Пропустить и заполнить позже/ }).click();
  await expect(page).toHaveURL(/\/app(\/)?$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /Привет/ })).toBeVisible();

  // --- Open the catalog and pick the first opportunity ---
  await page.goto("/catalog");
  const firstCard = page.locator('a[href^="/opportunities/"]').first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();
  await expect(page).toHaveURL(/\/opportunities\//);

  // --- Start an application ---
  const startBtn = page.getByRole("button", { name: /Начать подготовку|Начать заявку|подготовку/ });
  await expect(startBtn.first()).toBeVisible();
  await startBtn.first().click();

  // Lands in the application workspace.
  await expect(page).toHaveURL(/\/app\/applications\//, { timeout: 20_000 });
});

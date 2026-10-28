import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Covers the new retention + trust features end to end against the real build:
 * saving a search from the feed, and recording an outcome review on an
 * opportunity (which powers social proof and success ranking).
 */

test("student saves a search from the feed", async ({ page }) => {
  await login(page, "student@demo.kz");

  // Apply a filter so the "save search" button appears.
  await page.goto("/app/discover?free=1");

  // A per-run unique name so repeated local runs don't accumulate/collide.
  const searchName = `Бесплатные ${Date.now()}`;

  // Click the trigger to reveal the inline name input (this UI replaced the old
  // window.prompt()).
  await page.getByRole("button", { name: /Сохранить поиск/ }).click();

  const nameInput = page.getByPlaceholder("Название сохранённого поиска:");
  await expect(nameInput).toBeVisible();
  await nameInput.fill(searchName);

  // The form's submit button carries the same label; it's the only one visible now.
  await page.getByRole("button", { name: /Сохранить поиск/ }).click();

  // Wait for the server action to finish (button flips to "Сохранено") before
  // navigating, otherwise leaving the page can abort the pending action.
  await expect(page.getByText("Сохранено").first()).toBeVisible({ timeout: 10_000 });

  // It appears on the saved page.
  await page.goto("/app/saved");
  await expect(page.getByText("Сохранённые поиски")).toBeVisible();
  await expect(page.getByText(searchName).first()).toBeVisible({ timeout: 10_000 });
});

test("student records an outcome review on an opportunity", async ({ page }) => {
  await login(page, "student@demo.kz");

  await page.goto("/catalog");
  await page.locator('a[href^="/opportunities/"]').first().click();
  await expect(page).toHaveURL(/\/opportunities\//);

  // The review form is only shown to logged-in users. Scope to it so the
  // "Сохранить" button is unambiguous (other Save buttons exist on the page).
  const reviewForm = page.locator("form").filter({ has: page.locator('select[name="outcome"]') });
  await expect(page.getByText("Ваш результат")).toBeVisible();
  await reviewForm.locator('select[name="outcome"]').selectOption("ACCEPTED");
  await reviewForm.locator('textarea[name="comment"]').fill("Поступил! Готовьте проект заранее.");
  await reviewForm.getByRole("button", { name: "Сохранить" }).click();

  await expect(reviewForm.getByText("Сохранено")).toBeVisible({ timeout: 10_000 });
});

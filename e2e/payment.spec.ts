import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("paid plan cannot be selected without a live payment provider", async ({ page }) => {
  await login(page, "student@demo.kz");

  await page.goto("/app/subscription");

  const upgrade = page.getByRole("button", { name: "Выбрать (демо)" }).first();
  await expect(upgrade).toBeVisible();
  await expect(upgrade).toBeDisabled();
  await expect(page.getByText(/эквайринг ещё не подключён/i)).toBeVisible();
});

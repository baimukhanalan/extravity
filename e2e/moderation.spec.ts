import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * The full submission → moderation workflow across two roles: a student submits
 * a found opportunity, the moderator sees it in the queue and approves it. This
 * is the human-in-the-loop guarantee that nothing reaches the catalog unchecked.
 */
test("student submits a link, moderator approves it", async ({ page }) => {
  // A unique URL so the run doesn't collide with an earlier submission.
  const url = `https://example.kz/opportunity-${Date.now()}`;

  // --- Student submits ---
  await login(page, "student@demo.kz");
  await page.goto("/app/submit");
  await page.locator('input[name="url"]').fill(url);
  await page.locator('textarea[name="comment"]').fill("Похоже на олимпиаду, стоит добавить.");
  await page.getByRole("button", { name: "Отправить на проверку" }).click();
  await expect(page.getByText(/Спасибо|на проверку|отправлен/i).first()).toBeVisible({ timeout: 15_000 });

  // --- Moderator approves ---
  // A separate context keeps the sessions from clobbering each other's cookie.
  const adminContext = await page.context().browser()!.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, "admin@demo.kz");

  await adminPage.goto("/admin/moderation");
  // Scope to the card that contains THIS submission's url AND its approve button,
  // so we approve the right one even when the queue holds other pending items.
  const card = adminPage
    .locator("div")
    .filter({ hasText: url })
    .filter({ has: adminPage.getByRole("button", { name: "Одобрить" }) })
    .last();
  await expect(card).toBeVisible({ timeout: 15_000 });

  await card.getByRole("button", { name: "Одобрить" }).click();

  // The submission leaves the pending queue: its URL is no longer shown.
  await expect(adminPage.getByText(url)).toHaveCount(0, { timeout: 15_000 });

  await adminContext.close();
});

test("moderator sees deterministic blockers and safely rejects irrelevant content", async ({ page }) => {
  const title = `Розыгрыш билетов ${Date.now()}`;
  await login(page, "admin@demo.kz");
  await page.goto("/admin/opportunities/new");
  await page.locator("#title").fill(title);
  await page.locator("#shortDescription").fill("Рекламная публикация без формы подачи.");
  await page.locator("#fullDescription").fill("Розыгрыш билетов среди подписчиков канала.");
  await page.locator("#categorySlug").selectOption("creative");
  await page.locator("#organizerName").fill("Тестовый источник");
  await page.getByRole("button", { name: "Создать возможность" }).click();
  await expect(page).toHaveURL(/\/admin\/opportunities$/);

  await page.goto("/admin/moderation");
  const card = page.getByText(title, { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-xl') and contains(@class,'border')][1]");
  await expect(card).toBeVisible();
  await expect(card.getByText("Нет точной ссылки на форму заявки")).toBeVisible();
  await expect(card.getByText("Не указан точный дедлайн подачи")).toBeVisible();
  await expect(card.getByText("Нет оригинального медиа из исходного Telegram-поста")).toBeVisible();
  await expect(card.getByText("Текст похож на рекламу или розыгрыш")).toBeVisible();
  await expect(card.getByRole("button", { name: "Опубликовать" })).toBeDisabled();

  page.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: "Отклонить как мусор" }).click();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
});

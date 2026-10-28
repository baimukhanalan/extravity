import { expect, test } from "@playwright/test";

test("catalog finds a title when meaningful query words are separated", async ({ page }) => {
  await page.goto("/catalog?q=Astana%20Weekend");
  await expect(page.getByRole("link", { name: "Astana Hub Startup Weekend", exact: true })).toBeVisible();
});

test("catalog finds the same category through a multilingual opportunity term", async ({ page }) => {
  await page.goto("/catalog?q=%D0%BA%D3%99%D1%81%D1%96%D0%BF%D0%BA%D0%B5%D1%80%D0%BB%D1%96%D0%BA%20%D0%B1%D0%B0%D0%B9%D2%9B%D0%B0%D1%83");
  await expect(page.getByRole("link", { name: "Astana Hub Startup Weekend", exact: true })).toBeVisible();
});

test("catalog searches by its displayed category name", async ({ page }) => {
  await page.goto(`/catalog?q=${encodeURIComponent("Стартап-конкурсы")}`);
  await expect(page.getByRole("link", { name: "Astana Hub Startup Weekend", exact: true })).toBeVisible();
});

test("catalog finds a stored uppercase tag from a lowercase query", async ({ page }) => {
  await page.goto("/catalog?q=ai");
  await expect(page.getByRole("link", { name: "Astana Hub Startup Weekend", exact: true })).toBeVisible();
});

test("catalog finds an AI-tagged program from a Russian topic query", async ({ page }) => {
  await page.goto(`/catalog?q=${encodeURIComponent("искусственный интеллект")}`);
  await expect(page.getByRole("link", { name: "Astana Hub Startup Weekend", exact: true })).toBeVisible();
});

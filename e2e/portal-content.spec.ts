import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { login } from "./helpers";

async function withIsolatedStudent(run: (email: string) => Promise<void>) {
  if (!process.env.E2E_DATABASE_URL || process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) {
    throw new Error("This test requires the dedicated E2E database");
  }
  const prisma = new PrismaClient();
  const email = `e2e-portal-${randomUUID()}@example.kz`;
  const user = await prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash("password123", 10), role: "STUDENT" },
  });
  try {
    await prisma.studentProfile.create({
      data: { userId: user.id, firstName: "Portal", lastName: "Test", onboardingCompleted: true },
    });
    await run(email);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}

const portals = [
  {
    email: "student@demo.kz",
    routes: ["/app", "/app/discover", "/app/recommendations", "/app/saved", "/app/calendar", "/app/applications", "/app/documents", "/app/portfolio", "/app/achievements", "/app/notifications", "/app/profile", "/app/subscription", "/app/settings"],
  },
  {
    email: "parent@demo.kz",
    routes: ["/parent", "/parent/deadlines", "/parent/consents"],
  },
  {
    email: "organizer@demo.kz",
    routes: ["/organizer", "/organizer/opportunities", "/organizer/applications", "/organizer/profile"],
  },
  {
    email: "counselor@demo.kz",
    routes: ["/counselor", "/counselor/students", "/counselor/profile"],
  },
  {
    email: "admin@demo.kz",
    routes: ["/admin", "/admin/moderation", "/admin/coverage", "/admin/opportunities", "/admin/users", "/admin/parser", "/admin/sources", "/admin/organizers", "/admin/submissions", "/admin/news", "/admin/flags", "/admin/complaints", "/admin/audit"],
  },
] as const;

for (const portal of portals) {
  test(`${portal.email} can open every cabinet section`, async ({ page }) => {
    const serverErrors: string[] = [];
    page.on("response", (response) => {
      if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
    });
    const checkRoutes = async (email: string) => {
      await login(page, email);
      for (const route of portal.routes) {
        const response = await page.goto(route);
        expect(response?.status(), route).toBeLessThan(400);
        await expect(page).toHaveURL(new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[/?#]|$)`));
        await expect(page.locator("h1").first(), route).toBeVisible();
      }
      expect(serverErrors).toEqual([]);
    };
    if (portal.email === "student@demo.kz") await withIsolatedStudent(checkRoutes);
    else await checkRoutes(portal.email);
  });
}

test("student cabinet remains usable on a narrow screen", async ({ page }) => {
  await withIsolatedStudent(async (email) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, email);
    await page.goto("/app");
    await expect(page.locator("h1").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole("button", { name: /меню|menu/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("link", { name: /заявки/i }).first().click();
    await expect(page).toHaveURL(/\/app\/applications/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test("admin moderation queue paginates without hiding backlog", async ({ page }) => {
  if (!process.env.E2E_DATABASE_URL || process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) {
    throw new Error("This test requires the dedicated E2E database");
  }
  const prisma = new PrismaClient();
  const marker = `e2e-moderation-page-${Date.now()}`;
  try {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: "olympiad" } });
    await prisma.opportunity.createMany({
      data: Array.from({ length: 55 }, (_, index) => ({
        slug: `${marker}-${index}`,
        title: `${marker} ${index}`,
        shortDescription: "Isolated pagination test candidate",
        fullDescription: "Isolated pagination test candidate",
        categoryId: category.id,
        organizerName: "E2E organizer",
        status: "PENDING_REVIEW" as const,
        moderationStatus: "PENDING" as const,
      })),
    });
    await login(page, "admin@demo.kz");
    await page.goto("/admin/moderation");
    await expect(page.getByRole("navigation", { name: "Страницы очереди модерации" })).toContainText("Страница 1");
    await page.getByRole("navigation", { name: "Страницы очереди модерации" }).getByRole("link", { name: /Далее/ }).click();
    await expect(page).toHaveURL(/\/admin\/moderation\?page=2/);
    await expect(page.getByRole("navigation", { name: "Страницы очереди модерации" })).toContainText("Страница 2");
    await expect(page.getByText(new RegExp(`${marker} (?:49|50|51|52|53|54)`)).first()).toBeVisible();
  } finally {
    await prisma.opportunity.deleteMany({ where: { slug: { startsWith: marker } } });
    await prisma.$disconnect();
  }
});

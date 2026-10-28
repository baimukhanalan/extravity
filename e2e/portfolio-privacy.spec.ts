import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("a student can publish a public-safe portfolio and revoke its link", async ({ page, browser }) => {
  if (!process.env.E2E_DATABASE_URL || process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) {
    throw new Error("A dedicated local E2E database is required");
  }

  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const email = `portfolio-${suffix}@example.kz`;
  const phone = "+7 700 999 00 01";
  const achievement = `E2E portfolio achievement ${suffix}`;
  const previousFlag = await prisma.featureFlag.findUnique({ where: { key: "portfolio_public_links" } });
  const user = await prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash("password123", 10), role: "STUDENT" },
  });

  try {
    await prisma.studentProfile.create({
      data: {
        userId: user.id,
        firstName: "Portfolio",
        lastName: "Privacy",
        phone,
        school: "E2E school",
        onboardingCompleted: true,
      },
    });
    await prisma.achievement.create({
      data: { userId: user.id, title: achievement },
    });
    await prisma.featureFlag.upsert({
      where: { key: "portfolio_public_links" },
      create: { key: "portfolio_public_links", enabled: true },
      update: { enabled: true },
    });

    await login(page, email);
    await page.goto("/app/portfolio");
    await expect(page.getByText(email).last()).toBeVisible();
    await page.getByRole("button", { name: "Опубликовать" }).click();
    await expect(page.getByRole("button", { name: "Сделать приватным" })).toBeVisible();

    const profile = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(profile.publicPortfolio).toBe(true);
    expect(profile.publicSlug).toBeTruthy();

    const anonymous = await browser.newContext();
    try {
      const publicPage = await anonymous.newPage();
      await publicPage.goto(`/p/${profile.publicSlug}`);
      await expect(publicPage.getByRole("heading", { name: "Portfolio Privacy" })).toBeVisible();
      await expect(publicPage.getByText(achievement)).toBeVisible();
      await expect(publicPage.getByText(email)).toHaveCount(0);
      await expect(publicPage.getByText(phone)).toHaveCount(0);

      await page.getByRole("button", { name: "Сделать приватным" }).click();
      await expect(page.getByRole("button", { name: "Опубликовать" })).toBeVisible();
      await publicPage.reload();
      await expect(publicPage.getByText(achievement)).toHaveCount(0);
      expect((await prisma.studentProfile.findUniqueOrThrow({ where: { userId: user.id } })).publicPortfolio).toBe(false);
    } finally {
      await anonymous.close();
    }
  } finally {
    if (previousFlag) {
      await prisma.featureFlag.update({ where: { key: "portfolio_public_links" }, data: { enabled: previousFlag.enabled } });
    } else {
      await prisma.featureFlag.deleteMany({ where: { key: "portfolio_public_links" } });
    }
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});

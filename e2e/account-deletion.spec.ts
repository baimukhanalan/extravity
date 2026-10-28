import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("deleting an account revokes access and removes user applications", async ({ page }) => {
  if (!process.env.E2E_DATABASE_URL || process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) {
    throw new Error("A dedicated local E2E database is required");
  }

  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const email = `e2e-delete-${suffix}@example.kz`;
  const user = await prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash("password123", 10), role: "STUDENT" },
  });

  try {
    await prisma.studentProfile.create({
      data: { userId: user.id, firstName: "Delete", lastName: "Test", onboardingCompleted: true },
    });
    const opportunity = await prisma.opportunity.findUniqueOrThrow({
      where: { slug: "astana-hub-startup-weekend-2026" },
    });
    const application = await prisma.application.create({
      data: { userId: user.id, opportunityId: opportunity.id },
    });
    await login(page, email);
    await page.goto("/app/settings");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Удалить аккаунт" }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });

    const deleted = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(deleted.isActive).toBe(false);
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.email).not.toBe(email);
    expect(await prisma.application.count({ where: { id: application.id } })).toBe(0);

    await page.goto("/app/settings");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    expect((await page.request.get("/api/account/export")).status()).toBe(401);
  } finally {
    await prisma.$disconnect();
  }
});

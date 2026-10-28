import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { login } from "./helpers";

test("removed opportunities remain in application history", async ({ page }) => {
  if (!process.env.E2E_DATABASE_URL || process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) {
    throw new Error("This test requires the dedicated E2E database");
  }
  const prisma = new PrismaClient();
  const title = `E2E archived opportunity ${Date.now()}`;
  let opportunityId: string | undefined;
  try {
    const [student, category] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: "student@demo.kz" } }),
      prisma.category.findUniqueOrThrow({ where: { slug: "olympiad" } }),
    ]);
    const opportunity = await prisma.opportunity.create({
      data: {
        slug: `e2e-archived-${Date.now()}`,
        title,
        shortDescription: "Archived E2E opportunity",
        fullDescription: "Archived E2E opportunity with a past deadline.",
        categoryId: category.id,
        organizerName: "E2E organizer",
        status: "ARCHIVED",
        moderationStatus: "REJECTED",
        applicationDeadline: new Date(Date.now() - 86_400_000),
        deletedAt: new Date(),
      },
    });
    opportunityId = opportunity.id;
    await prisma.application.create({
      data: {
        userId: student.id,
        opportunityId,
        status: "PREPARING",
        progress: 50,
        checklist: [{ id: "review", label: "Review", done: false }],
      },
    });

    await login(page, "student@demo.kz");
    await page.goto("/app/applications");
    const history = page.getByRole("region", { name: "История заявок" });
    await expect(history.getByText(title)).toBeVisible();
    await history.getByText(title).click();
    await expect(page.getByRole("heading", { name: "Эта активность больше не принимает заявки" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review" })).toBeDisabled();
  } finally {
    if (opportunityId) await prisma.opportunity.delete({ where: { id: opportunityId } });
    await prisma.$disconnect();
  }
});

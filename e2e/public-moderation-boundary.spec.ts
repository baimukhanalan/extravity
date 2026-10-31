import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { login } from "./helpers";

function requireE2eDatabase() {
  if (!process.env.E2E_DATABASE_URL || process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) {
    throw new Error("This test requires the dedicated E2E database");
  }
}

test("parsed listings stay public but out of personalized recommendations", async ({ page }) => {
  requireE2eDatabase();
  const prisma = new PrismaClient();
  const marker = `E2E unresolved public ${Date.now()}`;
  const sourceUrl = `https://t.me/extravity_e2e/${Date.now()}`;
  const email = `moderation-boundary-${randomUUID()}@example.kz`;
  let opportunityId: string | undefined;
  let userId: string | undefined;
  try {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash("password123", 10), role: "STUDENT" },
    });
    userId = user.id;
    await prisma.studentProfile.create({
      data: {
        userId,
        firstName: "Moderation",
        lastName: "Boundary",
        school: "E2E school",
        onboardingCompleted: true,
      },
    });

    const category = await prisma.category.findUniqueOrThrow({ where: { slug: "startup" } });
    const opportunity = await prisma.opportunity.create({
      data: {
        slug: `e2e-unresolved-public-${Date.now()}`,
        title: marker,
        shortDescription: "Условия извлечены автоматически из публичной Telegram-публикации и ещё проверяются.",
        fullDescription: "Требует проверки перед публикацией: country, format, price.",
        categoryId: category.id,
        organizerName: "E2E organizer",
        sourceType: "telegram",
        sourceUrl,
        applicationUrl: "https://example.org/apply",
        applicationDeadline: new Date(Date.now() + 30 * 86_400_000),
        status: "REGISTRATION_OPEN",
        moderationStatus: "APPROVED",
        media: {
          create: {
            platformMediaId: `e2e-unresolved-media-${Date.now()}`,
            kind: "IMAGE",
            url: "/e2e-fixtures/catalog.svg",
            mimeType: "image/svg+xml",
            sizeBytes: 1,
            checksum: `e2e-unresolved-${Date.now()}`,
            processingState: "READY",
            rightsState: "SOURCE_POST",
            rightsEvidenceRef: sourceUrl,
          },
        },
        provenance: {
          create: {
            sourceUrl,
            sourceAccount: "extravity_e2e",
            sourcePostId: sourceUrl.split("/").at(-1),
            accessScope: "PUBLIC",
            adminOnlyJson: { publicListingMode: "parsed_unverified", applicationDisabled: false },
          },
        },
      },
    });
    opportunityId = opportunity.id;

    await page.goto(`/catalog?availability=all&q=${encodeURIComponent(marker)}`);
    await expect(page.getByText(marker, { exact: true })).toBeVisible();
    await expect(page.getByText("Условия уточняйте у организатора", { exact: true })).toBeVisible();

    await page.goto("/opportunities/astana-hub-startup-weekend-2026");
    await expect(page.getByRole("heading", { name: "Astana Hub Startup Weekend" })).toBeVisible();
    await expect(page.getByText(marker, { exact: true })).toBeVisible();

    await login(page, email);
    await page.goto("/app/recommendations");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByText(marker, { exact: true })).toHaveCount(0);
  } finally {
    if (opportunityId) await prisma.opportunity.delete({ where: { id: opportunityId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  }
});

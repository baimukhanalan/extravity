import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { login } from "./helpers";

function requireE2eDatabase() {
  if (!process.env.E2E_DATABASE_URL || process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) {
    throw new Error("This test requires the dedicated E2E database");
  }
}

test("student can browse and enlarge multiple approved media", async ({ page }) => {
  requireE2eDatabase();
  const prisma = new PrismaClient();
  const opportunity = await prisma.opportunity.findUniqueOrThrow({ where: { slug: "astana-hub-startup-weekend-2026" } });
  const sourceUrl = "https://t.me/extravity_e2e/1001";
  const platformMediaId = `e2e-gallery-second-${Date.now()}`;
  const mediaIds: string[] = [];
  try {
    const media = await prisma.opportunityMedia.create({
      data: {
        opportunityId: opportunity.id,
        platformMediaId,
        kind: "IMAGE",
        url: "/e2e-fixtures/catalog.svg",
        mimeType: "image/svg+xml",
        sizeBytes: 1,
        checksum: platformMediaId,
        position: 1,
        processingState: "READY",
        rightsState: "SOURCE_POST",
        rightsEvidenceRef: sourceUrl,
        altText: "E2E second media",
      },
    });
    mediaIds.push(media.id);
    const video = await prisma.opportunityMedia.create({
      data: {
        opportunityId: opportunity.id,
        platformMediaId: `e2e-gallery-video-${Date.now()}`,
        kind: "VIDEO",
        url: "/e2e-fixtures/catalog.svg",
        posterUrl: "/e2e-fixtures/catalog.svg",
        mimeType: "video/mp4",
        sizeBytes: 1,
        checksum: "e2e-gallery-video",
        position: 2,
        processingState: "READY",
        rightsState: "SOURCE_POST",
        rightsEvidenceRef: sourceUrl,
        altText: "E2E video controls",
      },
    });
    mediaIds.push(video.id);

    await page.goto("/catalog?q=Astana%20Weekend");
    await page.getByRole("link", { name: /Astana Hub Startup Weekend/ }).first().click();
    const gallery = page.getByRole("region", { name: "Медиа: Astana Hub Startup Weekend" });
    await expect(gallery.getByRole("img", { name: "E2E catalog fixture" })).toBeVisible();
    await gallery.getByRole("button", { name: "Следующее медиа" }).click();
    await expect(gallery.getByRole("img", { name: "E2E second media" })).toBeVisible();
    await gallery.getByRole("button", { name: "Открыть изображение на весь экран" }).click();
    const fullscreen = page.getByRole("dialog", { name: "Полноэкранный просмотр: Astana Hub Startup Weekend" });
    await expect(fullscreen.getByRole("img", { name: "E2E second media" })).toBeVisible();
    await fullscreen.getByRole("button", { name: "Предыдущее медиа" }).click();
    await expect(fullscreen.getByRole("img", { name: "E2E catalog fixture" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(fullscreen).toHaveCount(0);
    await gallery.getByRole("button", { name: "Следующее медиа" }).click();
    await gallery.getByRole("button", { name: "Следующее медиа" }).click();
    const inlineVideo = gallery.locator("video");
    await expect(inlineVideo).toBeVisible();
    const box = await inlineVideo.boundingBox();
    expect(box).not.toBeNull();
    const hitTarget = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, {
      x: box!.x + box!.width / 2,
      y: box!.y + box!.height - 20,
    });
    expect(hitTarget).toBe("VIDEO");
    await gallery.getByRole("button", { name: "Открыть видео на весь экран" }).click();
    await expect(fullscreen.locator("video")).toBeVisible();
    await fullscreen.getByRole("button", { name: "Закрыть полноэкранный просмотр" }).click();
  } finally {
    if (mediaIds.length) await prisma.opportunityMedia.deleteMany({ where: { id: { in: mediaIds } } });
    await prisma.$disconnect();
  }
});

test("expired opportunity stays grey and cannot start an application on mobile", async ({ page }) => {
  requireE2eDatabase();
  const prisma = new PrismaClient();
  const title = `E2E expired catalog ${Date.now()}`;
  const sourceUrl = `https://t.me/extravity_e2e/${Date.now()}`;
  let opportunityId: string | undefined;
  try {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: "olympiad" } });
    const opportunity = await prisma.opportunity.create({
      data: {
        slug: `e2e-expired-catalog-${Date.now()}`,
        title,
        shortDescription: "Past student competition",
        fullDescription: "The application deadline has passed.",
        categoryId: category.id,
        organizerName: "E2E organizer",
        sourceType: "telegram",
        sourceUrl,
        status: "CLOSED",
        moderationStatus: "APPROVED",
        applicationDeadline: new Date(Date.now() - 86_400_000),
        media: {
          create: {
            platformMediaId: `e2e-expired-media-${Date.now()}`,
            kind: "IMAGE",
            url: "/e2e-fixtures/catalog.svg",
            mimeType: "image/svg+xml",
            sizeBytes: 1,
            checksum: "e2e-expired-media",
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
          },
        },
      },
    });
    opportunityId = opportunity.id;

    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "student@demo.kz");
    await page.goto(`/catalog?availability=expired&q=${encodeURIComponent(title)}`);
    const card = page.locator("article").filter({ hasText: title });
    await expect(card).toBeVisible();
    await expect(card.getByText("Истёк")).toBeVisible();
    await card.getByRole("link", { name: new RegExp(title) }).last().click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("Срок подачи истёк.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Приём заявок закрыт" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Начать подготовку" })).toHaveCount(0);
  } finally {
    if (opportunityId) await prisma.opportunity.delete({ where: { id: opportunityId } });
    await prisma.$disconnect();
  }
});

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

test("a maximum-size expired parser batch remains in evidence but never enters the catalog queue", async ({ request }) => {
  if (!process.env.E2E_DATABASE_URL || process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) {
    throw new Error("A dedicated local E2E database is required");
  }
  const secret = process.env.PARSER_INGEST_SECRET;
  if (!secret) throw new Error("E2E parser secret is required");
  const prisma = new PrismaClient();
  const marker = randomUUID();
  const connectorUrl = `https://source.example.org/e2e-${marker}`;
  const sourceUrl = `${connectorUrl}/expired-0`;
  try {
    const payload = {
      connector: { name: "E2E source", type: "official_site", url: connectorUrl },
      items: Array.from({ length: 200 }, (_, index) => ({
        title: `E2E expired olympiad ${marker} ${index}`,
        shortDescription: "A test-only expired olympiad announcement.",
        categorySlug: "olympiad",
        organizerName: "E2E organizer",
        sourceUrl: `${connectorUrl}/expired-${index}`,
        applicationUrl: "https://source.example.org/apply",
        applicationDeadline: "2020-01-01T23:59:00+05:00",
        media: [],
      })),
    };
    const unauthorized = await request.post("/api/parser/ingest", { data: payload });
    expect(unauthorized.status()).toBe(401);
    const response = await request.post("/api/parser/ingest", {
      headers: { authorization: `Bearer ${secret}` },
      data: payload,
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ created: 0, expired: 200, failed: 0 });
    expect(await prisma.opportunity.count({ where: { sourceUrl: { startsWith: connectorUrl } } })).toBe(0);
    expect(await prisma.rawSourceItem.count({ where: { connector: { url: connectorUrl }, processingState: "expired" } })).toBe(200);
    const raw = await prisma.rawSourceItem.findFirstOrThrow({ where: { url: sourceUrl } });
    expect(raw.processingState).toBe("expired");
  } finally {
    const connectors = await prisma.sourceConnector.findMany({ where: { url: connectorUrl }, select: { id: true } });
    const ids = connectors.map((item) => item.id);
    await prisma.rawSourceItem.deleteMany({ where: { connectorId: { in: ids } } });
    await prisma.parserJob.deleteMany({ where: { connectorId: { in: ids } } });
    await prisma.sourceConnector.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});

test("an expired deadline from the same source closes an approved live card", async ({ request }) => {
  if (!process.env.E2E_DATABASE_URL || process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) {
    throw new Error("A dedicated local E2E database is required");
  }
  const secret = process.env.PARSER_INGEST_SECRET;
  if (!secret) throw new Error("E2E parser secret is required");
  const prisma = new PrismaClient();
  const marker = randomUUID();
  const connectorUrl = `https://source.example.org/e2e-revalidate-${marker}`;
  const sourceUrl = `${connectorUrl}/post-1`;
  let opportunityId: string | undefined;
  try {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: "olympiad" } });
    const opportunity = await prisma.opportunity.create({
      data: {
        slug: `e2e-source-deadline-${marker}`,
        title: `E2E current olympiad ${marker}`,
        shortDescription: "Registration is currently open.",
        fullDescription: "Registration is currently open.",
        categoryId: category.id,
        organizerName: "E2E organizer",
        sourceType: "telegram",
        sourceUrl,
        status: "REGISTRATION_OPEN",
        moderationStatus: "APPROVED",
        applicationDeadline: new Date(Date.now() + 7 * 86_400_000),
        media: {
          create: {
            platformMediaId: `e2e-source-cover-${marker}`,
            kind: "IMAGE",
            url: "/opportunity-covers/talk-talk-korea-2026.png",
            mimeType: "image/png",
            sizeBytes: 1,
            checksum: marker,
            processingState: "READY",
            rightsState: "APPROVED",
          },
        },
      },
    });
    opportunityId = opportunity.id;
    const response = await request.post("/api/parser/ingest", {
      headers: { authorization: `Bearer ${secret}` },
      data: {
        connector: { name: "E2E Telegram source", type: "telegram", url: connectorUrl },
        items: [{
          title: opportunity.title,
          shortDescription: "The source now says registration ended.",
          categorySlug: "olympiad",
          organizerName: "E2E organizer",
          sourceUrl,
          applicationDeadline: "2020-01-01T23:59:00+05:00",
          media: [],
        }],
      },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ created: 0, duplicate: 1, failed: 0 });
    const refreshed = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } });
    expect(refreshed.status).toBe("CLOSED");
    expect(refreshed.applicationDeadline?.toISOString()).toBe("2020-01-01T18:59:00.000Z");
    expect(await prisma.auditLog.count({ where: { entityId: opportunity.id, action: "opportunity_closed_by_source_deadline" } })).toBe(1);
    expect(await prisma.rawSourceItem.count({ where: { opportunityId: opportunity.id, processingState: "duplicate" } })).toBe(1);
  } finally {
    if (opportunityId) {
      await prisma.auditLog.deleteMany({ where: { entityId: opportunityId, action: "opportunity_closed_by_source_deadline" } });
      await prisma.opportunity.delete({ where: { id: opportunityId } });
    }
    const connectors = await prisma.sourceConnector.findMany({ where: { url: connectorUrl }, select: { id: true } });
    const ids = connectors.map((item) => item.id);
    await prisma.rawSourceItem.deleteMany({ where: { connectorId: { in: ids } } });
    await prisma.parserJob.deleteMany({ where: { connectorId: { in: ids } } });
    await prisma.sourceConnector.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});

test("an edited source post refreshes an unreviewed card without creating a duplicate", async ({ request }) => {
  if (!process.env.E2E_DATABASE_URL || process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) {
    throw new Error("A dedicated local E2E database is required");
  }
  const secret = process.env.PARSER_INGEST_SECRET;
  if (!secret) throw new Error("E2E parser secret is required");
  const prisma = new PrismaClient();
  const marker = randomUUID();
  const connectorUrl = `https://t.me/e2e_edit_${marker}`;
  const sourceUrl = `${connectorUrl}/1`;
  const initialTitle = `E2E initial competition ${marker}`;
  const revisedTitle = `E2E revised competition ${marker}`;
  try {
    const connector = { name: "E2E Telegram source", type: "telegram", url: connectorUrl };
    const initial = await request.post("/api/parser/ingest", {
      headers: { authorization: `Bearer ${secret}` },
      data: { connector, items: [{
        title: initialTitle,
        shortDescription: "Initial student competition details.",
        categorySlug: "olympiad",
        organizerName: "E2E organizer",
        sourceUrl,
        applicationDeadline: "2030-01-01T23:59:00+05:00",
        media: [],
      }] },
    });
    expect(initial.status()).toBe(200);
    expect(await initial.json()).toMatchObject({ created: 1, failed: 0 });

    const revised = await request.post("/api/parser/ingest", {
      headers: { authorization: `Bearer ${secret}` },
      data: { connector, items: [{
        title: revisedTitle,
        shortDescription: "Revised student competition details.",
        fullDescription: "The source corrected the competition description.",
        categorySlug: "olympiad",
        organizerName: "E2E organizer",
        sourceUrl,
        applicationDeadline: "2030-02-01T23:59:00+05:00",
        media: [],
      }] },
    });
    expect(revised.status()).toBe(200);
    expect(await revised.json()).toMatchObject({ created: 0, duplicate: 1, failed: 0 });
    const opportunities = await prisma.opportunity.findMany({ where: { sourceUrl } });
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({
      title: revisedTitle,
      status: "PENDING_REVIEW",
      moderationStatus: "PENDING",
    });
    expect(opportunities[0].shortDescription).toContain("Revised student competition details.");
    expect(opportunities[0].fullDescription).toContain("The source corrected the competition description.");
    expect(opportunities[0].shortDescription).toContain("Требует проверки перед публикацией: country, format, price.");
  } finally {
    await prisma.opportunity.deleteMany({ where: { sourceUrl } });
    const connectors = await prisma.sourceConnector.findMany({ where: { url: connectorUrl }, select: { id: true } });
    const ids = connectors.map((item) => item.id);
    await prisma.rawSourceItem.deleteMany({ where: { connectorId: { in: ids } } });
    await prisma.parserJob.deleteMany({ where: { connectorId: { in: ids } } });
    await prisma.sourceConnector.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

test("parser keeps a recap and a new competition distinct even when they share an application portal", async ({ request }) => {
  if (!process.env.E2E_DATABASE_URL || process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) {
    throw new Error("A dedicated local E2E database is required");
  }
  const secret = process.env.PARSER_INGEST_SECRET;
  if (!secret) throw new Error("E2E parser secret is required");
  const prisma = new PrismaClient();
  const marker = randomUUID();
  const connectorUrl = `https://t.me/e2e_${marker.replaceAll("-", "")}`;
  const recapUrl = `${connectorUrl}/1`;
  const competitionUrl = `${connectorUrl}/2`;

  try {
    const response = await request.post("/api/parser/ingest", {
      headers: { authorization: `Bearer ${secret}` },
      data: {
        connector: { name: "E2E Telegram source", type: "telegram", url: connectorUrl },
        items: [
          {
            title: "В Астане состоялся AI-хакатон HackAlem",
            shortDescription: "Мероприятие уже завершилось; это отчёт, а не открытый набор.",
            categorySlug: "hackathon",
            organizerName: "E2E organizer",
            sourceUrl: recapUrl,
            applicationUrl: "https://forms.example.org/shared-portal",
            applicationDeadline: "2030-10-01T23:59:00+05:00",
            media: [],
          },
          {
            title: "Хакатон для школьников 2030",
            shortDescription: "Открыт набор школьников на командный хакатон.",
            categorySlug: "hackathon",
            organizerName: "E2E organizer",
            sourceUrl: competitionUrl,
            applicationUrl: "https://forms.example.org/shared-portal",
            applicationDeadline: "2030-10-01T23:59:00+05:00",
            media: [],
          },
        ],
      },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ created: 2, suspicious: 1, autoPublished: 0 });
    const opportunities = await prisma.opportunity.findMany({
      where: { sourceUrl: { in: [recapUrl, competitionUrl] } },
      select: { sourceUrl: true, status: true, moderationStatus: true },
    });
    expect(opportunities).toHaveLength(2);
    expect(opportunities.find((item) => item.sourceUrl === recapUrl)).toMatchObject({ status: "SUSPICIOUS", moderationStatus: "PENDING" });
    expect(opportunities.find((item) => item.sourceUrl === competitionUrl)).toMatchObject({ status: "PENDING_REVIEW", moderationStatus: "PENDING" });
  } finally {
    await prisma.opportunity.deleteMany({ where: { sourceUrl: { in: [recapUrl, competitionUrl] } } });
    const connectors = await prisma.sourceConnector.findMany({ where: { url: connectorUrl }, select: { id: true } });
    const ids = connectors.map((item) => item.id);
    await prisma.rawSourceItem.deleteMany({ where: { connectorId: { in: ids } } });
    await prisma.parserJob.deleteMany({ where: { connectorId: { in: ids } } });
    await prisma.sourceConnector.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});

test("parser retains a large batch of distinct opportunities using one application portal", async ({ request }) => {
  if (!process.env.E2E_DATABASE_URL || process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) {
    throw new Error("A dedicated local E2E database is required");
  }
  const secret = process.env.PARSER_INGEST_SECRET;
  if (!secret) throw new Error("E2E parser secret is required");
  const prisma = new PrismaClient();
  const marker = randomUUID().replaceAll("-", "");
  const connectorUrl = `https://t.me/e2e_batch_${marker}`;
  const items = Array.from({ length: 80 }, (_, index) => ({
    title: `E2E student competition ${marker} ${index + 1}`,
    shortDescription: "Open registration for a distinct student competition.",
    categorySlug: "olympiad",
    organizerName: "E2E organizer",
    sourceUrl: `${connectorUrl}/${index + 1}`,
    applicationUrl: "https://forms.example.org/shared-portal",
    applicationDeadline: "2030-10-01T23:59:00+05:00",
    media: [],
  }));

  try {
    const response = await request.post("/api/parser/ingest", {
      headers: { authorization: `Bearer ${secret}` },
      data: {
        connector: { name: "E2E Telegram batch", type: "telegram", url: connectorUrl },
        items,
      },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ created: 80, duplicate: 0, failed: 0, autoPublished: 0 });
    expect(await prisma.opportunity.count({ where: { sourceUrl: { startsWith: connectorUrl } } })).toBe(80);
  } finally {
    await prisma.opportunity.deleteMany({ where: { sourceUrl: { startsWith: connectorUrl } } });
    const connectors = await prisma.sourceConnector.findMany({ where: { url: connectorUrl }, select: { id: true } });
    const ids = connectors.map((item) => item.id);
    await prisma.rawSourceItem.deleteMany({ where: { connectorId: { in: ids } } });
    await prisma.parserJob.deleteMany({ where: { connectorId: { in: ids } } });
    await prisma.sourceConnector.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});

test("a repeated invalid candidate moves to one durable quarantine row", async ({ request }) => {
  if (!process.env.E2E_DATABASE_URL || process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) {
    throw new Error("A dedicated local E2E database is required");
  }
  const secret = process.env.PARSER_INGEST_SECRET;
  if (!secret) throw new Error("E2E parser secret is required");
  const prisma = new PrismaClient();
  const marker = randomUUID().replaceAll("-", "");
  const connectorUrl = `https://t.me/e2e_quarantine_${marker}`;
  const sourceUrl = `${connectorUrl}/1`;
  const payload = {
    connector: { name: "E2E Telegram quarantine", type: "telegram", url: connectorUrl },
    items: [{
      title: `E2E invalid category ${marker}`,
      shortDescription: "Open registration for a student competition.",
      categorySlug: `missing-${marker}`,
      organizerName: "E2E organizer",
      sourceUrl,
      contentHash: marker.padEnd(64, "0").slice(0, 64),
      applicationDeadline: "2030-10-01T23:59:00+05:00",
      media: [],
    }],
  };

  try {
    const first = await request.post("/api/parser/ingest", {
      headers: { authorization: `Bearer ${secret}` },
      data: payload,
    });
    expect(first.status()).toBe(200);
    expect(await first.json()).toMatchObject({ failed: 1, quarantined: 0 });

    const second = await request.post("/api/parser/ingest", {
      headers: { authorization: `Bearer ${secret}` },
      data: payload,
    });
    expect(second.status()).toBe(200);
    expect(await second.json()).toMatchObject({ failed: 0, quarantined: 1 });
    expect(await prisma.rawSourceItem.count({ where: { url: sourceUrl } })).toBe(1);
    expect(await prisma.rawSourceItem.findFirstOrThrow({ where: { url: sourceUrl } })).toMatchObject({
      processingState: "quarantined",
      opportunityId: null,
    });
  } finally {
    const connectors = await prisma.sourceConnector.findMany({ where: { url: connectorUrl }, select: { id: true } });
    const ids = connectors.map((item) => item.id);
    await prisma.rawSourceItem.deleteMany({ where: { connectorId: { in: ids } } });
    await prisma.parserJob.deleteMany({ where: { connectorId: { in: ids } } });
    await prisma.sourceConnector.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});

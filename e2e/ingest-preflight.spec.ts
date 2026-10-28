import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

test("parser preflight authenticates without creating an ingest job", async ({ request }) => {
  if (!process.env.E2E_DATABASE_URL || process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) {
    throw new Error("A dedicated local E2E database is required");
  }
  const secret = process.env.PARSER_INGEST_SECRET;
  if (!secret) throw new Error("E2E parser secret is required");
  const prisma = new PrismaClient();
  try {
    const before = await prisma.parserJob.count();
    const unauthorized = await request.get("/api/parser/ingest");
    expect(unauthorized.status()).toBe(401);

    const authorized = await request.get("/api/parser/ingest", {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(authorized.status()).toBe(200);
    expect(await authorized.json()).toMatchObject({ ok: true, ingest: true, maxBatchSize: 200 });
    expect(authorized.headers()["cache-control"]).toBe("no-store");
    expect(await prisma.parserJob.count()).toBe(before);
  } finally {
    await prisma.$disconnect();
  }
});

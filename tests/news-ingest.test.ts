import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ createMany: vi.fn(), rateLimit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { newsArticle: { createMany: mocks.createMany } } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));

import { GET, POST } from "@/app/api/parser/news/route";

function request(body: unknown, token = "test-secret") {
  return new NextRequest("http://localhost/api/parser/news", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const item = {
  sourceUrl: "https://example.com/article#part-1",
  title: "Учебная программа по искусственному интеллекту",
  summary: "Короткий оригинальный пересказ события без перепечатки статьи целиком.",
  topic: "ai",
  sourceName: "Example News",
  publishedAt: "2026-09-29T10:00:00Z",
};

describe("news ingest boundary", () => {
  const previousSecret = process.env.PARSER_INGEST_SECRET;
  afterAll(() => {
    if (previousSecret === undefined) delete process.env.PARSER_INGEST_SECRET;
    else process.env.PARSER_INGEST_SECRET = previousSecret;
  });
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PARSER_INGEST_SECRET = "test-secret";
    mocks.rateLimit.mockResolvedValue({ ok: true });
    mocks.createMany.mockResolvedValue({ count: 1 });
  });

  it("requires parser authentication", async () => {
    expect((await POST(request({ items: [item] }, "wrong"))).status).toBe(401);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("exposes authenticated readiness", async () => {
    expect((await GET(new NextRequest("http://localhost/api/parser/news", { headers: { authorization: "Bearer test-secret" } }))).status).toBe(200);
  });

  it("rejects invalid topics and unsafe URLs", async () => {
    const response = await POST(request({ items: [{ ...item, topic: "unverified", sourceUrl: "javascript:alert(1)" }] }));
    expect(response.status).toBe(422);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("creates review-only entries and normalizes the source URL", async () => {
    const response = await POST(request({ items: [item] }));
    expect(response.status).toBe(200);
    expect(mocks.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ sourceUrl: "https://example.com/article", title: item.title })],
      skipDuplicates: true,
    }));
    expect(await response.json()).toMatchObject({ created: 1, pendingReview: 1 });
  });
});

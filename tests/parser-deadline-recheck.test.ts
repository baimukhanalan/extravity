import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { opportunity: mocks } }));

import { GET, POST } from "@/app/api/parser/deadline-recheck/route";

const previous = process.env.PARSER_INGEST_SECRET;
const secret = "deadline-recheck-test-secret";
const url = "https://site.example/api/parser/deadline-recheck";
const request = (method: string, body?: object, auth = true) => new NextRequest(url, {
  method,
  headers: { ...(auth ? { Authorization: `Bearer ${secret}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PARSER_INGEST_SECRET = secret;
});
afterEach(() => {
  if (previous === undefined) delete process.env.PARSER_INGEST_SECRET;
  else process.env.PARSER_INGEST_SECRET = previous;
});

describe("parser deadline recheck queue", () => {
  it("requires parser authentication", async () => {
    expect((await GET(request("GET", undefined, false))).status).toBe(401);
    expect((await POST(request("POST", { urls: ["https://t.me/school_news/42"] }, false))).status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("returns only exact public Telegram posts from pending rows", async () => {
    mocks.findMany.mockResolvedValue([
      { sourceUrl: "https://t.me/school_news/42" },
      { sourceUrl: "https://t.me/c/12345/42" },
      { sourceUrl: "https://t.me/school_news/43?query=1" },
    ]);
    const response = await GET(request("GET"));
    expect(await response.json()).toEqual({ ok: true, urls: ["https://t.me/school_news/42"] });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ applicationDeadline: null, moderationStatus: "PENDING", deletedAt: null }),
      take: 32,
    }));
  });

  it("only acknowledges pending rows without a deadline", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const postUrl = "https://t.me/school_news/42";
    const response = await POST(request("POST", { urls: [postUrl] }));
    expect(await response.json()).toEqual({ ok: true, checked: 1 });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ applicationDeadline: null, moderationStatus: "PENDING", sourceUrl: { in: [postUrl] } }),
      data: { lastCheckedAt: expect.any(Date) },
    });
    expect((await POST(request("POST", { urls: ["https://t.me/c/123/42"] }))).status).toBe(422);
  });
});

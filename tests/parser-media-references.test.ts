import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ mediaFindMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { opportunityMedia: { findMany: mocks.mediaFindMany } } }));

import { GET } from "@/app/api/parser/media/references/route";

const oldSecret = process.env.PARSER_INGEST_SECRET;
const secret = "parser-media-reference-test-secret";
const request = (authorized: boolean) => new Request("https://site.example/api/parser/media/references", {
  headers: authorized ? { Authorization: `Bearer ${secret}` } : {},
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PARSER_INGEST_SECRET = secret;
});

afterEach(() => {
  if (oldSecret === undefined) delete process.env.PARSER_INGEST_SECRET;
  else process.env.PARSER_INGEST_SECRET = oldSecret;
});

describe("parser media references", () => {
  it("requires the parser secret and never returns references to anonymous callers", async () => {
    const response = await GET(request(false));
    expect(response.status).toBe(401);
    expect(mocks.mediaFindMany).not.toHaveBeenCalled();
  });

  it("returns all deduplicated Railway asset ids independent of opportunity status", async () => {
    const a = "a".repeat(64);
    const b = "b".repeat(64);
    mocks.mediaFindMany.mockResolvedValue([
      { storageKey: `railway-volume:${b}` },
      { storageKey: `railway-volume:${a}` },
      { storageKey: `railway-volume:${a}` },
    ]);
    const response = await GET(request(true));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ ok: true, assetIds: [a, b] });
    expect(mocks.mediaFindMany).toHaveBeenCalledWith({
      where: { storageKey: { startsWith: "railway-volume:" } },
      select: { storageKey: true },
      take: 10_001,
    });
  });

  it("fails closed on an oversized or malformed reference set", async () => {
    mocks.mediaFindMany.mockResolvedValueOnce(Array.from({ length: 10_001 }, () => ({ storageKey: `railway-volume:${"a".repeat(64)}` })));
    expect((await GET(request(true))).status).toBe(503);
    mocks.mediaFindMany.mockResolvedValueOnce([{ storageKey: "railway-volume:not-a-hash" }]);
    expect((await GET(request(true))).status).toBe(503);
  });
});

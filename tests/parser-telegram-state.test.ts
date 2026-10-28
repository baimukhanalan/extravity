import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { rawSourceItem: mocks } }));

import { GET, PUT } from "@/app/api/parser/telegram-state/route";

const previous = process.env.PARSER_INGEST_SECRET;
const secret = "telegram-state-test-secret";
const url = "https://site.example/api/parser/telegram-state";
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

describe("parser telegram state", () => {
  it("requires parser authentication", async () => {
    expect((await GET(request("GET", undefined, false))).status).toBe(401);
    expect((await PUT(request("PUT", { state: {} }, false))).status).toBe(401);
  });

  it("returns string encoded cursor state without caching", async () => {
    mocks.findFirst.mockResolvedValue({ extracted: { school_news: "42", "__revision__:school_news:42": "12345678901234567890" } });
    const response = await GET(request("GET"));
    expect(await response.json()).toEqual({
      ok: true,
      state: { school_news: "42", "__revision__:school_news:42": "12345678901234567890" },
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("creates and then updates the singleton state row", async () => {
    mocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "state-id" });
    mocks.create.mockResolvedValue({ id: "created" });
    mocks.update.mockResolvedValue({ id: "state-id" });
    const body = { state: { school_news: "43" } };
    expect((await PUT(request("PUT", body))).status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith({
      data: { url: "telegram-state://primary", processingState: "state", extracted: body.state },
    });
    expect((await PUT(request("PUT", body))).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "state-id" }, data: { extracted: body.state } });
  });

  it("rejects numeric values so large fingerprints keep exact precision", async () => {
    expect((await PUT(request("PUT", { state: { channel: 42 } }))).status).toBe(422);
  });
});

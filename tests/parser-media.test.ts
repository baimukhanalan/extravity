import { afterEach, describe, expect, it, vi } from "vitest";
import { MEDIA_BLOB_RETRY_OPTIONS, POST } from "@/app/api/parser/media/route";

const env = {
  PARSER_INGEST_SECRET: process.env.PARSER_INGEST_SECRET,
  TELEGRAM_MEDIA_ARCHIVE_ENABLED: process.env.TELEGRAM_MEDIA_ARCHIVE_ENABLED,
  TELEGRAM_MEDIA_BOT_TOKEN: process.env.TELEGRAM_MEDIA_BOT_TOKEN,
  TELEGRAM_MEDIA_ARCHIVE_CHAT_ID: process.env.TELEGRAM_MEDIA_ARCHIVE_CHAT_ID,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("parser media retry policy", () => {
  it("allows an idempotent retry at the deterministic content-addressed path", () => {
    expect(MEDIA_BLOB_RETRY_OPTIONS).toEqual({
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  });

  it("archives authenticated parser media through the server-side Telegram secret", async () => {
    process.env.PARSER_INGEST_SECRET = "parser-secret";
    process.env.TELEGRAM_MEDIA_ARCHIVE_ENABLED = "true";
    process.env.TELEGRAM_MEDIA_BOT_TOKEN = `123456:${"A".repeat(35)}`;
    process.env.TELEGRAM_MEDIA_ARCHIVE_CHAT_ID = "-1001234567890";
    process.env.NEXT_PUBLIC_APP_URL = "https://site.example";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      result: { message_id: 42, document: { file_id: "B".repeat(40) } },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const form = new FormData();
    form.set("sourceAccount", "example-channel");
    form.set("sourcePostId", "123");
    form.set("platformMediaId", "photo-1");
    form.set("position", "0");
    form.set("file", new File([jpeg], "photo.jpg", { type: "image/jpeg" }));
    const response = await POST(new Request("https://site.example/api/parser/media", {
      method: "POST",
      headers: { Authorization: "Bearer parser-secret" },
      body: form,
    }) as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.media).toMatchObject({
      kind: "IMAGE",
      storageKey: `telegram-archive:v1:-1001234567890:42:${"B".repeat(40)}`,
      mimeType: "image/jpeg",
      sizeBytes: 4,
      position: 0,
      platformMediaId: "photo-1",
    });
    expect(body.media.url).toMatch(/^https:\/\/site\.example\/api\/telegram-media\/[a-f0-9]{64}$/);
  });
});

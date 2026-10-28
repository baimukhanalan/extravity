import { createHmac } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canonicalJson, reconcileRepair, verifyRepairManifest } from "../scripts/maintenance/telegram-media-repair-reconcile";

const checksum = "a".repeat(64);
const secret = "test-secret";
const origin = "https://site.example";

function signed(resultOverrides: Record<string, unknown> = {}, mediaOverrides: Record<string, unknown> = {}) {
  const media = { id: "media-1", expectedPlatformMediaId: "photo-1", platformMediaId: "photo-1",
    position: 0, expectedChecksum: checksum, checksum, mimeType: "image/jpeg", sizeBytes: 13,
    url: `${origin}/api/source-media/${checksum}`, storageKey: `railway-volume:${checksum}`, ...mediaOverrides };
  const payload = { version: 1, mode: "upload", generatedAt: "2026-09-29T00:00:00+00:00",
    results: [{ opportunityId: "opportunity-1", sourceUrl: "https://t.me/example/42",
      status: "uploaded", source: "verified_spool", media: [media], ...resultOverrides }] };
  return { ...payload, signature: createHmac("sha256", secret).update(canonicalJson(payload)).digest("hex") };
}

function fakePrisma(overrides: Record<string, unknown> = {}, extraMedia = false) {
  const current = { id: "media-1", opportunityId: "opportunity-1", platformMediaId: "photo-1",
    position: 0, checksum, url: "https://old.example/photo", storageKey: "old-key",
    mimeType: "image/jpeg", sizeBytes: 10, kind: "IMAGE", ...overrides };
  const updates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const tx = {
    opportunity: { findUnique: async () => ({ id: "opportunity-1", sourceUrl: "https://t.me/example/42",
      deletedAt: null, provenance: { sourceUrl: "https://t.me/example/42" },
      media: extraMedia ? [current, { ...current, id: "extra-media", position: 1 }] : [current] }) },
    opportunityMedia: { updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      updates.push(args);
      Object.assign(current, args.data);
      return { count: 1 };
    } },
  };
  const prisma = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaClient;
  return { prisma, updates, current };
}

describe("Telegram media repair reconciliation", () => {
  it("matches Python canonical JSON for Unicode strings and sorted keys", () => {
    expect(canonicalJson({ z: "Қазақша", a: { b: 2, a: "\u2028" } })).toBe('{"a":{"a":"\u2028","b":2},"z":"Қазақша"}');
  });

  it("requires a valid upload signature and exact asset identity", () => {
    const manifest = signed();
    expect(verifyRepairManifest(manifest, secret, origin)).toHaveLength(1);
    expect(() => verifyRepairManifest({ ...manifest, mode: "verify" }, secret, origin)).toThrow("signature mismatch");
    expect(() => verifyRepairManifest(signed({}, { storageKey: "wrong" }), secret, origin)).toThrow("storage key");
    expect(() => verifyRepairManifest(signed({}, { expectedChecksum: "b".repeat(64) }), secret, origin)).toThrow("source checksum");
  });

  it("defaults to inspection and changes only the five allowed columns on apply", async () => {
    const repair = verifyRepairManifest(signed(), secret, origin)[0];
    const { prisma, updates, current } = fakePrisma();
    expect(await reconcileRepair(prisma, repair, false)).toMatchObject({ changed: 1, mode: "dry-run" });
    expect(updates).toHaveLength(0);
    expect(await reconcileRepair(prisma, repair, true)).toMatchObject({ changed: 1, mode: "applied" });
    expect(updates[0].data).toEqual({ url: `${origin}/api/source-media/${checksum}`,
      storageKey: `railway-volume:${checksum}`, mimeType: "image/jpeg", sizeBytes: 13, checksum });
    expect(current).toMatchObject({ platformMediaId: "photo-1", position: 0, kind: "IMAGE" });
    expect(await reconcileRepair(prisma, repair, true)).toMatchObject({ changed: 0, mode: "applied" });
    expect(updates).toHaveLength(1);
  });

  it("rejects a changed current checksum before writing", async () => {
    const repair = verifyRepairManifest(signed(), secret, origin)[0];
    const { prisma, updates } = fakePrisma({ checksum: "b".repeat(64) });
    await expect(reconcileRepair(prisma, repair, true)).rejects.toThrow("Media identity changed");
    expect(updates).toHaveLength(0);
  });

  it("rejects an extra album row before writing", async () => {
    const repair = verifyRepairManifest(signed(), secret, origin)[0];
    const { prisma, updates } = fakePrisma({}, true);
    await expect(reconcileRepair(prisma, repair, true)).rejects.toThrow("media set changed");
    expect(updates).toHaveLength(0);
  });
});

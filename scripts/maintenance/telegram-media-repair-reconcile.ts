import { createHmac, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

const SHA256 = /^[a-f0-9]{64}$/;
const SOURCE = /^https:\/\/t\.me\/[A-Za-z0-9_]{1,32}\/[1-9][0-9]*$/;
const MAX_RESULTS = 500;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type UploadedMedia = {
  id: string;
  expectedPlatformMediaId: string | null;
  platformMediaId: string;
  position: number;
  expectedChecksum: string;
  checksum: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  storageKey: string;
};
export type UploadedRepair = { opportunityId: string; sourceUrl: string; media: UploadedMedia[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Matches Python json.dumps(sort_keys=True, separators=(',', ':'), ensure_ascii=False)
// for the JSON types admitted by the manifest schema.
export function canonicalJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort((a, b) => {
      const left = Array.from(a, (char) => char.codePointAt(0)!);
      const right = Array.from(b, (char) => char.codePointAt(0)!);
      for (let index = 0; index < Math.min(left.length, right.length); index++) {
        if (left[index] !== right[index]) return left[index] - right[index];
      }
      return left.length - right.length;
    });
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid ${field}`);
  return value;
}

function checkMedia(raw: unknown, origin: string): UploadedMedia {
  if (!isRecord(raw)) throw new Error("Invalid uploaded media row");
  const id = requiredString(raw.id, "media id");
  const expectedPlatformMediaId = raw.expectedPlatformMediaId;
  if (expectedPlatformMediaId !== null && (typeof expectedPlatformMediaId !== "string" || !expectedPlatformMediaId)) {
    throw new Error(`Invalid expected platform media ID for ${id}`);
  }
  const platformMediaId = requiredString(raw.platformMediaId, "platform media ID");
  const expectedChecksum = requiredString(raw.expectedChecksum, "expected checksum");
  const checksum = requiredString(raw.checksum, "checksum");
  if (!SHA256.test(expectedChecksum) || !SHA256.test(checksum)) throw new Error(`Invalid checksum for ${id}`);
  if (expectedPlatformMediaId !== null && platformMediaId !== expectedPlatformMediaId) throw new Error(`Changed platform media ID for ${id}`);
  if (checksum !== expectedChecksum) throw new Error(`Changed source checksum for ${id}`);
  if (!Number.isSafeInteger(raw.position) || (raw.position as number) < 0) throw new Error(`Invalid position for ${id}`);
  if (!Number.isSafeInteger(raw.sizeBytes) || (raw.sizeBytes as number) <= 0) throw new Error(`Invalid size for ${id}`);
  const mimeType = requiredString(raw.mimeType, "MIME type");
  if (!/^(image|video)\/[a-zA-Z0-9.+-]+$/.test(mimeType)) throw new Error(`Invalid MIME type for ${id}`);
  const storageKey = requiredString(raw.storageKey, "storage key");
  if (storageKey !== `railway-volume:${checksum}`) throw new Error(`Invalid storage key for ${id}`);
  const url = requiredString(raw.url, "media URL");
  if (url !== `${origin}/api/source-media/${checksum}`) throw new Error(`Invalid media URL for ${id}`);
  return { id, expectedPlatformMediaId, platformMediaId, position: raw.position as number,
    expectedChecksum, checksum, mimeType, sizeBytes: raw.sizeBytes as number, url, storageKey };
}

export function verifyRepairManifest(raw: unknown, secret: string, appUrl: string): UploadedRepair[] {
  if (!secret) throw new Error("PARSER_INGEST_SECRET is required");
  const origin = new URL(appUrl);
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) {
    throw new Error("NEXT_PUBLIC_APP_URL must be an HTTPS origin");
  }
  if (!isRecord(raw) || typeof raw.signature !== "string" || !SHA256.test(raw.signature)) throw new Error("Invalid manifest signature");
  const { signature, ...payload } = raw;
  const actual = Buffer.from(signature, "hex");
  const expected = createHmac("sha256", secret).update(canonicalJson(payload as Json), "utf8").digest();
  if (!timingSafeEqual(actual, expected)) throw new Error("Manifest signature mismatch");
  if (payload.version !== 1 || payload.mode !== "upload" || !Array.isArray(payload.results) || payload.results.length > MAX_RESULTS) {
    throw new Error("An upload mode version 1 manifest with at most 500 results is required");
  }
  if (typeof payload.generatedAt !== "string" || !Number.isFinite(Date.parse(payload.generatedAt))) throw new Error("Invalid manifest timestamp");
  const seenOpportunities = new Set<string>();
  const seenSources = new Set<string>();
  const uploaded: UploadedRepair[] = [];
  for (const result of payload.results) {
    if (!isRecord(result)) throw new Error("Invalid repair result");
    const opportunityId = requiredString(result.opportunityId, "opportunity ID");
    const sourceUrl = requiredString(result.sourceUrl, "source URL");
    if (!SOURCE.test(sourceUrl) || new URL(sourceUrl).pathname.split("/")[1].toLowerCase().startsWith("c_") ||
        seenOpportunities.has(opportunityId) || seenSources.has(sourceUrl)) throw new Error(`Invalid or duplicate source for ${opportunityId}`);
    seenOpportunities.add(opportunityId);
    seenSources.add(sourceUrl);
    if (result.status !== "uploaded") {
      if (!["verified", "unavailable", "failed"].includes(String(result.status))) throw new Error(`Invalid status for ${opportunityId}`);
      continue;
    }
    if (!["verified_spool", "telegram_original"].includes(String(result.source))) throw new Error(`Invalid repair source for ${opportunityId}`);
    if (!Array.isArray(result.media) || result.media.length < 1 || result.media.length > 10) throw new Error(`Invalid media count for ${opportunityId}`);
    const media = result.media.map((item) => checkMedia(item, origin.origin));
    if (new Set(media.map((item) => item.id)).size !== media.length ||
        new Set(media.map((item) => item.platformMediaId)).size !== media.length ||
        new Set(media.map((item) => item.position)).size !== media.length ||
        !media.every((item) => item.position < media.length)) throw new Error(`Duplicate or missing media identity for ${opportunityId}`);
    uploaded.push({ opportunityId, sourceUrl, media });
  }
  return uploaded;
}

export async function reconcileRepair(prisma: PrismaClient, repair: UploadedRepair, apply: boolean) {
  return prisma.$transaction(async (tx) => {
    const opportunity = await tx.opportunity.findUnique({
      where: { id: repair.opportunityId },
      select: { id: true, sourceUrl: true, deletedAt: true, provenance: { select: { sourceUrl: true } },
        media: { select: { id: true, opportunityId: true, platformMediaId: true, position: true, checksum: true,
          url: true, storageKey: true, mimeType: true, sizeBytes: true, kind: true } } },
    });
    if (!opportunity || opportunity.deletedAt || opportunity.sourceUrl !== repair.sourceUrl ||
        (opportunity.provenance && opportunity.provenance.sourceUrl !== repair.sourceUrl)) {
      throw new Error(`Opportunity source changed or missing: ${repair.opportunityId}`);
    }
    if (opportunity.media.length !== repair.media.length ||
        !opportunity.media.every((row) => repair.media.some((item) => item.id === row.id))) {
      throw new Error(`Opportunity media set changed: ${repair.opportunityId}`);
    }
    const changes = [];
    for (const item of repair.media) {
      const current = opportunity.media.find((row) => row.id === item.id);
      if (!current || current.opportunityId !== repair.opportunityId || current.position !== item.position ||
          current.platformMediaId !== item.expectedPlatformMediaId || current.checksum !== item.expectedChecksum) {
        throw new Error(`Media identity changed or missing: ${item.id}`);
      }
      if (!item.mimeType.startsWith(current.kind === "IMAGE" ? "image/" : "video/")) throw new Error(`Media kind mismatch: ${item.id}`);
      const target = { url: item.url, storageKey: item.storageKey, mimeType: item.mimeType,
        sizeBytes: item.sizeBytes, checksum: item.checksum };
      const unchanged = Object.entries(target).every(([key, value]) => current[key as keyof typeof target] === value);
      if (unchanged) continue;
      changes.push({ current, target });
    }
    if (apply) {
      for (const { current, target } of changes) {
        const updated = await tx.opportunityMedia.updateMany({
          where: { id: current.id, opportunityId: repair.opportunityId, position: current.position,
            platformMediaId: current.platformMediaId, checksum: current.checksum, url: current.url,
            storageKey: current.storageKey, mimeType: current.mimeType, sizeBytes: current.sizeBytes },
          data: target,
        });
        if (updated.count !== 1) throw new Error(`Concurrent media change: ${current.id}`);
      }
    }
    return { opportunityId: repair.opportunityId, sourceUrl: repair.sourceUrl,
      media: repair.media.length, changed: changes.length, mode: apply ? "applied" : "dry-run" };
  }, { isolationLevel: "Serializable" });
}

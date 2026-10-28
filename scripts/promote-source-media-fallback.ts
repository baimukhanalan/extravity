import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const site = "https://extracurriculars-kz.vercel.app";
const outputDir = join(process.cwd(), "public", "source-media");

const targets = [
  { opportunityId: "11c03064-de2c-4c83-af27-17952057e948", slug: "hinksey-business-essay-competition-2026", post: "https://t.me/univerguide/1239", type: "link", mediaIds: ["edec6934-759c-42c9-8f63-2f6d29d762b3"] },
  { opportunityId: "45d97747-1f13-4686-9129-e4efa6919319", slug: "harvard-student-agencies-case-competition-2026", post: "https://t.me/univerguide/1238", type: "link", mediaIds: ["66ba132c-82d4-4d6c-84ce-43b69d94c397"] },
  { opportunityId: "64004a7d-8fe1-4416-8036-9f259652d7a0", slug: "world-sports-photography-awards-2027", post: "https://t.me/bluescreenkz/17691", type: "photo", mediaIds: ["68853a44-0e26-4be4-9495-2a9d3d462d73", "3d658b3a-86c5-45d3-8c7d-fca2501269b5"] },
  { opportunityId: "cd9c1947-6840-420e-91d1-cac511210ca4", slug: "boston-university-presidential-scholarship-2026", post: "https://t.me/grants_scholarships/7270", type: "photo", mediaIds: ["26e11c6c-bfa4-4e25-bd24-8d0745e07e7d"] },
  { opportunityId: "c64e4e15-425a-44ed-9e0b-21610b085347", slug: "open-doors-2026-bachelors-track", post: "https://t.me/studygrants/7304", type: "photo", mediaIds: ["f081a4b3-111c-42c6-bc71-8a4b063c0459"] },
  { opportunityId: "567c71b9-14fd-49d6-aee1-c4820d4b5084", slug: "lester-b-pearson-scholarship-2027-university-of-toronto", post: "https://t.me/studyqa/15411", type: "photo", mediaIds: ["e575b971-e584-4db4-b719-6ba9f52a8140"] },
] as const;

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assetPath(slug: string, position: number) {
  return `/source-media/${slug}-${position + 1}.jpg`;
}

async function getSourceImages(post: string, type: "link" | "photo", expected: number) {
  const response = await fetch(`${post}?embed=1&mode=tme`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Public post unavailable: ${post} (${response.status})`);
  const html = await response.text();
  const pattern = type === "photo"
    ? /tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/g
    : /link_preview_image[^>]*background-image:url\('([^']+)'\)/g;
  const urls = [...html.matchAll(pattern)].map((match) => match[1]);
  if (urls.length !== expected || urls.some((url) => new URL(url).hostname !== "cdn4.telesco.pe")) {
    throw new Error(`Unexpected public source media set: ${post} (${urls.length}/${expected})`);
  }
  return urls;
}

async function checkedImage(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok || response.headers.get("content-type") !== "image/jpeg") throw new Error(`Source image unavailable: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 10_000 || bytes.length > 4_000_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error(`Unexpected source image bytes: ${bytes.length}`);
  }
  return bytes;
}

async function download() {
  await mkdir(outputDir, { recursive: true });
  const rows = [];
  for (const target of targets) {
    const urls = await getSourceImages(target.post, target.type, target.mediaIds.length);
    for (const [position, url] of urls.entries()) {
      const bytes = await checkedImage(url);
      const path = assetPath(target.slug, position);
      await writeFile(join(process.cwd(), "public", path), bytes);
      rows.push({ post: target.post, path, bytes: bytes.length, sha256: sha256(bytes) });
    }
  }
  console.log(JSON.stringify({ mode: "download", assets: rows }, null, 2));
}

async function verifyAndMaybeApply(apply: boolean) {
  const updates: Array<{ opportunityId: string; mediaId: string; path: string; oldUrl: string; oldChecksum: string; checksum: string; bytes: number; byteIdenticalToOriginal: boolean }> = [];
  for (const target of targets) {
    const opportunity = await db.opportunity.findUnique({ where: { id: target.opportunityId }, include: { media: true } });
    if (!opportunity || opportunity.slug !== target.slug || opportunity.status !== "REGISTRATION_OPEN" || opportunity.moderationStatus !== "APPROVED") {
      throw new Error(`Live opportunity changed: ${target.slug}`);
    }
    const sourceMedia = opportunity.media.filter((media) => media.rightsState === "SOURCE_POST").sort((a, b) => a.position - b.position);
    if (sourceMedia.length !== target.mediaIds.length) throw new Error(`Media set changed: ${target.slug}`);
    for (const [position, mediaId] of target.mediaIds.entries()) {
      const media = sourceMedia[position];
      if (media.id !== mediaId || media.rightsEvidenceRef !== target.post || media.kind !== "IMAGE" || !media.checksum) throw new Error(`Media provenance changed: ${target.slug}`);
      const path = assetPath(target.slug, position);
      const local = new Uint8Array(await readFile(join(process.cwd(), "public", path)));
      const deployed = await checkedImage(`${site}${path}`);
      const checksum = sha256(local);
      if (checksum !== sha256(deployed)) throw new Error(`Deployed asset differs: ${path}`);
      if (!media.url.startsWith("https://33gudesxn0ngubks.public.blob.vercel-storage.com/") && media.url !== path) {
        throw new Error(`Media URL changed unexpectedly: ${media.id}`);
      }
      updates.push({ opportunityId: target.opportunityId, mediaId, path, oldUrl: media.url, oldChecksum: media.checksum, checksum, bytes: local.length, byteIdenticalToOriginal: checksum === media.checksum });
    }
  }
  if (!apply) {
    console.log(JSON.stringify({ mode: "verify", assets: updates }, null, 2));
    return;
  }
  await db.$transaction(async (tx) => {
    for (const update of updates) {
      if (update.oldUrl === update.path) continue;
      const changed = await tx.opportunityMedia.updateMany({
        where: { id: update.mediaId, opportunityId: update.opportunityId, url: update.oldUrl, rightsState: "SOURCE_POST", checksum: update.oldChecksum },
        data: { url: update.path, storageKey: update.path.slice(1), checksum: update.checksum, sizeBytes: update.bytes },
      });
      if (changed.count !== 1) throw new Error(`Concurrent media change: ${update.mediaId}`);
      await tx.auditLog.create({ data: { action: "source_media_restored_from_public_post", entity: "opportunity", entityId: update.opportunityId, meta: { mediaId: update.mediaId, originalBlobUrl: update.oldUrl, newPath: update.path, sourcePost: targets.find((target) => target.opportunityId === update.opportunityId)?.post, byteIdenticalToOriginal: update.byteIdenticalToOriginal } } });
    }
  }, { timeout: 60_000 });
  console.log(JSON.stringify({ mode: "applied", updated: updates.filter((row) => row.oldUrl !== row.path).length }));
}

const downloadMode = process.argv.includes("--download");
const applyMode = process.argv.includes("--apply");
if (downloadMode && applyMode) throw new Error("Choose one mode");
void (downloadMode ? download() : verifyAndMaybeApply(applyMode)).finally(() => db.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

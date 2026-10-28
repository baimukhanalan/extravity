import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const slug = "ssr-global-research-challenge-2026";
const post = "https://t.me/univerguide/1232";
const path = `/source-media/${slug}-1.jpg`;
const site = "https://extracurriculars-kz.vercel.app";
const checksum = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function sourceImage() {
  const response = await fetch(`${post}?embed=1&mode=tme`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("Source post unavailable");
  const html = await response.text();
  const urls = [...html.matchAll(/link_preview_image[^>]*background-image:url\('([^']+)'\)/g)].map((match) => match[1]);
  if (urls.length !== 1 || new URL(urls[0]).hostname !== "cdn4.telesco.pe") throw new Error("Unexpected source media set");
  const image = await fetch(urls[0], { signal: AbortSignal.timeout(20_000) });
  if (!image.ok || image.headers.get("content-type") !== "image/jpeg") throw new Error("Source image unavailable");
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (bytes.length < 10_000 || bytes.length > 4_000_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Unexpected source image");
  return bytes;
}

async function main() {
  const download = process.argv.includes("--download");
  const apply = process.argv.includes("--apply");
  if (download && apply) throw new Error("Choose one mode");
  if (download) {
    const bytes = await sourceImage();
    await mkdir(join(process.cwd(), "public", "source-media"), { recursive: true });
    await writeFile(join(process.cwd(), "public", path), bytes);
    console.log(JSON.stringify({ mode: "download", path, sizeBytes: bytes.length, checksum: checksum(bytes) }));
    return;
  }
  const opportunity = await db.opportunity.findUnique({ where: { slug }, include: { media: true } });
  if (!opportunity || opportunity.moderationStatus !== "APPROVED") throw new Error("Opportunity changed");
  const media = opportunity.media.filter((item) => item.rightsState === "SOURCE_POST");
  if (media.length !== 1 || media[0].rightsEvidenceRef !== post || media[0].kind !== "IMAGE" || media[0].processingState !== "READY") throw new Error("Source media changed");
  const original = media[0];
  if (!original.url.startsWith("https://33gudesxn0ngubks.public.blob.vercel-storage.com/") && original.url !== path) throw new Error("Unexpected old media URL");
  const local = new Uint8Array(await readFile(join(process.cwd(), "public", path)));
  const served = await fetch(`${site}${path}`, { signal: AbortSignal.timeout(15_000) });
  if (!served.ok || served.headers.get("content-type") !== "image/jpeg") throw new Error("Deployed image unavailable");
  const remote = new Uint8Array(await served.arrayBuffer());
  if (checksum(local) !== checksum(remote)) throw new Error("Deployed image differs");
  if (!apply) {
    console.log(JSON.stringify({ mode: "verify", slug, mediaId: original.id, path, sizeBytes: local.length, checksum: checksum(local) }));
    return;
  }
  if (original.url !== path) {
    await db.$transaction(async (tx) => {
      const result = await tx.opportunityMedia.updateMany({
        where: { id: original.id, opportunityId: opportunity.id, url: original.url, rightsState: "SOURCE_POST", checksum: original.checksum },
        data: { url: path, storageKey: path.slice(1), checksum: checksum(local), sizeBytes: local.length },
      });
      if (result.count !== 1) throw new Error("Concurrent media change");
      await tx.auditLog.create({ data: { action: "source_media_restored_from_public_post", entity: "opportunity", entityId: opportunity.id, meta: { mediaId: original.id, originalBlobUrl: original.url, newPath: path, sourcePost: post } } });
    }, { timeout: 30_000 });
  }
  console.log(JSON.stringify({ mode: "applied", slug, path }));
}

void main().finally(() => db.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const sources = [
  { slug: "ssr-global-research-challenge-2026", sourcePost: "https://t.me/univerguide/1232", count: 1 },
  { slug: "hinksey-business-essay-competition-2026", sourcePost: "https://t.me/univerguide/1239", count: 1 },
  { slug: "harvard-student-agencies-case-competition-2026", sourcePost: "https://t.me/univerguide/1238", count: 1 },
  { slug: "world-sports-photography-awards-2027", sourcePost: "https://t.me/bluescreenkz/17691", count: 2 },
  { slug: "boston-university-presidential-scholarship-2026", sourcePost: "https://t.me/grants_scholarships/7270", count: 1 },
  { slug: "open-doors-2026-bachelors-track", sourcePost: "https://t.me/studygrants/7304", count: 1 },
] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const retireGenerated = process.argv.includes("--retire-generated");
  if (retireGenerated && !apply) throw new Error("--retire-generated requires --apply");
  const report = [];

  for (const source of sources) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { slug: source.slug },
      include: { media: { orderBy: { createdAt: "asc" } }, provenance: true },
    });
    if (!opportunity || opportunity.moderationStatus !== "APPROVED") throw new Error(`Unexpected opportunity: ${source.slug}`);
    const original = opportunity.media.filter((media) => media.platformMediaId && !media.platformMediaId.startsWith("extravity-generated:") && media.url.startsWith("https://") && media.storageKey?.startsWith("opportunity-media/") && media.processingState === "READY");
    const generated = opportunity.media.filter((media) => media.platformMediaId?.startsWith("extravity-generated:"));
    if (original.length !== source.count || generated.length !== 1) throw new Error(`Media set changed: ${source.slug}`);
    const post = new URL(source.sourcePost);
    const expectedPath = `opportunity-media/${post.pathname.split("/")[1]}/${post.pathname.split("/")[2]}/`;
    if (!original.every((media) => media.storageKey?.startsWith(expectedPath))) throw new Error(`Source post mismatch: ${source.slug}`);
    for (const media of original) {
      const response = await fetch(media.url, { method: "HEAD", signal: AbortSignal.timeout(15_000) });
      if (!response.ok || !response.headers.get("content-type")?.startsWith(media.kind === "IMAGE" ? "image/" : "video/")) {
        throw new Error(`Source media unavailable: ${source.slug}`);
      }
    }
    report.push({ slug: source.slug, sourcePost: source.sourcePost, originalCount: original.length, generatedCount: generated.length, phase: retireGenerated ? "retire-generated" : "restore-original" });
    if (!apply) continue;

    await prisma.$transaction(async (tx) => {
      if (!retireGenerated) {
        for (const [index, media] of original.entries()) {
          await tx.opportunityMedia.update({
            where: { id: media.id },
            data: { rightsState: "SOURCE_POST", rightsEvidenceRef: source.sourcePost, position: index, altText: `Медиа из исходной публикации: ${opportunity.title}` },
          });
        }
        await tx.opportunityProvenance.update({
          where: { opportunityId: opportunity.id },
          data: { rightsBasis: "SOURCE_POST_ATTRIBUTED" },
        });
      } else {
        if (!original.every((media) => media.rightsState === "SOURCE_POST" && media.rightsEvidenceRef === source.sourcePost)) throw new Error(`Source media not yet restored: ${source.slug}`);
        await tx.opportunityMedia.updateMany({
          where: { opportunityId: opportunity.id, platformMediaId: { startsWith: "extravity-generated:" } },
          data: { rightsState: "REJECTED", rightsEvidenceRef: null, position: 10 },
        });
      }
      await tx.auditLog.create({
        data: { action: retireGenerated ? "generated_media_retired" : "source_media_restored", entity: "opportunity", entityId: opportunity.id, meta: { sourcePost: source.sourcePost, originalMediaCount: original.length, ownerRequested: true } },
      });
    });
  }
  console.log(JSON.stringify({ apply, report }, null, 2));
}

void main().finally(() => prisma.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const candidateId = "707c005f-753f-462e-b7b9-d8d50167856c";
const sourcePost = "https://t.me/studyqa/15437";
const embassyNotice = "https://www.kz.emb-japan.go.jp/itpr_ru/11_000001_00640.html";
const unsupportedDeadline = "2026-10-30T18:59:00.000Z";
const embassyDeadline = "2026-05-29T12:00:00.000Z";

async function main() {
  const apply = process.argv.includes("--apply");
  const candidate = await prisma.opportunity.findUnique({ where: { id: candidateId } });
  if (
    !candidate ||
    candidate.sourceUrl !== sourcePost ||
    candidate.status !== "PENDING_REVIEW" ||
    candidate.moderationStatus !== "PENDING" ||
    candidate.applicationDeadline?.toISOString() !== unsupportedDeadline ||
    !candidate.fullDescription.includes("University-Recommended Track")
  ) {
    throw new Error("MEXT candidate changed; review manually before correction");
  }

  const result = {
    mode: apply ? "apply" : "dry-run",
    candidateId,
    sourcePost,
    oldDeadline: unsupportedDeadline,
    newDeadline: null,
    status: "PENDING_REVIEW",
    embassyUndergraduateKazakhstanDeadline: embassyDeadline,
    embassyNotice,
    reason: "Embassy undergraduate track in Kazakhstan closed; University-Recommended deadline varies by university and the generic 30 October date is unverified",
  };
  if (!apply) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  await prisma.$transaction(async (tx) => {
    const changed = await tx.opportunity.updateMany({
      where: { id: candidateId, sourceUrl: sourcePost, status: "PENDING_REVIEW", moderationStatus: "PENDING", applicationDeadline: new Date(unsupportedDeadline) },
      data: {
        applicationDeadline: null,
        lastCheckedAt: new Date(),
      },
    });
    if (changed.count !== 1) throw new Error("MEXT candidate changed during correction");
    await tx.auditLog.create({
      data: {
        action: "mext_unverified_generic_deadline_removed",
        entity: "opportunity",
        entityId: candidateId,
        meta: {
          sourcePost,
          oldDeadline: unsupportedDeadline,
          embassyUndergraduateKazakhstanDeadline: embassyDeadline,
          embassyNotice,
          status: "PENDING_REVIEW",
          universityRecommendedDeadline: "requires_university_specific_verification",
        },
      },
    });
  }, { timeout: 30_000 });
  console.log(JSON.stringify(result, null, 2));
}

void main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

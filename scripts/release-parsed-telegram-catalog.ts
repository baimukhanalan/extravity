import { Prisma, PrismaClient } from "@prisma/client";
import {
  publicSourceMediaWhere,
  isOriginalTelegramPostMedia,
} from "../lib/source-media-provenance";

const db = new PrismaClient();
const warning = "Условия уточняйте у организатора.";

function objectValue(
  value: Prisma.JsonValue | null | undefined,
): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requestedLimit(): number {
  const arg = process.argv.find((value) => value.startsWith("--limit="));
  const parsed = arg ? Number.parseInt(arg.slice("--limit=".length), 10) : 100;
  return Math.max(1, Math.min(500, Number.isFinite(parsed) ? parsed : 100));
}

function requestedCategory(): string | undefined {
  const arg = process.argv.find((value) => value.startsWith("--category="));
  const value = arg?.slice("--category=".length).trim();
  return value || undefined;
}

function isDurablePublicMedia(media: { storageKey: string | null }): boolean {
  return media.storageKey?.startsWith("telegram-archive:v1:") === true;
}

async function main() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 10 * 864e5);
  const apply = process.argv.includes("--apply");
  const category = requestedCategory();
  const where: Prisma.OpportunityWhereInput = {
    deletedAt: null,
    sourceType: { in: ["telegram", "telegram_forward"] },
    sourceUrl: { startsWith: "https://t.me/" },
    moderationStatus: "PENDING",
    OR: [
      { applicationDeadline: null },
      { applicationDeadline: { gt: cutoff } },
    ],
    media: { some: publicSourceMediaWhere },
    provenance: { is: { accessScope: "PUBLIC" } },
    ...(category ? { category: { slug: category } } : {}),
  };
  const candidateCount = await db.opportunity.count({ where });
  const limit = requestedLimit();
  const exactIds: string[] = [];
  let cursor: string | undefined;
  while (exactIds.length < limit) {
    const page = await db.opportunity.findMany({
      where,
      take: Math.min(500, Math.max(50, (limit - exactIds.length) * 2)),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        sourceUrl: true,
        media: {
          where: publicSourceMediaWhere,
          select: {
            url: true,
            storageKey: true,
            platformMediaId: true,
            processingState: true,
            rightsState: true,
            rightsEvidenceRef: true,
          },
        },
      },
    });
    if (page.length === 0) break;
    for (const row of page) {
      if (
        row.media.length > 0 &&
        row.media.every(isDurablePublicMedia) &&
        row.media.some((media) =>
          isOriginalTelegramPostMedia(row.sourceUrl, media),
        )
      )
        exactIds.push(row.id);
      if (exactIds.length >= limit) break;
    }
    cursor = page.at(-1)?.id;
    if (
      page.length < Math.min(500, Math.max(50, (limit - exactIds.length) * 2))
    )
      break;
  }
  const rows = await db.opportunity.findMany({
    where: { id: { in: exactIds } },
    include: {
      provenance: { select: { adminOnlyJson: true } },
      media: { where: publicSourceMediaWhere, orderBy: { position: "asc" } },
    },
    orderBy: { id: "asc" },
  });
  const selected = rows.filter((row) =>
    row.media.some((media) =>
      isOriginalTelegramPostMedia(row.sourceUrl, media),
    ),
  );

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: "plan",
          category: category ?? "all",
          candidates: candidateCount,
          selectedExactMedia: selected.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  let released = 0;
  const transactionBatchSize = 20;
  for (
    let offset = 0;
    offset < selected.length;
    offset += transactionBatchSize
  ) {
    const batch = selected.slice(offset, offset + transactionBatchSize);
    released += await db.$transaction(
      async (tx) => {
        let batchReleased = 0;
        for (const row of batch) {
          const durableMediaCount = await tx.opportunityMedia.count({
            where: {
              opportunityId: row.id,
              ...publicSourceMediaWhere,
              storageKey: { startsWith: "telegram-archive:v1:" },
            },
          });
          if (durableMediaCount !== row.media.length || durableMediaCount === 0)
            continue;
          const deadline = row.applicationDeadline;
          const nextStatus =
            deadline && deadline <= now ? "CLOSED" : "PUBLISHED";
          const shortDescription = row.shortDescription
            .replace(warning, "")
            .trim()
            .slice(0, 500);
          const fullDescription = row.fullDescription
            .replace(warning, "")
            .trim()
            .slice(0, 8000);
          const changed = await tx.opportunity.updateMany({
            where: { id: row.id, moderationStatus: "PENDING", deletedAt: null },
            data: {
              status: nextStatus,
              moderationStatus: "APPROVED",
              verifiedAt: null,
              lastCheckedAt: now,
              directApplySupported: false,
              assistedApplySupported: false,
              shortDescription,
              fullDescription,
            },
          });
          if (changed.count !== 1) continue;
          const current = objectValue(row.provenance?.adminOnlyJson);
          await tx.opportunityProvenance.update({
            where: { opportunityId: row.id },
            data: {
              adminOnlyJson: {
                ...current,
                publicListingMode: "parsed_unverified",
                publicListingAt: now.toISOString(),
                applicationDisabled: false,
                publicNotice: warning,
              } as Prisma.InputJsonValue,
            },
          });
          await tx.auditLog.create({
            data: {
              action: "opportunity_released_as_parsed_listing",
              entity: "opportunity",
              entityId: row.id,
              meta: {
                sourcePost: row.sourceUrl,
                exactMediaCount: row.media.length,
                applicationDisabled: false,
              },
            },
          });
          batchReleased += 1;
        }
        return batchReleased;
      },
      { maxWait: 60_000, timeout: 120_000 },
    );
  }

  console.log(
    JSON.stringify(
      { mode: "apply", category: category ?? "all", selected: selected.length, released },
      null,
      2,
    ),
  );
}

void main()
  .finally(() => db.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

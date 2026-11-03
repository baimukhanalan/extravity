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

function requestedIds(): string[] | undefined {
  const arg = process.argv.find((value) => value.startsWith("--ids="));
  if (!arg) return undefined;
  const ids = [...new Set(arg.slice("--ids=".length).split(",").map((value) => value.trim()).filter(Boolean))];
  if (ids.length === 0 || ids.length > 500) throw new Error("--ids must contain between 1 and 500 IDs");
  if (ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
    throw new Error("--ids contains an invalid opportunity ID");
  }
  return ids;
}

function isDurablePublicMedia(media: { storageKey: string | null }): boolean {
  return media.storageKey?.startsWith("telegram-archive:v1:") === true;
}

function releaseTitle(row: {
  title: string;
  shortDescription: string;
  fullDescription: string;
}): string | null {
  if (
    /(?:обновил(?:ся|ась|ось)?|теперь\s+\S+\s+не\s+только\s+рассказывает)/i.test(
      row.title,
    )
  )
    return null;
  if (
    /^(?:помните|вы знали|did you know|remember)(?:\s|[?!,:.-]|$)/iu.test(
      row.title.trim(),
    )
  )
    return null;
  if (/^(?:and bring it|our program+m?)(?:[^\p{L}\p{N}]|$)/iu.test(row.title.trim()))
    return null;
  if (/^конкурс\s+[\p{L}\p{N}]{1,2}\s*[»"'’.!?-]*$/iu.test(row.title.trim()))
    return null;
  if (/\bим\.$/iu.test(row.title.trim())) return null;
  const text = `${row.title}\n${row.shortDescription}\n${row.fullDescription}`;
  if (
    /^начался прием заявок\.?$/iu.test(row.title.trim()) &&
    /(?:americancouncils|brand=flexglobal|\bflex\b)/iu.test(text)
  )
    return "FLEX — приём заявок для школьников Казахстана";
  if (/(?:#япрофессионал|yandex\.ru\/profi)/iu.test(text))
    return "X сезон Всероссийской олимпиады «Я — профессионал»";
  if (/nlogn\.info\/georgia-summer/iu.test(text))
    return "Летняя смена «NlogN на море» в Грузии — 2027";
  if (
    /(?:онлайн-кружок|онлайн кружок)[\s\S]{0,160}(?:егэ|математик)/iu.test(
      text,
    )
  )
    return "Бесплатный онлайн-кружок подготовки к ЕГЭ по математике — 2027";
  if (/symposium\.org\/competition/iu.test(text))
    return "St. Gallen Symposium Global Essay Competition 2027";
  if (/chicagolatinofilmfestival\.org\/poster-contest/iu.test(text))
    return "Конкурс дизайна плакатов Чикагского фестиваля латиноамериканского кино 2027";
  if (
    /(?:^|[^\p{L}\p{N}])(?:лотерея|casino|казино|ставки|betting|loto\s*\d)(?:[^\p{L}\p{N}]|$)/iu.test(
      text,
    )
  )
    return null;
  if (
    /^хакатон\s*[·•|:-]\s*онлайн$/i.test(row.title.trim()) &&
    /\bCosmo\s+Hacks\s+2026\b/i.test(text)
  )
    return "Cosmo Hacks 2026 — онлайн-хакатон для школьников и студентов";
  return row.title;
}

function titleTokens(title: string): Set<string> {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "для",
    "на",
    "в",
    "по",
    "от",
    "прием",
    "приема",
    "заявок",
    "открыл",
    "открыла",
    "открыт",
  ]);
  return new Set(
    (title.toLocaleLowerCase("ru").match(/[\p{L}\p{N}]+/gu) ?? []).filter(
      (token) => token.length >= 3 && !stopWords.has(token),
    ),
  );
}

function namedEntities(title: string): Set<string> {
  const normalized = title
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/[әғқңөұүһі]/g, (letter) =>
      ({ ә: "а", ғ: "г", қ: "к", ң: "н", ө: "о", ұ: "у", ү: "у", һ: "х", і: "и" })[
        letter
      ] ?? letter,
    );
  return new Set(
    [...normalized.matchAll(/[«“"]([^»”"]{4,80})[»”"]/g)]
      .map((match) =>
        match[1]?.replace(/[^\p{L}\p{N}]+/gu, " ").trim(),
      )
      .filter((value): value is string => Boolean(value && value.length >= 4)),
  );
}

function isNearDuplicateTitle(title: string, publishedTitles: string[]): boolean {
  const entities = namedEntities(title);
  const tokens = titleTokens(title);
  return publishedTitles.some((publishedTitle) => {
    const publishedEntities = namedEntities(publishedTitle);
    if ([...entities].some((entity) => publishedEntities.has(entity))) return true;
    if (tokens.size < 4) return false;
    const publishedTokens = titleTokens(publishedTitle);
    if (publishedTokens.size < 4) return false;
    const shared = [...tokens].filter((token) => publishedTokens.has(token)).length;
    return shared >= 3 && shared / Math.min(tokens.size, publishedTokens.size) >= 0.65;
  });
}

function sharedTitleTokenCount(first: string, second: string): number {
  const firstTokens = titleTokens(first);
  const secondTokens = titleTokens(second);
  return [...firstTokens].filter((token) => secondTokens.has(token)).length;
}

function sameDatedEvent(
  first: { title: string; eventStartDate: Date | null },
  second: { title: string; eventStartDate: Date | null },
): boolean {
  if (!first.eventStartDate || !second.eventStartDate) return false;
  const close =
    Math.abs(first.eventStartDate.getTime() - second.eventStartDate.getTime()) <=
    36 * 60 * 60 * 1000;
  return close && sharedTitleTokenCount(first.title, second.title) >= 3;
}

async function main() {
  const now = new Date();
  const apply = process.argv.includes("--apply");
  const category = requestedCategory();
  const ids = requestedIds();
  const where: Prisma.OpportunityWhereInput = {
    ...(ids ? { id: { in: ids } } : {}),
    deletedAt: null,
    sourceType: { in: ["telegram", "telegram_forward"] },
    sourceUrl: { startsWith: "https://t.me/" },
    moderationStatus: "PENDING",
    applicationDeadline: { gt: now },
    AND: [
      {
        OR: [
          { eventStartDate: null },
          { eventStartDate: { gt: now } },
        ],
      },
    ],
    media: { some: publicSourceMediaWhere },
    provenance: { is: { accessScope: "PUBLIC" } },
    ...(category ? { category: { slug: category } } : {}),
  };
  const candidateCount = await db.opportunity.count({ where });
  const limit = requestedLimit();
  const exactIds: string[] = [];
  let cursor: string | undefined;
  const pageSize = 250;
  while (true) {
    const page = await db.opportunity.findMany({
      where,
      take: pageSize,
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
    }
    cursor = page.at(-1)?.id;
    if (page.length < pageSize) break;
  }
  const rows = await db.opportunity.findMany({
    where: { id: { in: exactIds } },
    include: {
      category: { select: { slug: true } },
      provenance: { select: { adminOnlyJson: true } },
      media: { where: publicSourceMediaWhere, orderBy: { position: "asc" } },
    },
    orderBy: { id: "asc" },
  });
  const candidateApplicationUrls = rows
    .map((row) => row.applicationUrl)
    .filter((value): value is string => Boolean(value));
  const publishedWithSameApplication = candidateApplicationUrls.length
    ? await db.opportunity.findMany({
        where: {
          id: { notIn: rows.map((row) => row.id) },
          deletedAt: null,
          moderationStatus: "APPROVED",
          status: {
            in: [
              "PUBLISHED",
              "REGISTRATION_OPEN",
              "DEADLINE_SOON",
              "SUSPICIOUS",
              "CLOSED",
              "COMPLETED",
            ],
          },
          applicationUrl: { in: candidateApplicationUrls },
        },
        select: { applicationUrl: true },
      })
    : [];
  const releasedApplicationUrls = new Set(
    publishedWithSameApplication
      .map((row) => row.applicationUrl)
      .filter((value): value is string => Boolean(value)),
  );
  const publishedCatalogRows = await db.opportunity.findMany({
    where: {
      id: { notIn: rows.map((row) => row.id) },
      deletedAt: null,
      moderationStatus: "APPROVED",
      status: {
        in: [
          "PUBLISHED",
          "REGISTRATION_OPEN",
          "DEADLINE_SOON",
          "SUSPICIOUS",
          "CLOSED",
          "COMPLETED",
        ],
      },
    },
    select: { title: true, eventStartDate: true },
  });
  const releasedTitles = publishedCatalogRows.map(
    (published) => published.title,
  );
  const selected: typeof rows = [];
  const selectedTitles = [...releasedTitles];
  const selectedApplicationUrls = new Set(releasedApplicationUrls);
  let evaluatedSafetyRows = 0;
  for (const row of rows) {
    if (selected.length >= limit) break;
    evaluatedSafetyRows += 1;
    const title = releaseTitle(row);
    if (!title) continue;
    if (
      row.applicationUrl &&
      selectedApplicationUrls.has(row.applicationUrl)
    )
      continue;
    if (isNearDuplicateTitle(title, selectedTitles)) continue;
    if (
      publishedCatalogRows.some((published) =>
        sameDatedEvent(
          { title, eventStartDate: row.eventStartDate },
          published,
        ),
      ) ||
      selected.some((candidate) =>
        sameDatedEvent(
          { title, eventStartDate: row.eventStartDate },
          {
            title: releaseTitle(candidate) ?? candidate.title,
            eventStartDate: candidate.eventStartDate,
          },
        ),
      )
    )
      continue;
    if (
      !row.media.some((media) =>
        isOriginalTelegramPostMedia(row.sourceUrl, media),
      )
    )
      continue;
    selected.push(row);
    selectedTitles.push(title);
    if (row.applicationUrl) selectedApplicationUrls.add(row.applicationUrl);
  }

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: "plan",
          category: category ?? "all",
          candidates: candidateCount,
          scannedExactMedia: rows.length,
          selectedExactMedia: selected.length,
          excludedBySafetyChecks: evaluatedSafetyRows - selected.length,
          deferredExactMedia: rows.length - evaluatedSafetyRows,
          selection: selected.map((row) => ({
            id: row.id,
            slug: row.slug,
            title: releaseTitle(row),
            category: row.category.slug,
            applicationDeadline: row.applicationDeadline,
            eventStartDate: row.eventStartDate,
            sourceUrl: row.sourceUrl,
          })),
          selectionTruncated: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  let released = 0;
  const releasedItems: Array<{
    id: string;
    slug: string;
    mediaUrl: string;
  }> = [];
  const transactionBatchSize = 20;
  for (
    let offset = 0;
    offset < selected.length;
    offset += transactionBatchSize
  ) {
    const batch = selected.slice(offset, offset + transactionBatchSize);
    const batchItems = await db.$transaction(
      async (tx) => {
        const transactionItems: typeof releasedItems = [];
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
              title: releaseTitle(row) ?? row.title,
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
          transactionItems.push({
            id: row.id,
            slug: row.slug,
            mediaUrl: row.media[0]!.url,
          });
        }
        return transactionItems;
      },
      { maxWait: 60_000, timeout: 120_000 },
    );
    released += batchItems.length;
    releasedItems.push(...batchItems);
  }

  console.log(
    JSON.stringify(
      {
        mode: "apply",
        category: category ?? "all",
        selected: selected.length,
        released,
        releasedItems,
      },
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

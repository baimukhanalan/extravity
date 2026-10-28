import type { Prisma, Format } from "@prisma/client";
import { prisma } from "./prisma";
import { activePublicOpportunityWhere, publicOpportunityWhere, retainPublicCatalogOpportunities } from "./public-opportunity";
import { isOriginalTelegramPostMedia, publicSourceMediaWhere } from "./source-media-provenance";
import { CURATED_PRICE_SOURCES, FREE_CLAIM_FRAGMENTS, NEGATED_FREE_FRAGMENTS } from "./opportunity-price";
import { categorySlugsForSearch, topicTermsForSearch } from "./catalog-search";
import { prioritizeCurrentCatalogItems } from "./catalog-order";

export type CatalogParams = {
  q?: string;
  category?: string;
  city?: string;
  format?: string;
  free?: string;
  availability?: string;
  sort?: string;
  page?: string;
};

const PAGE_SIZE = 12;
const SEARCH_STOP_WORDS = new Set(["a", "an", "and", "at", "by", "for", "in", "of", "the", "to", "в", "во", "до", "для", "и", "из", "на", "от", "по", "с", "со", "үшін"]);

function searchFields(term: string): Prisma.OpportunityWhereInput[] {
  const categorySlugs = categorySlugsForSearch(term);
  const topic = topicTermsForSearch(term);
  const tagVariants = [...new Set([term, term.toLocaleLowerCase("ru"), term.toLocaleUpperCase("ru"),
    ...(topic ? [topic.tag, topic.tag.toLocaleLowerCase("ru"), topic.tag.toLocaleUpperCase("ru")] : [])])];
  const topicPhrases = topic?.terms.filter((phrase) => phrase.length >= 3 && phrase.toLocaleLowerCase("ru") !== term.toLocaleLowerCase("ru")) ?? [];
  return [
    { title: { contains: term, mode: "insensitive" } },
    { shortDescription: { contains: term, mode: "insensitive" } },
    { fullDescription: { contains: term, mode: "insensitive" } },
    { organizerName: { contains: term, mode: "insensitive" } },
    { tags: { hasSome: tagVariants } },
    ...topicPhrases.flatMap((phrase): Prisma.OpportunityWhereInput[] => [
      { title: { contains: phrase, mode: "insensitive" } },
      { shortDescription: { contains: phrase, mode: "insensitive" } },
      { fullDescription: { contains: phrase, mode: "insensitive" } },
    ]),
    ...(categorySlugs.length ? [{ category: { slug: { in: categorySlugs } } }] : []),
  ];
}

export function buildWhere(params: CatalogParams): Prisma.OpportunityWhereInput {
  const now = new Date();
  const where: Prisma.OpportunityWhereInput = params.availability === "active"
    ? activePublicOpportunityWhere(now)
    : publicOpportunityWhere(now);

  const constraints: Prisma.OpportunityWhereInput[] = [];
  if (params.q) {
    const query = params.q.trim().slice(0, 100);
    if (query) {
      const tokens = [...new Set((query.match(/[\p{L}\p{N}]+/gu) ?? [])
        .filter((token) => token.length >= 2 && !SEARCH_STOP_WORDS.has(token.toLowerCase())))]
        .slice(0, 6);
      constraints.push({
        OR: [
          ...searchFields(query),
          ...(tokens.length >= 2 ? [{ AND: tokens.map((token) => ({ OR: searchFields(token) })) }] : []),
        ],
      });
    }
  }
  if (params.category) where.category = { slug: params.category };
  if (params.city) where.city = params.city;
  // Only apply a valid enum value; a crafted ?format=xyz would otherwise make
  // Prisma throw and 500 the public catalog.
  if (params.format && (["ONLINE", "OFFLINE", "HYBRID"] as string[]).includes(params.format)) {
    where.format = params.format as Format;
  }
  if (params.free === "1") {
    constraints.push({
      price: 0,
      OR: [
        { sourceType: { in: [...CURATED_PRICE_SOURCES] } },
        ...FREE_CLAIM_FRAGMENTS.map((phrase) => ({
          fullDescription: { contains: phrase, mode: "insensitive" as const },
        })),
      ],
      NOT: NEGATED_FREE_FRAGMENTS.map((phrase) => ({
        fullDescription: { contains: phrase, mode: "insensitive" as const },
      })),
    });
  }
  if (params.availability === "expired") {
    constraints.push({
      OR: [
        { applicationDeadline: { lte: now } },
        { status: { in: ["CLOSED", "COMPLETED"] } },
      ],
    });
  }
  if (constraints.length > 0) where.AND = constraints;

  return where;
}

function buildOrderBy(sort?: string): Prisma.OpportunityOrderByWithRelationInput[] {
  switch (sort) {
    case "deadline":
      return [{ applicationDeadline: "asc" }];
    case "new":
      return [{ createdAt: "desc" }];
    case "prestige":
      return [{ prestigeScore: "desc" }];
    case "free":
      return [{ price: "asc" }, { prestigeScore: "desc" }];
    case "success":
      // Social-proof ranking: opportunities where real students got accepted.
      return [{ acceptedCount: "desc" }, { appliedCount: "desc" }, { prestigeScore: "desc" }];
    default:
      return [{ isFeatured: "desc" }, { prestigeScore: "desc" }, { createdAt: "desc" }];
  }
}

export async function getCatalog(params: CatalogParams) {
  const where = buildWhere(params);
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);

  const eligible = await prisma.opportunity.findMany({
    where,
    orderBy: buildOrderBy(params.sort),
    select: {
      id: true,
      applicationDeadline: true,
      sourceUrl: true,
      shortDescription: true,
      fullDescription: true,
      provenance: { select: { adminOnlyJson: true } },
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
  const eligibleItems = prioritizeCurrentCatalogItems(retainPublicCatalogOpportunities(eligible)
    .filter((opportunity) => opportunity.media.some((media) => isOriginalTelegramPostMedia(opportunity.sourceUrl, media))));
  const eligibleIds = eligibleItems.map((opportunity) => opportunity.id);
  const pageIds = eligibleIds.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const unorderedItems = await prisma.opportunity.findMany({
    where: { AND: [where, { id: { in: pageIds } }] },
    include: {
      category: true,
      provenance: { select: { adminOnlyJson: true } },
      media: { where: publicSourceMediaWhere, orderBy: { position: "asc" } },
    },
  });
  const itemById = new Map(unorderedItems.map((item) => [item.id, item]));
  const items = pageIds
    .map((id) => itemById.get(id))
    .filter((item): item is (typeof unorderedItems)[number] => Boolean(item));
  const total = eligibleIds.length;

  return { items, total, page, pageSize: PAGE_SIZE, totalPages: Math.ceil(total / PAGE_SIZE) };
}

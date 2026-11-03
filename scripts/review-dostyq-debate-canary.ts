import { Prisma, PrismaClient } from "@prisma/client";
import { publicationGate } from "@/lib/opportunity-publication";
import { parsedTelegramReleaseBlockers } from "@/lib/parsed-telegram-release-gate";
import { isOriginalTelegramPostMedia } from "@/lib/source-media-provenance";

// One evidence-bound correction. This script leaves the card pending; the
// existing exact-ID release workflow performs and verifies the canary.
const reviewed = {
  id: "f4c6bf53-cbfd-4b29-a44f-31a8e1804e43",
  mediaId: "2ea67b5d-fedc-45f5-bec3-55eafe36db98",
  checksum: "53921298ed354197666710f8e559dadf0ab75b5afe4ada9eb7e076722cfa02cc",
  platformMediaId: "5968564679880061959",
  sourceUrl: "https://t.me/DebatersKz/3834",
  sourcePage: "https://t.me/s/DebatersKz/3834",
  officialPage: "https://yourtournament.kz/dostyq-cup3",
  applicationUrl: "https://yourtournament.kz/dostyq-cup3",
  title: "YOUR TOURNAMENT / Dostyq Debate Cup-3 2026 — школьные дебаты",
  shortDescription: "Командный турнир по дебатам на английском языке в Алматы для школьников 8–12 классов. Взнос — до 19 000 ₸ за участника.",
  fullDescription: "Dostyq School Almaty проводит 28–29 ноября 2026 года турнир по дебатам в формате World Schools Debate (3×3) для школьников 8–12 классов. Исходный анонс называет турнир YOUR TOURNAMENT; на странице организатора он указан как Dostyq Debate Cup-3. Принимаются команды из государственных, частных и международных школ Казахстана. Место проведения: Алматы, 4-й микрорайон, дом 11. Язык турнира — английский. Ранний взнос составляет 15 000 ₸ за участника до 18 ноября, затем 19 000 ₸; в карточке показана максимальная стоимость. Telegram-анонс указывает срок регистрации 20 ноября, а страница организатора — 22 ноября. Для безопасности используем более раннюю дату 20 ноября; точный час закрытия не опубликован, подайте заявку заранее. Регистрационная форма находится на странице организатора.",
  organizerName: "Dostyq School Almaty",
  deadline: "2026-11-20T18:59:00.000Z",
  price: 19_000,
} as const;

const db = new PrismaClient();

function readableHtml(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ").toLowerCase();
}

async function checkEvidence() {
  for (const [url, excerpts] of [
    [reviewed.sourcePage, ["your tournament", "registration deadline: november 20, 2026", "8–12 классы", "dostyq school almaty"]],
    [reviewed.officialPage, ["dostyq debate cup-3", "november 28-29, 2026", "8, 9, 10, 11, 12 grades", "15,000 tenge", "19,000 tenge", "november 18, 2026", "registration deadline: november 22, 2026"]],
  ] as const) {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Evidence page unavailable: ${url} (${response.status})`);
    const body = await response.text();
    const postMarker = 'data-post="DebatersKz/3834"';
    const postStart = url === reviewed.sourcePage ? body.indexOf(postMarker) : -1;
    if (url === reviewed.sourcePage && postStart < 0) {
      throw new Error("Original Telegram post is absent from the source page");
    }
    const nextPost = postStart < 0 ? -1 : body.indexOf("tgme_widget_message_wrap", postStart + postMarker.length);
    const evidenceHtml = postStart < 0 ? body : body.slice(postStart, nextPost < 0 ? undefined : nextPost);
    const text = readableHtml(evidenceHtml);
    for (const excerpt of excerpts) {
      if (!text.includes(excerpt.toLowerCase())) throw new Error(`Evidence changed: ${url} (${excerpt})`);
    }
    if (url === reviewed.officialPage && !/<form\b/i.test(body)) {
      throw new Error("Official registration form is absent");
    }
  }
}

async function checkCandidate(client: Prisma.TransactionClient | PrismaClient) {
  const item = await client.opportunity.findUnique({
    where: { id: reviewed.id }, include: { media: true, provenance: true },
  });
  if (!item || item.sourceUrl !== reviewed.sourceUrl || item.status !== "PENDING_REVIEW"
    || item.moderationStatus !== "PENDING" || item.deletedAt
    || item.applicationDeadline?.toISOString() !== reviewed.deadline) {
    throw new Error("Pending source candidate changed");
  }
  if (item.media.length !== 1) throw new Error("Source media set is ambiguous");
  const media = item.media[0];
  if (media.id !== reviewed.mediaId || media.checksum !== reviewed.checksum
    || media.platformMediaId !== reviewed.platformMediaId
    || !isOriginalTelegramPostMedia(reviewed.sourceUrl, media)
    || !media.storageKey?.startsWith("telegram-archive:v1:")) {
    throw new Error("Original archived Telegram media changed");
  }
  const duplicate = await client.opportunity.findFirst({
    where: {
      id: { not: item.id }, deletedAt: null,
      status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON"] },
      OR: [{ sourceUrl: reviewed.sourceUrl }, { applicationUrl: reviewed.applicationUrl }, { title: reviewed.title }],
    }, select: { id: true },
  });
  if (duplicate) throw new Error("A published duplicate already exists");
  const corrected = {
    title: reviewed.title,
    shortDescription: reviewed.shortDescription,
    fullDescription: reviewed.fullDescription,
    organizerName: reviewed.organizerName,
    organizerVerified: "VERIFIED" as const,
    applicationUrl: reviewed.applicationUrl,
    country: "Kazakhstan",
    city: "Алматы",
    venue: "Dostyq School Almaty, 4-й микрорайон, 11",
    format: "OFFLINE" as const,
    minimumGrade: 8,
    maximumGrade: 12,
    participationType: "TEAM" as const,
    minimumTeamSize: 3,
    maximumTeamSize: 3,
    price: reviewed.price,
    currency: "KZT",
    // The public date formatter renders UTC calendar dates, and the source
    // publishes dates without an event start hour.
    eventStartDate: new Date("2026-11-28T12:00:00.000Z"),
    eventEndDate: new Date("2026-11-29T12:00:00.000Z"),
    requirements: ["Школьники 8–12 классов", "Команда из 3 участников", "Дебаты на английском языке"],
    applicationMethod: "external",
    directApplySupported: false,
    assistedApplySupported: false,
    trustScore: 90,
    confidenceScore: 95,
  };
  const gate = publicationGate({
    ...item, ...corrected, media: item.media,
    moderationStatus: "APPROVED", audienceStatus: "SCHOOL",
    ingestUnknownTerms: [], duplicateReviewRequired: false,
  });
  if (!gate.allowed) throw new Error(`Publication gate: ${gate.reasons.join(", ")}`);
  const releaseBlockers = parsedTelegramReleaseBlockers({
    applicationUrl: corrected.applicationUrl,
    country: corrected.country,
    tags: item.tags,
    provenance: {
      audienceStatus: "SCHOOL",
      audienceEvidence: "Telegram post and official page: school grades 8–12",
      organizerEvidence: "SOURCE_TEXT",
      ingestUnknownTerms: [],
    },
  });
  if (releaseBlockers.length) throw new Error(`Release gate: ${releaseBlockers.join(", ")}`);
  return { item, corrected };
}

async function main() {
  const apply = process.argv.includes("--apply");
  await checkEvidence();
  const { item, corrected } = await checkCandidate(db);
  if (new Date(reviewed.deadline) <= new Date()) throw new Error("Registration deadline has passed");
  if (!apply) {
    console.log(JSON.stringify({ mode: "plan", sourceUrl: reviewed.sourceUrl, officialPage: reviewed.officialPage,
      title: corrected.title, deadline: reviewed.deadline, priceKztUpperBound: reviewed.price,
      mediaChecksum: reviewed.checksum, status: item.status, publishableAfterReview: true }, null, 2));
    return;
  }
  const now = new Date();
  await db.$transaction(async (tx) => {
    const fresh = await checkCandidate(tx);
    const changed = await tx.opportunity.updateMany({
      where: { id: reviewed.id, sourceUrl: reviewed.sourceUrl,
        status: "PENDING_REVIEW", moderationStatus: "PENDING", updatedAt: fresh.item.updatedAt },
      data: { ...fresh.corrected, verifiedAt: now, lastCheckedAt: now },
    });
    if (changed.count !== 1) throw new Error("Concurrent candidate change");
    const original = fresh.item.provenance?.adminOnlyJson;
    if (!fresh.item.provenance || !original || typeof original !== "object" || Array.isArray(original)) {
      throw new Error("Source provenance missing");
    }
    await tx.opportunityProvenance.update({
      where: { opportunityId: reviewed.id },
      data: { adminOnlyJson: {
        ...(original as Record<string, unknown>),
        audienceStatus: "SCHOOL",
        audienceEvidence: "Telegram post and official page: school grades 8–12",
        organizerEvidence: "SOURCE_TEXT",
        organizerOfficialEvidence: reviewed.officialPage,
        ingestUnknownTerms: [],
        countryEvidence: `${reviewed.sourceUrl}: schools across Kazakhstan; ${reviewed.officialPage}: Almaty venue`,
        priceEvidenceUrl: reviewed.officialPage,
        priceEvidenceText: "15,000 KZT until 18 November 2026; 19,000 KZT afterward; card uses the upper bound",
        deadlineEvidence: `${reviewed.sourceUrl}: 20 November 2026; ${reviewed.officialPage}: 22 November 2026; earlier date selected`,
        officialPage: reviewed.officialPage,
        reviewedAt: now.toISOString(),
        publicListingMode: "officially_reviewed",
        publicNotice: null,
        applicationDisabled: false,
      } as Prisma.InputJsonValue },
    });
    await tx.auditLog.create({ data: {
      action: "opportunity_officially_reviewed_pending_release",
      entity: "opportunity", entityId: reviewed.id,
      meta: { sourceUrl: reviewed.sourceUrl, officialPage: reviewed.officialPage,
        mediaChecksum: reviewed.checksum, deadline: reviewed.deadline, priceKztUpperBound: reviewed.price },
    } });
  }, { isolationLevel: "Serializable", timeout: 30_000 });
  console.log(JSON.stringify({ mode: "applied", sourceUrl: reviewed.sourceUrl,
    status: "PENDING_REVIEW", readyForExactIdCanary: true }, null, 2));
}

void main().finally(() => db.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

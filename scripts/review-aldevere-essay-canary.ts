import { Prisma, PrismaClient } from "@prisma/client";
import { publicationGate } from "@/lib/opportunity-publication";
import { isOpportunityPriceKnown } from "@/lib/opportunity-price";
import { isOfficiallyReviewedTelegramRelease, parsedTelegramReleaseBlockers } from "@/lib/parsed-telegram-release-gate";
import { isOriginalTelegramPostMedia } from "@/lib/source-media-provenance";

// A single evidence-bound correction. Publication remains an exact-ID canary
// in the separate release workflow after this script has left the row pending.
const reviewed = {
  id: "6a964442-ca7f-42af-8e3d-fd0bb0f02b4a",
  mediaId: "976f2490-125f-4b23-937f-fb6e40ba89de",
  checksum: "d23ee06ac5a16e9182d127a8ba364ab6a8c552fe0bdd3a1a2052bf48c0c98adc",
  platformMediaId: "5978660885276331864",
  sourceUrl: "https://t.me/opportunity_alerts/2900",
  sourcePage: "https://t.me/s/opportunity_alerts/2900",
  officialPage: "https://aldevere.com/scholarships/essay-prize/",
  applicationUrl: "https://tally.so/r/RGQZ0J",
  title: "Aldevere Research Question Prize 2026 — бесплатный конкурс эссе",
  shortDescription: "Бесплатный международный онлайн-конкурс эссе для учащихся 14–18 лет. Объясните сложный научный или учебный вопрос в тексте до 1 000 слов.",
  fullDescription: "Aldevere приглашает учащихся 14–18 лет из любой страны, включая Казахстан, на Research Question Prize 2026. Нужно самостоятельно написать эссе объёмом до 1 000 слов: объяснить сложный вопрос из выбранного учебного предмета любознательному 12-летнему читателю, показать, почему ответ неочевиден и что остаётся неизвестным. Работу подают индивидуально в PDF или Word через форму организатора. Участие бесплатное; первая премия — 500 долларов США, действительные заявки получают сертификат. Дедлайн — 15 ноября 2026 года. Точный час закрытия формы организатор не указал, поэтому отправьте работу заранее. Организатор также предлагает платные образовательные программы; участие в этом конкурсе не требует их покупки.",
  organizerName: "Aldevere",
  deadline: "2026-11-15T18:59:00.000Z",
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
  const source = await fetch(reviewed.sourcePage, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!source.ok) throw new Error(`Telegram source unavailable: ${source.status}`);
  const sourceHtml = await source.text();
  const marker = 'data-post="opportunity_alerts/2900"';
  const start = sourceHtml.indexOf(marker);
  if (start < 0) throw new Error("Original Telegram post is absent");
  const next = sourceHtml.indexOf("tgme_widget_message_wrap", start + marker.length);
  const sourceText = readableHtml(sourceHtml.slice(start, next < 0 ? undefined : next));
  for (const excerpt of ["aldevere research question prize 2026", "aged 14–18", "entry fee: free", "deadline: november 15, 2026"]) {
    if (!sourceText.includes(excerpt)) throw new Error(`Telegram evidence changed: ${excerpt}`);
  }

  const official = await fetch(reviewed.officialPage, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!official.ok) throw new Error(`Organizer page unavailable: ${official.status}`);
  const officialHtml = await official.text();
  const officialText = readableHtml(officialHtml);
  for (const excerpt of ["research question prize", "free to enter", "closes 15 november 2026", "aged 14 to 18 at the closing date, in any country", "entry fee none", "1,000 words"]) {
    if (!officialText.includes(excerpt)) throw new Error(`Organizer evidence changed: ${excerpt}`);
  }
  if (!officialHtml.includes(reviewed.applicationUrl)) throw new Error("Organizer no longer links the submission form");

  const form = await fetch(reviewed.applicationUrl, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!form.ok || !(await form.text()).toLowerCase().includes("research question prize")) {
    throw new Error(`Submission form unavailable or changed: ${form.status}`);
  }
}

function evidenceAt(now: Date) {
  return {
    audienceStatus: "SCHOOL",
    audienceEvidence: "Telegram announcement and organizer page: students aged 14–18",
    organizerEvidence: "SOURCE_TEXT",
    organizerOfficialEvidence: reviewed.officialPage,
    ingestUnknownTerms: [],
    countryEvidence: `${reviewed.officialPage}: students in any country`,
    priceEvidenceUrl: reviewed.officialPage,
    priceEvidenceText: "Organizer page: Free to enter; Entry fee None",
    deadlineEvidence: `${reviewed.officialPage}: closes 15 November 2026; precise hour not stated`,
    officialPage: reviewed.officialPage,
    reviewedAt: now.toISOString(),
    publicListingMode: "officially_reviewed",
    publicNotice: null,
    applicationDisabled: false,
  };
}

async function checkCandidate(client: Prisma.TransactionClient | PrismaClient, now: Date) {
  const item = await client.opportunity.findUnique({ where: { id: reviewed.id }, include: { media: true, provenance: true } });
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
    where: { id: { not: item.id }, deletedAt: null,
      status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON"] },
      OR: [{ sourceUrl: reviewed.sourceUrl }, { applicationUrl: reviewed.applicationUrl }, { title: reviewed.title }] },
    select: { id: true },
  });
  if (duplicate) throw new Error("A published duplicate already exists");
  const corrected = {
    title: reviewed.title,
    shortDescription: reviewed.shortDescription,
    fullDescription: reviewed.fullDescription,
    organizerName: reviewed.organizerName,
    organizerVerified: "VERIFIED" as const,
    applicationUrl: reviewed.applicationUrl,
    country: "International",
    format: "ONLINE" as const,
    minimumAge: 14,
    maximumAge: 18,
    minimumGrade: null,
    maximumGrade: null,
    participationType: "INDIVIDUAL" as const,
    minimumTeamSize: null,
    maximumTeamSize: null,
    price: 0,
    currency: "KZT",
    requirements: ["Возраст 14–18 лет на дату дедлайна", "Индивидуальное оригинальное эссе до 1 000 слов"],
    requiredDocuments: ["Эссе в PDF или Word"],
    applicationMethod: "external",
    directApplySupported: false,
    assistedApplySupported: false,
    trustScore: 85,
    confidenceScore: 95,
  };
  const gate = publicationGate({ ...item, ...corrected, media: item.media,
    moderationStatus: "APPROVED", audienceStatus: "SCHOOL", ingestUnknownTerms: [], duplicateReviewRequired: false, now });
  if (!gate.allowed) throw new Error(`Publication gate: ${gate.reasons.join(", ")}`);
  if (!isOpportunityPriceKnown({ ...item, ...corrected })) throw new Error("Official free-entry evidence is not reflected in the card");
  const releaseBlockers = parsedTelegramReleaseBlockers({ applicationUrl: corrected.applicationUrl,
    country: corrected.country, tags: item.tags, provenance: evidenceAt(now) });
  if (releaseBlockers.length) throw new Error(`Release gate: ${releaseBlockers.join(", ")}`);
  if (!isOfficiallyReviewedTelegramRelease({ verifiedAt: now, organizerVerified: corrected.organizerVerified,
    provenance: evidenceAt(now) })) throw new Error("Verified public marker is incomplete");
  return { item, corrected };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const now = new Date();
  await checkEvidence();
  const { item, corrected } = await checkCandidate(db, now);
  if (item.applicationDeadline && item.applicationDeadline <= now) throw new Error("Deadline has passed");
  if (!apply) {
    console.log(JSON.stringify({ mode: "plan", sourceUrl: reviewed.sourceUrl,
      officialPage: reviewed.officialPage, applicationUrl: reviewed.applicationUrl,
      title: corrected.title, deadline: reviewed.deadline, price: "free",
      mediaChecksum: reviewed.checksum, status: item.status, publishableAfterReview: true }, null, 2));
    return;
  }
  await db.$transaction(async (tx) => {
    const fresh = await checkCandidate(tx, now);
    const original = fresh.item.provenance?.adminOnlyJson;
    if (!fresh.item.provenance || !original || typeof original !== "object" || Array.isArray(original)) {
      throw new Error("Source provenance missing");
    }
    const changed = await tx.opportunity.updateMany({
      where: { id: reviewed.id, sourceUrl: reviewed.sourceUrl,
        status: "PENDING_REVIEW", moderationStatus: "PENDING", updatedAt: fresh.item.updatedAt },
      data: { ...fresh.corrected, verifiedAt: now, lastCheckedAt: now },
    });
    if (changed.count !== 1) throw new Error("Concurrent candidate change");
    await tx.opportunityProvenance.update({ where: { opportunityId: reviewed.id },
      data: { adminOnlyJson: { ...(original as Record<string, unknown>), ...evidenceAt(now) } as Prisma.InputJsonValue } });
    await tx.auditLog.create({ data: { action: "opportunity_officially_reviewed_pending_release",
      entity: "opportunity", entityId: reviewed.id,
      meta: { sourceUrl: reviewed.sourceUrl, officialPage: reviewed.officialPage,
        applicationUrl: reviewed.applicationUrl, mediaChecksum: reviewed.checksum, deadline: reviewed.deadline } } });
  }, { isolationLevel: "Serializable", timeout: 30_000 });
  console.log(JSON.stringify({ mode: "applied", sourceUrl: reviewed.sourceUrl,
    status: "PENDING_REVIEW", readyForExactIdCanary: true }, null, 2));
}

void main().finally(() => db.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

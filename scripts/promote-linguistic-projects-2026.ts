import { PrismaClient } from "@prisma/client";
import { publicationGate } from "@/lib/opportunity-publication";
import { isOpportunityPriceKnown } from "@/lib/opportunity-price";

const db = new PrismaClient();
const id = "b37bb0c0-bc18-48af-b073-afdc2524954d";
const announcement = "https://www.adygnet.ru/media/notifies/8140/";
const rules = "https://disk.yandex.ru/d/vfOhJugSZ6hQ-A";
const sourcePost = "https://t.me/studygrants/7301";
const form = "https://forms.yandex.ru/cloud/6a204be0493639607868e7c3/";

async function main() {
  const apply = process.argv.includes("--apply");
  const opportunity = await db.opportunity.findUnique({ where: { id }, include: { media: true, provenance: true } });
  if (!opportunity || opportunity.status !== "PENDING_REVIEW" || opportunity.sourceUrl !== sourcePost || opportunity.applicationUrl !== form) {
    throw new Error("Candidate identity or review status changed");
  }
  const media = opportunity.media.filter((item) => item.processingState === "READY" && item.rightsState === "SOURCE_POST" && item.rightsEvidenceRef === sourcePost && item.storageKey?.startsWith("railway-volume:"));
  if (media.length !== 1 || opportunity.media.length !== 1) throw new Error("Original post media is missing or ambiguous");
  const duplicate = await db.opportunity.findFirst({ where: { id: { not: id }, title: opportunity.title, status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON"] } }, select: { id: true } });
  if (duplicate) throw new Error("An identical title is already published");
  const [officialResponse, formResponse] = await Promise.all([
    fetch(announcement, { signal: AbortSignal.timeout(15_000) }),
    fetch(form, { signal: AbortSignal.timeout(15_000) }),
  ]);
  if (!officialResponse.ok || !formResponse.ok) throw new Error("Official announcement or application form is unavailable");

  const corrected = {
    title: "Всероссийский конкурс лингвопроектов «Мы говорим на разных языках»",
    shortDescription: "Конкурс лингвопроектов для школьников 9–11 классов: научные, творческие, социальные и технологические проекты. Подать заявку можно онлайн до 31 октября 2026 года.",
    fullDescription: "Адыгейский государственный университет совместно с Сочинским и Пятигорским государственными университетами принимает лингвопроекты школьников 9–11 классов и студентов. Участвовать можно одному или командой до пяти человек; от одного учебного заведения принимают не более пяти проектов. Первый этап — подача проекта и документов до 31 октября 2026 года, второй — заочный отбор в ноябре. К заявке нужны паспорт проекта и материалы выбранной номинации. Стоимость участия в опубликованных условиях не указана — уточните её у организаторов. Положение называет конкурс международным, но отдельные условия для школьников из Казахстана не разъясняет; перед подачей уточните возможность участия у организатора. Точное время закрытия формы не опубликовано, поэтому подайте заявку заранее.",
    organizerName: "Адыгейский, Сочинский и Пятигорский государственные университеты",
    country: "International",
    format: "ONLINE" as const,
    participationType: "BOTH" as const,
    minimumTeamSize: 1,
    maximumTeamSize: 5,
    requiredDocuments: ["Паспорт проекта", "Материалы проекта по выбранной номинации"],
    requirements: ["Школьник 9–11 класса", "Не более пяти проектов от одного образовательного учреждения"],
    selectionProcess: "Первый этап: рассмотрение проекта и документов до 31 октября 2026 года. Второй этап: заочное проведение с 1 по 30 ноября 2026 года.",
    certificatesAvailable: true,
    applicationMethod: "external",
    directApplySupported: false,
    assistedApplySupported: false,
  };
  if (isOpportunityPriceKnown({ ...opportunity, ...corrected })) throw new Error("Unknown fee must not be represented as free or confirmed");
  const gate = publicationGate({
    ...opportunity,
    ...corrected,
    moderationStatus: "APPROVED",
    allowUnknownPrice: true,
    audienceStatus: "SCHOOL",
    ingestUnknownTerms: ["price"],
    duplicateReviewRequired: false,
  });
  if (!gate.allowed) throw new Error(`Publication gate: ${gate.reasons.join(", ")}`);
  if (!opportunity.applicationDeadline || opportunity.applicationDeadline <= new Date()) throw new Error("Deadline passed");
  const plan = { id, title: corrected.title, originalMedia: media.length, price: "unknown", deadlineDate: "2026-10-31", official: announcement, form, apply };
  if (!apply) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    const updated = await tx.opportunity.updateMany({
      where: { id, status: "PENDING_REVIEW", sourceUrl: sourcePost, applicationUrl: form },
      data: { ...corrected, status: "PUBLISHED", moderationStatus: "APPROVED", lastCheckedAt: now },
    });
    if (updated.count !== 1) throw new Error("Candidate changed during publication");
    const original = opportunity.provenance?.adminOnlyJson && typeof opportunity.provenance.adminOnlyJson === "object" && !Array.isArray(opportunity.provenance.adminOnlyJson)
      ? opportunity.provenance.adminOnlyJson as Record<string, unknown> : {};
    await tx.opportunityProvenance.update({ where: { opportunityId: id }, data: {
      adminOnlyJson: { ...original, originalPostText: opportunity.fullDescription, ingestUnknownTerms: ["price"], officialAnnouncement: announcement, officialRules: rules, priceEvidence: "not stated in organizer announcement or rules", eligibilityDisclaimer: "Kazakhstan participation not explicitly confirmed", deadlinePrecision: "date_only", reviewedAt: now.toISOString() },
    } });
    await tx.auditLog.create({ data: { action: "opportunity_published_with_unknown_price", entity: "opportunity", entityId: id, meta: { announcement, rules, sourcePost, form, fee: "unknown", kazakhstanEligibility: "unconfirmed", originalMedia: media[0].id } } });
  });
  console.log(JSON.stringify({ ...plan, published: true }, null, 2));
}

void main().finally(() => db.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

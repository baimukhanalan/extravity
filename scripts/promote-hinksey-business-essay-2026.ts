import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const opportunityId = "11c03064-de2c-4c83-af27-17952057e948";
const officialPage = "https://www.hinkseylabs.com/competition";
const applicationUrl = "https://www.hinkseylabs.com/competition#submit";
const originalPost = "https://t.me/univerguide/1239";
const coverPath = "/opportunity-covers/hinksey-business-essay-competition-2026.png";
const localCover = `public${coverPath}`;
const checksum = "3de9d4d187d5701b0a1696627fbfd51efe56f45c891f52d0597f1d213d49c234";
const deadline = new Date("2026-10-14T22:59:00.000Z");
const rightsEvidenceRef = `Extravity generated illustration; source: built-in image generation; generated 2026-09-29; original file sha256:${checksum}`;

async function main() {
  if (process.argv.includes("--apply")) throw new Error("Generated covers are retired; publish only original source media");
  const apply = process.argv.includes("--apply");
  const [opportunity, cover, coverInfo, officialResponse] = await Promise.all([
    prisma.opportunity.findUnique({ where: { id: opportunityId }, include: { media: true, provenance: true } }),
    readFile(localCover),
    stat(localCover),
    fetch(officialPage, { signal: AbortSignal.timeout(15_000) }),
  ]);
  if (!opportunity || ![originalPost, officialPage].includes(opportunity.sourceUrl ?? "")) throw new Error("Unexpected candidate or source");
  if (!officialResponse.ok) throw new Error("Official competition page is unavailable");
  if (deadline <= new Date()) throw new Error("Conservative deadline has passed; reverify the organizer before publishing");
  if (createHash("sha256").update(cover).digest("hex") !== checksum) throw new Error("Cover checksum changed");
  if (!apply) {
    console.log(JSON.stringify({ candidateId: opportunityId, currentStatus: opportunity.status, mediaCount: opportunity.media.length, officialPage, applicationUrl, deadline: deadline.toISOString(), deadlinePrecision: "date only on organizer page; end of date in UK", coverPath, coverBytes: coverInfo.size, apply: false }, null, 2));
    return;
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id: opportunityId },
      data: {
        slug: "hinksey-business-essay-competition-2026",
        title: "Hinksey Labs Business Essay Competition 2026",
        shortDescription: "Бесплатный международный конкурс бизнес-эссе для школьников 14–18 лет. Нужно написать на английском 1 000–1 500 слов о переменах в компании или НКО.",
        fullDescription: "Hinksey Labs приглашает школьников 14–18 лет из любой страны исследовать, как важная перемена влияет на компанию или некоммерческую организацию. Эссе на английском языке объёмом 1 000–1 500 слов должно описать организацию, перемену, последствия и возможный ответ. На странице организатора открыта форма отправки. В FAQ сказано, что участие полностью бесплатное; использование ИИ возможно только как поддержка исследования и письма, но работа должна отражать собственное мышление автора, а плагиат или чрезмерная генерация ведут к дисквалификации. Организатор указывает дату 14 октября 2026 года, но не точное время или часовой пояс. Каталог показывает конец указанного дня по времени Великобритании как техническую границу; фактическое закрытие формы может быть раньше, поэтому подайте работу заранее и проверьте форму организатора. Иллюстрация на карточке создана Extravity и не является фотографией конкурса.",
        tags: ["бизнес", "эссе", "экономика", "исследование", "международный конкурс"],
        organizerName: "Hinksey Labs",
        organizerVerified: "VERIFIED",
        sourceType: "official_site",
        sourceUrl: officialPage,
        applicationUrl,
        originalLanguage: "en",
        availableLanguages: ["en"],
        country: "International",
        format: "ONLINE",
        minimumAge: 14,
        maximumAge: 18,
        allowedCitizenships: [],
        requiredLanguages: ["en"],
        participationType: "INDIVIDUAL",
        price: 0,
        currency: "GBP",
        applicationDeadline: deadline,
        timezone: "Europe/London",
        requirements: ["Возраст 14–18 лет и статус школьника", "Английское эссе объёмом 1 000–1 500 слов", "Собственный анализ и достоверные источники", "Подать работу через форму организатора"],
        prizes: "1-е место: подарочная карта $150 и 100% скидка на программу Hinksey Labs при соблюдении условий поступления; 2-е место: $50 и 75% скидка; 3-е место: 50% скидка. Финалистам — сертификаты.",
        applicationMethod: "external",
        directApplySupported: false,
        assistedApplySupported: false,
        prestigeScore: 65,
        difficultyScore: 60,
        competitionScore: 70,
        trustScore: 85,
        confidenceScore: 100,
        verifiedAt: now,
        lastCheckedAt: now,
        status: "REGISTRATION_OPEN",
        moderationStatus: "APPROVED",
      },
    });
    await tx.opportunityMedia.updateMany({ where: { opportunityId, platformMediaId: { not: "extravity-generated:hinksey-business-essay-2026:v1" } }, data: { rightsState: "REJECTED", rightsEvidenceRef: null, position: 10 } });
    await tx.opportunityMedia.upsert({
      where: { opportunityId_platformMediaId: { opportunityId, platformMediaId: "extravity-generated:hinksey-business-essay-2026:v1" } },
      create: { opportunityId, kind: "IMAGE", url: coverPath, storageKey: `public${coverPath}`, mimeType: "image/png", sizeBytes: coverInfo.size, width: 1586, height: 992, position: 0, checksum, platformMediaId: "extravity-generated:hinksey-business-essay-2026:v1", processingState: "READY", rightsState: "LICENSED_FALLBACK", rightsEvidenceRef, altText: "Иллюстрация Extravity: школьник пишет бизнес-эссе за рабочим столом" },
      update: { url: coverPath, sizeBytes: coverInfo.size, position: 0, processingState: "READY", rightsState: "LICENSED_FALLBACK", rightsEvidenceRef },
    });
    await tx.opportunityProvenance.upsert({
      where: { opportunityId },
      create: { opportunityId, sourceUrl: officialPage, sourceAccount: "Hinksey Labs", accessScope: "PUBLIC", rightsBasis: "EXTRAVITY_GENERATED_FALLBACK", adminOnlyJson: { discoveryPost: originalPost, officialPage, applicationUrl, deadlineEvidence: "Official page: Submissions deadline 14 Oct. 2026; exact time not published", feeEvidence: "Official FAQ: No, entry is completely free", coverPath, rightsEvidenceRef, verifiedAt: now.toISOString() } },
      update: { sourceUrl: officialPage, sourceAccount: "Hinksey Labs", accessScope: "PUBLIC", rightsBasis: "EXTRAVITY_GENERATED_FALLBACK", adminOnlyJson: { discoveryPost: originalPost, officialPage, applicationUrl, deadlineEvidence: "Official page: Submissions deadline 14 Oct. 2026; exact time not published", feeEvidence: "Official FAQ: No, entry is completely free", coverPath, rightsEvidenceRef, verifiedAt: now.toISOString() } },
    });
    await tx.auditLog.create({ data: { action: "opportunity_officially_verified_and_published", entity: "opportunity", entityId: opportunityId, meta: { officialPage, applicationUrl, deadline: deadline.toISOString(), deadlinePrecision: "date only", cover: "generated_fallback" } } });
  });
  console.log(JSON.stringify({ applied: true, opportunityId, slug: "hinksey-business-essay-competition-2026" }));
}

void main().finally(() => prisma.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

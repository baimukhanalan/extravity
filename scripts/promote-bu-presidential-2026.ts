import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const opportunityId = "cd9c1947-6840-420e-91d1-cac511210ca4";
const originalPost = "https://t.me/grants_scholarships/7270";
const officialPage = "https://www.bu.edu/admissions/tuition-aid/scholarships-financial-aid/first-year-merit/presidential/";
const eligibilityPage = "https://www.bu.edu/admissions/tuition-aid/scholarships-financial-aid/first-year-merit/";
const applicationUrl = "https://www.bu.edu/admissions/apply/first-year/";
const coverPath = "/opportunity-covers/bu-presidential-scholarship-2026.png";
const checksum = "2787274dc6bbb33c964576219401d1f5b39aa85ffa61196497f23ae2a445d1ce";
const deadline = new Date("2026-12-01T18:59:00.000Z");
const rightsEvidenceRef = `Extravity generated illustration; built-in image generation; generated 2026-09-29; sha256:${checksum}`;

async function main() {
  if (process.argv.includes("--apply")) throw new Error("Generated covers are retired; publish only original source media");
  const apply = process.argv.includes("--apply");
  const [opportunity, cover, coverInfo, scholarshipResponse, eligibilityResponse, applicationResponse] = await Promise.all([
    prisma.opportunity.findUnique({ where: { id: opportunityId }, include: { media: true } }),
    readFile(`public${coverPath}`),
    stat(`public${coverPath}`),
    fetch(officialPage, { signal: AbortSignal.timeout(15_000) }),
    fetch(eligibilityPage, { signal: AbortSignal.timeout(15_000) }),
    fetch(applicationUrl, { signal: AbortSignal.timeout(15_000) }),
  ]);
  if (!opportunity || opportunity.sourceUrl !== originalPost || opportunity.status !== "PENDING_REVIEW") throw new Error("Unexpected candidate state");
  if (!scholarshipResponse.ok || !eligibilityResponse.ok || !applicationResponse.ok) throw new Error("Official BU page unavailable");
  if (deadline <= new Date()) throw new Error("Conservative deadline has passed");
  if (createHash("sha256").update(cover).digest("hex") !== checksum) throw new Error("Cover checksum changed");
  const [scholarship, eligibility, application] = await Promise.all([scholarshipResponse.text(), eligibilityResponse.text(), applicationResponse.text()]);
  if (!scholarship.includes("half-tuition") || !scholarship.includes("December 1") || !eligibility.includes("International students") || !application.includes("$80")) throw new Error("Official terms changed; reverify before publishing");
  if (!apply) {
    console.log(JSON.stringify({ candidateId: opportunityId, status: opportunity.status, mediaCount: opportunity.media.length, officialPage, eligibilityPage, applicationUrl, conservativeDeadline: deadline.toISOString(), admissionFeeUsd: 80, coverPath, coverBytes: coverInfo.size, apply: false }, null, 2));
    return;
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id: opportunityId },
      data: {
        slug: "boston-university-presidential-scholarship-2026",
        title: "Presidential Scholarship Boston University — 50% обучения",
        shortDescription: "Стипендия BU покрывает половину стоимости обучения до четырёх лет. Для выпускников школ из любой страны; отдельной заявки на стипендию нет.",
        fullDescription: "Boston University рассматривает поступающих на первый курс, включая международных абитуриентов из Казахстана, на Presidential Scholarship. Она покрывает половину стоимости обучения и может продлеваться до четырёх лет; это не полная стипендия и не фиксированные $25 000. Чтобы участвовать, нужно подать обычную заявку на поступление и все подтверждающие документы до 1 декабря. Отдельного эссе или формы для стипендии нет. Официальная страница не уточняет время и часовой пояс; каталог использует консервативную границу 23:59 по Алматы 1 декабря — лучше отправить заранее. Взнос за заявление в BU составляет $80, возможен waiver при соответствии условиям; за рассмотрение стипендии отдельная плата не указана. Понадобятся школьные документы, рекомендации и подтверждение английского языка для международных абитуриентов. SAT/ACT необязательны по действующей политике. Иллюстрация создана Extravity и не является материалом университета.",
        tags: ["стипендия", "поступление за рубеж", "университет", "США", "обучение"],
        organizerName: "Boston University",
        organizerVerified: "VERIFIED",
        sourceType: "official_site",
        sourceUrl: officialPage,
        applicationUrl,
        originalLanguage: "en",
        availableLanguages: ["en"],
        country: "United States",
        format: "ONLINE",
        minimumAge: null,
        maximumAge: null,
        minimumGrade: null,
        maximumGrade: null,
        allowedCitizenships: [],
        requiredLanguages: ["en"],
        participationType: "INDIVIDUAL",
        price: 80,
        currency: "USD",
        financialAidAvailable: true,
        scholarshipAvailable: true,
        applicationDeadline: deadline,
        timezone: "Asia/Almaty",
        requirements: ["Учиться в последнем классе школы или окончить школу", "Подать обычную заявку на первый курс BU до 1 декабря", "Школьный транскрипт, рекомендация консультанта и учителя", "Подтверждение английского языка для международных абитуриентов", "Оплатить $80 за заявку либо получить подтверждённое освобождение от взноса"],
        prizes: "Покрытие 50% стоимости обучения, продлеваемое до четырёх лет бакалавриата при соблюдении правил BU.",
        applicationMethod: "external",
        directApplySupported: false,
        assistedApplySupported: false,
        prestigeScore: 85,
        difficultyScore: 85,
        competitionScore: 90,
        trustScore: 95,
        confidenceScore: 100,
        verifiedAt: now,
        lastCheckedAt: now,
        status: "REGISTRATION_OPEN",
        moderationStatus: "APPROVED",
      },
    });
    await tx.opportunityMedia.updateMany({ where: { opportunityId, platformMediaId: { not: "extravity-generated:bu-presidential-2026:v1" } }, data: { rightsState: "REJECTED", rightsEvidenceRef: null, position: 10 } });
    await tx.opportunityMedia.upsert({
      where: { opportunityId_platformMediaId: { opportunityId, platformMediaId: "extravity-generated:bu-presidential-2026:v1" } },
      create: { opportunityId, kind: "IMAGE", url: coverPath, storageKey: `public${coverPath}`, mimeType: "image/png", sizeBytes: coverInfo.size, width: 1586, height: 992, position: 0, checksum, platformMediaId: "extravity-generated:bu-presidential-2026:v1", processingState: "READY", rightsState: "LICENSED_FALLBACK", rightsEvidenceRef, altText: "Иллюстрация Extravity: школьница готовит документы для поступления" },
      update: { url: coverPath, sizeBytes: coverInfo.size, position: 0, processingState: "READY", rightsState: "LICENSED_FALLBACK", rightsEvidenceRef },
    });
    await tx.opportunityProvenance.upsert({
      where: { opportunityId },
      create: { opportunityId, sourceUrl: officialPage, sourceAccount: "Boston University", accessScope: "PUBLIC", rightsBasis: "EXTRAVITY_GENERATED_FALLBACK", adminOnlyJson: { discoveryPost: originalPost, officialPage, eligibilityPage, applicationUrl, deadlineEvidence: "Official Presidential page: credentials by December 1, no exact time", eligibilityEvidence: "Official merit page: international students eligible", feeEvidence: "Official first-year application page: $80, waiver possible", awardEvidence: "Official Presidential page: half tuition renewable up to four years", coverPath, rightsEvidenceRef, verifiedAt: now.toISOString() } },
      update: { sourceUrl: officialPage, sourceAccount: "Boston University", accessScope: "PUBLIC", rightsBasis: "EXTRAVITY_GENERATED_FALLBACK", adminOnlyJson: { discoveryPost: originalPost, officialPage, eligibilityPage, applicationUrl, deadlineEvidence: "Official Presidential page: credentials by December 1, no exact time", eligibilityEvidence: "Official merit page: international students eligible", feeEvidence: "Official first-year application page: $80, waiver possible", awardEvidence: "Official Presidential page: half tuition renewable up to four years", coverPath, rightsEvidenceRef, verifiedAt: now.toISOString() } },
    });
    await tx.auditLog.create({ data: { action: "opportunity_officially_verified_and_published", entity: "opportunity", entityId: opportunityId, meta: { officialPage, applicationUrl, deadline: deadline.toISOString(), deadlinePrecision: "date only", cover: "generated_fallback" } } });
  });
  console.log(JSON.stringify({ applied: true, opportunityId, slug: "boston-university-presidential-scholarship-2026" }));
}

void main().finally(() => prisma.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

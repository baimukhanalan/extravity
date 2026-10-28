import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const opportunityId = "c64e4e15-425a-44ed-9e0b-21610b085347";
const originalPost = "https://t.me/studygrants/7304";
const officialPage = "https://od.globaluni.ru/rules";
const applicationUrl = "https://od.globaluni.ru/";
const coverPath = "/opportunity-covers/open-doors-bachelors-2026.png";
const checksum = "54bf6a988d6b0f80b80eaf9ff65e18cc77798685f44ce71e511bd4f3247c442e";
const deadline = new Date("2026-11-01T18:59:00.000Z");
const rightsEvidenceRef = `Extravity generated illustration; built-in image generation; generated 2026-09-29; sha256:${checksum}`;

async function main() {
  if (process.argv.includes("--apply")) throw new Error("Generated covers are retired; publish only original source media");
  const apply = process.argv.includes("--apply");
  const [opportunity, cover, coverInfo, rulesResponse, applicationResponse] = await Promise.all([
    prisma.opportunity.findUnique({ where: { id: opportunityId }, include: { media: true } }),
    readFile(`public${coverPath}`),
    stat(`public${coverPath}`),
    fetch(officialPage, { signal: AbortSignal.timeout(15_000) }),
    fetch(applicationUrl, { signal: AbortSignal.timeout(15_000) }),
  ]);
  if (!opportunity || opportunity.sourceUrl !== originalPost || opportunity.status !== "PENDING_REVIEW") throw new Error("Unexpected candidate state");
  if (!rulesResponse.ok || !applicationResponse.ok) throw new Error("Official Open Doors page unavailable");
  if (deadline <= new Date()) throw new Error("Conservative deadline has passed");
  if (createHash("sha256").update(cover).digest("hex") !== checksum) throw new Error("Cover checksum changed");
  const rules = await rulesResponse.text();
  if (!rules.includes("November 1, 2026") || !rules.includes("16 and 23") || !rules.includes("No fee is charged")) throw new Error("Official rules changed; reverify before publishing");
  if (!apply) {
    console.log(JSON.stringify({ candidateId: opportunityId, status: opportunity.status, mediaCount: opportunity.media.length, officialPage, applicationUrl, conservativeDeadline: deadline.toISOString(), fee: 0, coverPath, coverBytes: coverInfo.size, apply: false }, null, 2));
    return;
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id: opportunityId },
      data: {
        slug: "open-doors-2026-bachelors-track",
        title: "Open Doors 2026/27 — олимпиада для поступления на бакалавриат",
        shortDescription: "Бесплатная международная олимпиада для поступающих в вузы России. Трек бакалавриата: 16–23 года, регистрация до 1 ноября.",
        fullDescription: "Open Doors — олимпиада ассоциации российских университетов. На трек бакалавриата допускаются иностранные граждане, включая школьников Казахстана, которым на начало регистрации 20 августа 2026 года было 16–23 года и которые уже имеют либо получают в этом учебном году право поступления в вуз. Участие бесплатно. На официальном сайте нужно создать личный кабинет, выбрать трек и предметное направление, заполнить портфолио, мотивационное письмо и загрузить документы. Регистрация открыта до 1 ноября 2026 года; правила требуют загрузить паспорт к этой дате и в другом пункте советуют представить портфолио до закрытия регистрации, поэтому безопасно завершить весь пакет до 1 ноября. Точное время закрытия не указано; каталог использует консервативную границу 23:59 по Алматы. Победители получают право на обучение по государственной квоте с оплатой обучения из бюджета; проживание и дорога не входят в это базовое обещание. Финальный этап проходит с проверкой личности и прокторингом, задания участник выполняет самостоятельно. Иллюстрация создана Extravity, не является материалом организатора.",
        tags: ["олимпиада", "поступление за рубеж", "бакалавриат", "стипендия", "портфолио"],
        organizerName: "Global Universities Association",
        organizerVerified: "VERIFIED",
        sourceType: "official_site",
        sourceUrl: officialPage,
        applicationUrl,
        originalLanguage: "en",
        availableLanguages: ["ru", "en"],
        country: "Russian Federation",
        format: "ONLINE",
        minimumAge: 16,
        maximumAge: 23,
        allowedCitizenships: [],
        requiredLanguages: [],
        participationType: "INDIVIDUAL",
        price: 0,
        currency: "KZT",
        scholarshipAvailable: true,
        applicationDeadline: deadline,
        timezone: "Asia/Almaty",
        requirements: ["Быть иностранным гражданином или лицом без гражданства", "Возраст 16–23 года на 20 августа 2026 года", "Иметь или получить в текущем учебном году образование, дающее право поступить в вуз", "Создать личный кабинет и заполнить собственное портфолио", "Загрузить скан паспорта до 1 ноября 2026 года", "Выполнять задания и проходить проверку личности самостоятельно"],
        prizes: "Победители получают право учиться по квоте в вузе РФ с оплатой обучения из федерального бюджета; дополнительные гранты имеют отдельные условия.",
        applicationMethod: "external",
        directApplySupported: false,
        assistedApplySupported: false,
        prestigeScore: 78,
        difficultyScore: 75,
        competitionScore: 85,
        trustScore: 90,
        confidenceScore: 100,
        verifiedAt: now,
        lastCheckedAt: now,
        status: "REGISTRATION_OPEN",
        moderationStatus: "APPROVED",
      },
    });
    await tx.opportunityMedia.updateMany({ where: { opportunityId, platformMediaId: { not: "extravity-generated:open-doors-bachelors-2026:v1" } }, data: { rightsState: "REJECTED", rightsEvidenceRef: null, position: 10 } });
    await tx.opportunityMedia.upsert({
      where: { opportunityId_platformMediaId: { opportunityId, platformMediaId: "extravity-generated:open-doors-bachelors-2026:v1" } },
      create: { opportunityId, kind: "IMAGE", url: coverPath, storageKey: `public${coverPath}`, mimeType: "image/png", sizeBytes: coverInfo.size, width: 1586, height: 992, position: 0, checksum, platformMediaId: "extravity-generated:open-doors-bachelors-2026:v1", processingState: "READY", rightsState: "LICENSED_FALLBACK", rightsEvidenceRef, altText: "Иллюстрация Extravity: школьница готовит портфолио для зарубежного университета" },
      update: { url: coverPath, sizeBytes: coverInfo.size, position: 0, processingState: "READY", rightsState: "LICENSED_FALLBACK", rightsEvidenceRef },
    });
    await tx.opportunityProvenance.upsert({
      where: { opportunityId },
      create: { opportunityId, sourceUrl: officialPage, sourceAccount: "Global Universities Association", accessScope: "PUBLIC", rightsBasis: "EXTRAVITY_GENERATED_FALLBACK", adminOnlyJson: { discoveryPost: originalPost, officialPage, applicationUrl, deadlineEvidence: "Official rules: registration August 20 to November 1, 2026; exact time not published", eligibilityEvidence: "Official rules §3: foreign citizen, bachelor's track 16–23", feeEvidence: "Official rules §17: no participation fee", prizeEvidence: "Official rules §7: tuition-funded quota for winners", coverPath, rightsEvidenceRef, verifiedAt: now.toISOString() } },
      update: { sourceUrl: officialPage, sourceAccount: "Global Universities Association", accessScope: "PUBLIC", rightsBasis: "EXTRAVITY_GENERATED_FALLBACK", adminOnlyJson: { discoveryPost: originalPost, officialPage, applicationUrl, deadlineEvidence: "Official rules: registration August 20 to November 1, 2026; exact time not published", eligibilityEvidence: "Official rules §3: foreign citizen, bachelor's track 16–23", feeEvidence: "Official rules §17: no participation fee", prizeEvidence: "Official rules §7: tuition-funded quota for winners", coverPath, rightsEvidenceRef, verifiedAt: now.toISOString() } },
    });
    await tx.auditLog.create({ data: { action: "opportunity_officially_verified_and_published", entity: "opportunity", entityId: opportunityId, meta: { officialPage, applicationUrl, deadline: deadline.toISOString(), deadlinePrecision: "date only", cover: "generated_fallback" } } });
  });
  console.log(JSON.stringify({ applied: true, opportunityId, slug: "open-doors-2026-bachelors-track" }));
}

void main().finally(() => prisma.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

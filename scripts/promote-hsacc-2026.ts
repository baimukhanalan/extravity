import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const opportunityId = "45d97747-1f13-4686-9129-e4efa6919319";
const officialPage = "https://highschoolcasecomp.org/";
const applicationUrl = "https://highschoolcasecomp.org/register";
const originalPost = "https://t.me/univerguide/1238";
const coverPath = "/opportunity-covers/hsacc-2026.png";
const localCover = `public${coverPath}`;
const checksum = "2b3459134c73a661a16764dc7880942f0c913df3a72accad8a0e189d69db3af3";
const deadline = new Date("2026-10-18T03:59:00.000Z");
const rightsEvidenceRef = `Extravity generated illustration; built-in image generation; generated 2026-09-29; sha256:${checksum}`;

async function main() {
  if (process.argv.includes("--apply")) throw new Error("Generated covers are retired; publish only original source media");
  const apply = process.argv.includes("--apply");
  const [opportunity, cover, coverInfo, officialResponse, registrationResponse] = await Promise.all([
    prisma.opportunity.findUnique({ where: { id: opportunityId }, include: { media: true, provenance: true } }),
    readFile(localCover),
    stat(localCover),
    fetch(officialPage, { signal: AbortSignal.timeout(15_000) }),
    fetch(applicationUrl, { signal: AbortSignal.timeout(15_000) }),
  ]);
  if (!opportunity || opportunity.sourceUrl !== originalPost || opportunity.status !== "PENDING_REVIEW") throw new Error("Unexpected candidate state");
  if (!officialResponse.ok || !registrationResponse.ok) throw new Error("Official page or registration page unavailable");
  if (deadline <= new Date()) throw new Error("Registration deadline passed");
  if (createHash("sha256").update(cover).digest("hex") !== checksum) throw new Error("Cover checksum changed");
  const officialText = await officialResponse.text();
  if (!officialText.includes("Oct 17, 2026") || !officialText.includes("$10/participant") || !officialText.includes("$15/participant")) throw new Error("Official timeline changed; reverify before publishing");
  if (!apply) {
    console.log(JSON.stringify({ candidateId: opportunityId, status: opportunity.status, mediaCount: opportunity.media.length, officialPage, applicationUrl, deadline: deadline.toISOString(), priceTodayUsd: 10, priceFromOctober1Usd: 15, coverPath, coverBytes: coverInfo.size, apply: false }, null, 2));
    return;
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id: opportunityId },
      data: {
        slug: "harvard-student-agencies-case-competition-2026",
        title: "Harvard Student Agencies Case Competition 2026",
        shortDescription: "Международный онлайн‑конкурс бизнес‑кейсов для школьников. Индивидуальная работа: подготовить стратегию и презентацию для жюри.",
        fullDescription: "Harvard Student Agencies Case Competition открыт для любого ученика, который учится в старшей школе на 31 декабря 2026 года, из любой страны, включая Казахстан. Участие индивидуальное и полностью онлайн. Участник анализирует бизнес‑кейс, готовит стратегию и презентацию; первый тур открывается 18 октября. Регистрация закрывается 17 октября 2026 года в 23:59 по восточному времени США (18 октября, 03:59 UTC). Организатор указывает взнос $10 до конца 30 сентября по восточному времени США и $15 с 1 октября; итоговую стоимость проверьте в форме перед оплатой. Взнос не возвращается. ИИ разрешён для исследования, идей и обратной связи, но анализ, решения и итоговая работа должны быть собственными. Награды включают денежные призы и скидки на программы партнёра; скидка не гарантирует поступление. Иллюстрация создана Extravity и не является фотографией конкурса или материалом организатора.",
        tags: ["бизнес", "кейсы", "предпринимательство", "международный конкурс", "онлайн"],
        organizerName: "Harvard Student Agencies",
        organizerVerified: "VERIFIED",
        sourceType: "official_site",
        sourceUrl: officialPage,
        applicationUrl,
        originalLanguage: "en",
        availableLanguages: ["en"],
        country: "International",
        format: "ONLINE",
        minimumAge: null,
        maximumAge: null,
        allowedCitizenships: [],
        requiredLanguages: ["en"],
        participationType: "INDIVIDUAL",
        price: 10,
        currency: "USD",
        applicationDeadline: deadline,
        timezone: "America/New_York",
        requirements: ["Учиться в старшей школе на 31 декабря 2026 года", "Подать индивидуальную регистрацию и оплатить взнос", "Подготовить собственный анализ и презентацию бизнес‑кейса", "Подать работу первого тура до 31 октября 2026 года"],
        prizes: "Главный приз — $1 500 и скидка $3 190 на программу Ladder Internships; есть другие денежные призы и скидки. Скидки действуют только при поступлении на программу партнёра.",
        applicationMethod: "external",
        directApplySupported: false,
        assistedApplySupported: false,
        prestigeScore: 70,
        difficultyScore: 65,
        competitionScore: 75,
        trustScore: 85,
        confidenceScore: 100,
        verifiedAt: now,
        lastCheckedAt: now,
        status: "REGISTRATION_OPEN",
        moderationStatus: "APPROVED",
      },
    });
    await tx.opportunityMedia.updateMany({ where: { opportunityId, platformMediaId: { not: "extravity-generated:hsacc-2026:v1" } }, data: { rightsState: "REJECTED", rightsEvidenceRef: null, position: 10 } });
    await tx.opportunityMedia.upsert({
      where: { opportunityId_platformMediaId: { opportunityId, platformMediaId: "extravity-generated:hsacc-2026:v1" } },
      create: { opportunityId, kind: "IMAGE", url: coverPath, storageKey: `public${coverPath}`, mimeType: "image/png", sizeBytes: coverInfo.size, width: 1586, height: 992, position: 0, checksum, platformMediaId: "extravity-generated:hsacc-2026:v1", processingState: "READY", rightsState: "LICENSED_FALLBACK", rightsEvidenceRef, altText: "Иллюстрация Extravity: школьник разрабатывает бизнес‑стратегию" },
      update: { url: coverPath, sizeBytes: coverInfo.size, position: 0, processingState: "READY", rightsState: "LICENSED_FALLBACK", rightsEvidenceRef },
    });
    await tx.opportunityProvenance.upsert({
      where: { opportunityId },
      create: { opportunityId, sourceUrl: officialPage, sourceAccount: "Harvard Student Agencies", accessScope: "PUBLIC", rightsBasis: "EXTRAVITY_GENERATED_FALLBACK", adminOnlyJson: { discoveryPost: originalPost, officialPage, applicationUrl, deadlineEvidence: "Official timeline: registration closes Oct 17, 2026 at 11:59 PM ET", feeEvidence: "Official timeline: Sep 1 $10; Oct 1 $15", eligibilityEvidence: "Official FAQ: high school student as of Dec 31, 2026, anywhere in the world", coverPath, rightsEvidenceRef, verifiedAt: now.toISOString() } },
      update: { sourceUrl: officialPage, sourceAccount: "Harvard Student Agencies", accessScope: "PUBLIC", rightsBasis: "EXTRAVITY_GENERATED_FALLBACK", adminOnlyJson: { discoveryPost: originalPost, officialPage, applicationUrl, deadlineEvidence: "Official timeline: registration closes Oct 17, 2026 at 11:59 PM ET", feeEvidence: "Official timeline: Sep 1 $10; Oct 1 $15", eligibilityEvidence: "Official FAQ: high school student as of Dec 31, 2026, anywhere in the world", coverPath, rightsEvidenceRef, verifiedAt: now.toISOString() } },
    });
    await tx.auditLog.create({ data: { action: "opportunity_officially_verified_and_published", entity: "opportunity", entityId: opportunityId, meta: { officialPage, applicationUrl, deadline: deadline.toISOString(), cover: "generated_fallback" } } });
  });
  console.log(JSON.stringify({ applied: true, opportunityId, slug: "harvard-student-agencies-case-competition-2026" }));
}

void main().finally(() => prisma.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

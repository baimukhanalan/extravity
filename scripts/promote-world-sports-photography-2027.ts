import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const opportunityId = "64004a7d-8fe1-4416-8036-9f259652d7a0";
const originalPost = "https://t.me/bluescreenkz/17691";
const officialPage = "https://www.worldsportsphotographyawards.com/footer/faqs";
const rulesUrl = "https://www.worldsportsphotographyawards.com/footer/rules";
const applicationUrl = "https://worldsportsphotographyawards.awardmgt.com/";
const coverPath = "/opportunity-covers/world-sports-photography-awards-2027.png";
const checksum = "07552fd37d4168168b03acc49061a01b3f8fb588b6e014197eba8029615fce76";
const deadline = new Date("2026-11-23T18:59:00.000Z");
const rightsEvidenceRef = `Extravity generated illustration; built-in image generation; generated 2026-09-29; sha256:${checksum}`;

async function main() {
  if (process.argv.includes("--apply")) throw new Error("Generated covers are retired; publish only original source media");
  const apply = process.argv.includes("--apply");
  const [opportunity, cover, coverInfo, faqResponse, rulesResponse, applicationResponse] = await Promise.all([
    prisma.opportunity.findUnique({ where: { id: opportunityId }, include: { media: true } }),
    readFile(`public${coverPath}`),
    stat(`public${coverPath}`),
    fetch(officialPage, { signal: AbortSignal.timeout(15_000) }),
    fetch(rulesUrl, { signal: AbortSignal.timeout(15_000) }),
    fetch(applicationUrl, { signal: AbortSignal.timeout(15_000) }),
  ]);
  if (!opportunity || opportunity.sourceUrl !== originalPost || opportunity.status !== "PENDING_REVIEW") throw new Error("Unexpected candidate state");
  if (!faqResponse.ok || !rulesResponse.ok || !applicationResponse.ok) throw new Error("Official source or entry portal unavailable");
  if (deadline <= new Date()) throw new Error("Conservative deadline has passed");
  if (createHash("sha256").update(cover).digest("hex") !== checksum) throw new Error("Cover checksum changed");
  const [faq, rules] = await Promise.all([faqResponse.text(), rulesResponse.text()]);
  if (!faq.includes("23rd November 2026") || !faq.includes("free to enter") || !rules.includes("open to anyone")) throw new Error("Official terms changed; reverify before publishing");
  if (!apply) {
    console.log(JSON.stringify({ candidateId: opportunityId, status: opportunity.status, mediaCount: opportunity.media.length, officialPage, rulesUrl, applicationUrl, conservativeDeadline: deadline.toISOString(), coverPath, coverBytes: coverInfo.size, apply: false }, null, 2));
    return;
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id: opportunityId },
      data: {
        slug: "world-sports-photography-awards-2027",
        title: "World Sports Photography Awards 2027",
        shortDescription: "Бесплатный международный конкурс спортивной фотографии. До 10 собственных снимков; открыт фотографам из любой страны.",
        fullDescription: "World Sports Photography Awards 2027 принимает спортивные фотографии профессионалов и любителей со всего мира. В правилах указано, что конкурс открыт для всех, кроме причастных к его организации; отдельное возрастное ограничение не опубликовано. Поэтому школьникам следует до регистрации проверить возрастные и родительские требования в форме организатора. Участие бесплатное. Можно подать до 10 собственных фотографий в разных категориях. Организатор называет 23 ноября 2026 года последним днём, но точное время и часовой пояс не опубликованы. Каталог использует консервативную техническую границу 23:59 по Алматы; отправляйте заранее и сверяйте форму. На конкурс принимаются фотографии, сделанные камерой; синтетические изображения и генеративная обработка запрещены. Иллюстрация Extravity на этой карточке не является примером допустимой конкурсной работы или фотографией организатора.",
        tags: ["фотография", "спорт", "творчество", "международный конкурс"],
        organizerName: "World Sports Photography Awards Ltd",
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
        price: 0,
        currency: "GBP",
        applicationDeadline: deadline,
        timezone: "Asia/Almaty",
        requirements: ["Собственные спортивные фотографии, сделанные камерой", "Не более 10 снимков", "Не использовать синтетические или AI‑изображения", "Для несовершеннолетних проверить условия регистрации и согласия родителей на сайте организатора"],
        applicationMethod: "external",
        directApplySupported: false,
        assistedApplySupported: false,
        prestigeScore: 70,
        difficultyScore: 70,
        competitionScore: 80,
        trustScore: 85,
        confidenceScore: 95,
        verifiedAt: now,
        lastCheckedAt: now,
        status: "REGISTRATION_OPEN",
        moderationStatus: "APPROVED",
      },
    });
    await tx.opportunityMedia.updateMany({ where: { opportunityId, platformMediaId: { not: "extravity-generated:world-sports-photography-2027:v1" } }, data: { rightsState: "REJECTED", rightsEvidenceRef: null, position: 10 } });
    await tx.opportunityMedia.upsert({
      where: { opportunityId_platformMediaId: { opportunityId, platformMediaId: "extravity-generated:world-sports-photography-2027:v1" } },
      create: { opportunityId, kind: "IMAGE", url: coverPath, storageKey: `public${coverPath}`, mimeType: "image/png", sizeBytes: coverInfo.size, width: 1586, height: 992, position: 0, checksum, platformMediaId: "extravity-generated:world-sports-photography-2027:v1", processingState: "READY", rightsState: "LICENSED_FALLBACK", rightsEvidenceRef, altText: "Иллюстрация Extravity: фотограф снимает бегунов на стадионе" },
      update: { url: coverPath, sizeBytes: coverInfo.size, position: 0, processingState: "READY", rightsState: "LICENSED_FALLBACK", rightsEvidenceRef },
    });
    await tx.opportunityProvenance.upsert({
      where: { opportunityId },
      create: { opportunityId, sourceUrl: officialPage, sourceAccount: "World Sports Photography Awards", accessScope: "PUBLIC", rightsBasis: "EXTRAVITY_GENERATED_FALLBACK", adminOnlyJson: { discoveryPost: originalPost, officialPage, rulesUrl, applicationUrl, deadlineEvidence: "Official FAQ: 23rd November 2026, no exact time", eligibilityEvidence: "Official rules: open to anyone except organizers; no published age minimum", feeEvidence: "Official FAQ and rules: free entry", coverPath, rightsEvidenceRef, verifiedAt: now.toISOString() } },
      update: { sourceUrl: officialPage, sourceAccount: "World Sports Photography Awards", accessScope: "PUBLIC", rightsBasis: "EXTRAVITY_GENERATED_FALLBACK", adminOnlyJson: { discoveryPost: originalPost, officialPage, rulesUrl, applicationUrl, deadlineEvidence: "Official FAQ: 23rd November 2026, no exact time", eligibilityEvidence: "Official rules: open to anyone except organizers; no published age minimum", feeEvidence: "Official FAQ and rules: free entry", coverPath, rightsEvidenceRef, verifiedAt: now.toISOString() } },
    });
    await tx.auditLog.create({ data: { action: "opportunity_officially_verified_and_published", entity: "opportunity", entityId: opportunityId, meta: { officialPage, applicationUrl, deadline: deadline.toISOString(), deadlinePrecision: "date only", cover: "generated_fallback" } } });
  });
  console.log(JSON.stringify({ applied: true, opportunityId, slug: "world-sports-photography-awards-2027" }));
}

void main().finally(() => prisma.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

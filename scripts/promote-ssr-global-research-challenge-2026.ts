import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const opportunityId = "c03458f9-7663-48cb-b6fd-e022db97082a";
const officialPage = "https://ssruk.org/research-competition/";
const applicationUrl = "https://ssruk.org/competition-entry/";
const originalPost = "https://t.me/univerguide/1232";
const coverPath = "/opportunity-covers/ssr-global-research-challenge-2026.png";
const localCover = `public${coverPath}`;
const deadline = new Date("2026-09-30T22:59:00.000Z");
const rightsEvidenceRef = "Extravity generated illustration; source: built-in image generation; generated 2026-09-29; original file sha256:d92946674b2baba7b36637b7d92a99cb06cadbdae5d080ce88985bc627b4a9e5";

async function main() {
  if (process.argv.includes("--apply")) throw new Error("Generated covers are retired; publish only original source media");
  const apply = process.argv.includes("--apply");
  const [opportunity, category, cover, coverInfo, officialResponse, formResponse] = await Promise.all([
    prisma.opportunity.findUnique({ where: { id: opportunityId }, include: { media: true, provenance: true } }),
    prisma.category.findUnique({ where: { slug: "research" } }),
    readFile(localCover),
    stat(localCover),
    fetch(officialPage, { signal: AbortSignal.timeout(15_000) }),
    fetch(applicationUrl, { signal: AbortSignal.timeout(15_000) }),
  ]);
  if (!opportunity || ![originalPost, officialPage].includes(opportunity.sourceUrl ?? "")) throw new Error("Unexpected candidate or source");
  if (!category) throw new Error("Research category is missing");
  if (!officialResponse.ok || !formResponse.ok) throw new Error("Official competition or application page is unavailable");
  if (deadline <= new Date()) throw new Error("Conservative deadline has passed; reverify the organizer before publishing");
  if (createHash("sha256").update(cover).digest("hex") !== "d92946674b2baba7b36637b7d92a99cb06cadbdae5d080ce88985bc627b4a9e5") {
    throw new Error("Cover checksum changed");
  }
  if (!apply) {
    console.log(JSON.stringify({ candidateId: opportunityId, currentStatus: opportunity.status, mediaCount: opportunity.media.length, officialPage, applicationUrl, deadline: deadline.toISOString(), deadlinePrecision: "date only on organizer page; end of date in UK", coverPath, coverBytes: coverInfo.size, apply: false }, null, 2));
    return;
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id: opportunityId },
      data: {
        slug: "ssr-global-research-challenge-2026",
        title: "SSR Global Research Challenge 2026 — конкурс исследовательских проектов",
        shortDescription: "Бесплатный международный конкурс для школьников 11–18 лет: оригинальный исследовательский проект на английском языке о влиянии ИИ на общество.",
        fullDescription: "Social Sciences Research UK принимает индивидуальные исследовательские предложения по 12 направлениям социальных наук. Участвовать могут школьники из любой страны в возрастных группах 11–13 и 14–18 лет, ещё не начавшие обучение на бакалавриате. Предложение до 2 000 слов должно быть полностью написано самим участником на английском языке; организатор запрещает помощь ИИ при написании. Нужен контакт академического рекомендателя, желательно учителя. На официальной странице указана продлённая дата подачи — 30 сентября 2026 года, без часового пояса и точного времени. Каталог показывает конец указанного дня по времени Великобритании как техническую границу; фактическое закрытие формы может быть раньше, поэтому подайте работу заранее и проверьте форму организатора. Иллюстрация на карточке создана Extravity и не является фотографией конкурса.",
        categoryId: category.id,
        tags: ["исследования", "социальные науки", "ИИ", "международный конкурс", "эссе"],
        organizerName: "Social Sciences Research UK (SSR)",
        organizerVerified: "VERIFIED",
        sourceType: "official_site",
        sourceUrl: officialPage,
        applicationUrl,
        originalLanguage: "en",
        availableLanguages: ["en"],
        country: "International",
        format: "ONLINE",
        minimumAge: 11,
        maximumAge: 18,
        allowedCitizenships: [],
        requiredLanguages: ["en"],
        participationType: "INDIVIDUAL",
        price: 0,
        currency: "GBP",
        applicationDeadline: deadline,
        timezone: "Europe/London",
        requiredDocuments: ["Собственное исследовательское предложение на английском языке (до 2 000 слов)", "Контакт академического рекомендателя"],
        requirements: ["Возраст 11–18 лет и обучение в средней школе", "Участник ещё не начал бакалавриат", "Одна индивидуальная заявка", "Текст написан самим школьником без помощи ИИ", "Использованные источники оформлены в APA или MLA"],
        prizes: "Стипендии SSR до £500, сертификаты и приглашения на церемонию; всем успешно подавшим — цифровой сертификат участия.",
        applicationMethod: "external",
        directApplySupported: false,
        assistedApplySupported: false,
        prestigeScore: 70,
        difficultyScore: 75,
        competitionScore: 75,
        trustScore: 90,
        confidenceScore: 100,
        verifiedAt: now,
        lastCheckedAt: now,
        status: "DEADLINE_SOON",
        moderationStatus: "APPROVED",
      },
    });
    await tx.opportunityMedia.updateMany({ where: { opportunityId, platformMediaId: { not: "extravity-generated:ssr-global-research-challenge-2026:v1" } }, data: { rightsState: "REJECTED", rightsEvidenceRef: null, position: 10 } });
    await tx.opportunityMedia.upsert({
      where: { opportunityId_platformMediaId: { opportunityId, platformMediaId: "extravity-generated:ssr-global-research-challenge-2026:v1" } },
      create: {
        opportunityId,
        kind: "IMAGE",
        url: coverPath,
        storageKey: `public${coverPath}`,
        mimeType: "image/png",
        sizeBytes: coverInfo.size,
        width: 1586,
        height: 992,
        position: 0,
        checksum: "d92946674b2baba7b36637b7d92a99cb06cadbdae5d080ce88985bc627b4a9e5",
        platformMediaId: "extravity-generated:ssr-global-research-challenge-2026:v1",
        processingState: "READY",
        rightsState: "LICENSED_FALLBACK",
        rightsEvidenceRef,
        altText: "Иллюстрация Extravity: школьники обсуждают исследовательский проект о влиянии ИИ на общество",
      },
      update: { url: coverPath, sizeBytes: coverInfo.size, position: 0, processingState: "READY", rightsState: "LICENSED_FALLBACK", rightsEvidenceRef },
    });
    await tx.opportunityProvenance.upsert({
      where: { opportunityId },
      create: { opportunityId, sourceUrl: officialPage, sourceAccount: "Social Sciences Research UK", accessScope: "PUBLIC", rightsBasis: "EXTRAVITY_GENERATED_FALLBACK", adminOnlyJson: { discoveryPost: originalPost, officialPage, applicationUrl, deadlineEvidence: "Official page: Extended Submission Deadline 30 September 2026; exact time not published", coverPath, rightsEvidenceRef, verifiedAt: now.toISOString() } },
      update: { sourceUrl: officialPage, sourceAccount: "Social Sciences Research UK", accessScope: "PUBLIC", rightsBasis: "EXTRAVITY_GENERATED_FALLBACK", adminOnlyJson: { discoveryPost: originalPost, officialPage, applicationUrl, deadlineEvidence: "Official page: Extended Submission Deadline 30 September 2026; exact time not published", coverPath, rightsEvidenceRef, verifiedAt: now.toISOString() } },
    });
    await tx.auditLog.create({ data: { action: "opportunity_officially_verified_and_published", entity: "opportunity", entityId: opportunityId, meta: { officialPage, applicationUrl, deadline: deadline.toISOString(), deadlinePrecision: "date only", cover: "generated_fallback" } } });
  });
  console.log(JSON.stringify({ applied: true, opportunityId, slug: "ssr-global-research-challenge-2026" }));
}

void main().finally(() => prisma.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

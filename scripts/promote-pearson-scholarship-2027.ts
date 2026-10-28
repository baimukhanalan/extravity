import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const opportunityId = "567c71b9-14fd-49d6-aee1-c4820d4b5084";
const sourcePost = "https://t.me/studyqa/15411";
const officialPage = "https://future.utoronto.ca/pearson-scholarships";
const applicationPage = "https://future.utoronto.ca/applications";
const schoolActionDeadline = new Date("2026-10-09T16:59:00.000Z");

async function main() {
  const apply = process.argv.includes("--apply");
  const opportunity = await prisma.opportunity.findUnique({ where: { id: opportunityId }, include: { media: true } });
  if (!opportunity || opportunity.sourceUrl !== sourcePost || opportunity.status !== "PENDING_REVIEW" || opportunity.moderationStatus !== "PENDING") {
    throw new Error("Candidate changed; review again");
  }
  if (schoolActionDeadline <= new Date()) throw new Error("School nomination window has passed");
  if (opportunity.media.length !== 1) throw new Error("Source media set changed");
  const media = opportunity.media[0];
  if (media.processingState !== "READY" || !media.storageKey?.startsWith("opportunity-media/studyqa/15411/") || media.platformMediaId?.startsWith("extravity-generated:")) {
    throw new Error("Original source media not available");
  }
  const [officialResponse, applicationResponse, mediaResponse] = await Promise.all([
    fetch(officialPage, { signal: AbortSignal.timeout(15_000) }),
    fetch(applicationPage, { signal: AbortSignal.timeout(15_000) }),
    fetch(media.url, { method: "HEAD", signal: AbortSignal.timeout(15_000) }),
  ]);
  if (!officialResponse.ok || !applicationResponse.ok || !mediaResponse.ok || !mediaResponse.headers.get("content-type")?.startsWith("image/")) {
    throw new Error("Official terms or source media unavailable");
  }
  const [official, applications] = await Promise.all([officialResponse.text(), applicationResponse.text()]);
  if (!official.includes("October 9, 2026") || !official.includes("October 16, 2026") || !official.includes("November 6, 2026") || !official.includes("nominated by your school") || !applications.includes("$196")) {
    throw new Error("Official scholarship conditions changed; verify again");
  }
  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", id: opportunityId, sourcePost, officialPage, applicationPage, sourceMedia: media.storageKey, schoolActionDeadline: schoolActionDeadline.toISOString(), internationalApplicationFeeCad: 196 }, null, 2));
    return;
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id: opportunityId },
      data: {
        slug: "lester-b-pearson-scholarship-2027-university-of-toronto",
        title: "Lester B. Pearson Scholarship 2027 — University of Toronto",
        shortDescription: "Полная стипендия на 4 года бакалавриата для иностранных выпускников школы. Первый шаг — номинация вашей школой до 9 октября.",
        fullDescription: "University of Toronto принимает школьные номинации на Lester B. Pearson International Student Scholarship для набора 2027 года. Стипендия покрывает обучение, книги, обязательные сборы и проживание в резиденции на четыре года. Подходят иностранные школьники последнего года обучения в 2026/27 учебном году либо выпускники не ранее июня 2026 года, начинающие бакалавриат в сентябре 2027 года. Школа может номинировать только одного ученика: сначала попросите директора или школьного консультанта проверить участие школы и подать номинацию до 9 октября. Новые школы должны успеть зарегистрироваться до полудня EST 9 октября; для осторожности каталог закрывает первый этап в 21:59 по Алматы. Затем ученик подаёт заявку на поступление в U of T до 16 октября и после номинации получает личную ссылку на заявку на стипендию; её документы нужны до 6 ноября. Отдельную школьную номинацию ученик самостоятельно не отправляет. На странице поступления U of T указана невозвратная стоимость International Application CAD 196 для заявителя, который живёт вне Канады и подаёт только в U of T; при подаче также в другие университеты Онтарио действует иной тариф OUAC. Университет запрещает использовать генеративный ИИ для текстов заявки на стипендию. Кнопка ведёт к официальной странице выбора заявки на поступление, не к школьной номинации. Медиа — из исходного Telegram-поста; оно не является официальным изображением университета.",
        tags: ["стипендия", "бакалавриат", "поступление за рубеж", "Канада", "школьная номинация"],
        organizerName: "University of Toronto",
        organizerVerified: "VERIFIED",
        sourceType: "official_site",
        sourceUrl: officialPage,
        applicationUrl: applicationPage,
        originalLanguage: "en",
        availableLanguages: ["en"],
        country: "Canada",
        format: "ONLINE",
        minimumAge: null,
        maximumAge: null,
        minimumGrade: null,
        maximumGrade: null,
        allowedCitizenships: [],
        requiredLanguages: ["en"],
        participationType: "INDIVIDUAL",
        price: 196,
        currency: "CAD",
        financialAidAvailable: true,
        scholarshipAvailable: true,
        applicationDeadline: schoolActionDeadline,
        timezone: "Asia/Almaty",
        requirements: ["Иностранный школьник последнего года обучения в 2026/27 году или выпускник не ранее июня 2026", "Номинация от школы — не более одного ученика в год", "Заявка на поступление в U of T до 16 октября 2026", "Личная заявка на стипендию после номинации — до 6 ноября 2026", "Самостоятельные тексты без генеративного ИИ"],
        selectionProcess: "Школьная номинация, заявление на поступление, персональная заявка на стипендию и конкурсный отбор университета.",
        prizes: "Обучение, книги, обязательные сборы и проживание в университетской резиденции на 4 года.",
        applicationMethod: "school_nomination",
        directApplySupported: false,
        assistedApplySupported: false,
        trustScore: 95,
        confidenceScore: 100,
        verifiedAt: now,
        lastCheckedAt: now,
        status: "REGISTRATION_OPEN",
        moderationStatus: "APPROVED",
      },
    });
    await tx.opportunityMedia.update({ where: { id: media.id }, data: { rightsState: "SOURCE_POST", rightsEvidenceRef: sourcePost, position: 0, altText: "Исходное изображение публикации о Lester B. Pearson Scholarship 2027" } });
    await tx.opportunityProvenance.upsert({
      where: { opportunityId },
      create: { opportunityId, sourceUrl: officialPage, sourceAccount: "University of Toronto", accessScope: "PUBLIC", rightsBasis: "SOURCE_POST_ATTRIBUTED", adminOnlyJson: { discoveryPost: sourcePost, officialPage, applicationPage, nominationDeadline: "2026-10-09", admissionDeadline: "2026-10-16", scholarshipDeadline: "2026-11-06", feeEvidence: applicationPage, mediaSource: sourcePost, verifiedAt: now.toISOString() } },
      update: { sourceUrl: officialPage, sourceAccount: "University of Toronto", accessScope: "PUBLIC", rightsBasis: "SOURCE_POST_ATTRIBUTED", adminOnlyJson: { discoveryPost: sourcePost, officialPage, applicationPage, nominationDeadline: "2026-10-09", admissionDeadline: "2026-10-16", scholarshipDeadline: "2026-11-06", feeEvidence: applicationPage, mediaSource: sourcePost, verifiedAt: now.toISOString() } },
    });
    await tx.auditLog.create({ data: { action: "opportunity_officially_verified_and_published", entity: "opportunity", entityId: opportunityId, meta: { officialPage, sourcePost, sourceMedia: media.storageKey, firstStep: "school_nomination" } } });
  });
  console.log(JSON.stringify({ applied: true, slug: "lester-b-pearson-scholarship-2027-university-of-toronto" }));
}

void main().finally(() => prisma.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

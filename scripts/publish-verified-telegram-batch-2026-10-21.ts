import { Prisma, PrismaClient } from "@prisma/client";
import { publicationGate } from "@/lib/opportunity-publication";
import { isOpportunityPriceKnown } from "@/lib/opportunity-price";

const db = new PrismaClient();
const appOrigin = "https://extracurriculars-kz.vercel.app";

type ArchiveMedia = {
  sourceUrl: string;
  kind: "IMAGE" | "VIDEO";
  url: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  position: number;
  checksum: string;
  platformMediaId: string;
};

const reviewed = [
  {
    id: "37a1bb4d-351e-4dca-a251-c1a25c517e0a",
    mediaId: "083d21a2-c979-4cf7-9506-678dc23dd780",
    sourceUrl: "https://t.me/myextrakz/3370",
    expectedChecksum: "9b17c9de06dce63d2a32be58e3124c018c1474a3ce4cb00ba3ef252ce9d7a621",
    expectedPlatformMediaId: "5337314395584928803",
    officialPage: "https://spaceeducation.info/ru/online-hackaton-mcc/",
    applicationUrl: "https://orbita.education/ru/RU/events/114/590",
    title: "Хакатон-ЦУП 2026 — приложение центра управления полётами",
    shortDescription: "Онлайн-хакатон для школьников 8–11 классов: команда разрабатывает приложение центра управления полётами для учебного спутника «ИнтроСат».",
    fullDescription: "Важно: официальный сайт приглашает школьников 7–11 классов, а исходный Telegram-анонс и изображение указывают 8–11 классы. Extravity показывает более узкий безопасный диапазон 8–11; ученикам 7 класса следует уточнить допуск у организатора. АНО «Центр инженерно-космического и естественно-научного образования» проводит онлайн-хакатон Всероссийской программы «Орбита Будущего» при поддержке Фонда содействия инновациям, Роскосмоса и Минобрнауки России. Участники создают приложение для приёма телеметрии, визуализации данных и управления учебным спутником «ИнтроСат». Команда — 2–5 участников. Для подачи нужно подготовить описание приложения и видео его работы, загрузить материалы в открытую папку и указать ссылку в анкете сервиса «Орбита». Telegram-анонс и живая форма регистрации указывают срок 10 ноября 2026 года; календарная страница организатора показывает 30 ноября как окончание всего мероприятия, поэтому Extravity использует более ранний безопасный срок подачи — 10 ноября. Стоимость участия организатор отдельно не указал — уточните её перед подачей.",
    organizerName: "АНО «Центр инженерно-космического и естественно-научного образования»",
    country: "International",
    format: "ONLINE" as const,
    minimumGrade: 8,
    maximumGrade: 11,
    participationType: "TEAM" as const,
    minimumTeamSize: 2,
    maximumTeamSize: 5,
    price: 0,
    requirements: ["Исходный анонс: участники 8–11 классов; официальный сайт также упоминает 7 класс", "Команда из 2–5 человек"],
    requiredDocuments: ["Описание работы приложения", "Видео с демонстрацией приложения", "Ссылка на папку с открытым доступом"],
    unknownTerms: ["price"],
    priceKnown: false,
    deadlineEvidence: "Telegram announcement and live World-region registration countdown: 10 November 2026; organizer calendar event end: 30 November 2026",
  },
  {
    id: "eb34b076-a276-4b52-9d67-b9ef09a134b0",
    mediaId: "727ae88c-91e1-4acc-a0c3-0e793725a9c2",
    sourceUrl: "https://t.me/myextrakz/3372",
    expectedChecksum: "445be53a281db24a3901d5977e918255db0e94fd26436cf3b8fe6b692f1f20e9",
    expectedPlatformMediaId: "5337314395584928933",
    officialPage: "https://www.awardx.com/competitions/26-international",
    applicationUrl: "https://apply.awardx.com?utm_source=awardx_site&utm_medium=web&utm_campaign=26-international",
    title: "AwardX International 2026 — конкурс школьных стартапов",
    shortDescription: "Бесплатный международный онлайн-конкурс для старшеклассников со всего мира: подайте работающий стартап или проработанную бизнес-идею до 14 ноября.",
    fullDescription: "AwardX International — онлайн-конкурс LaunchX LLC для школьников-предпринимателей из любой страны. Можно подать действующий бизнес или проработанную бизнес-идею индивидуально либо командой; все участники команды должны быть старшеклассниками и зарегистрироваться до дедлайна. Участие бесплатное. Победитель получает 5 000 долларов, полную стипендию на онлайн-программу LaunchX, сертификат и LinkedIn badge; финалисты получают стипендию 3 000 долларов на программу LaunchX, сертификат и badge. Заявка принимается до 14 ноября 2026 года; дополнительное видео для audience vote можно отправить до 26 ноября, финалистов объявят 28 ноября, онлайн Demo Day состоится 12 декабря. Точный час закрытия формы не опубликован, поэтому подайте заявку заранее.",
    organizerName: "LaunchX LLC (AwardX)",
    country: "International",
    format: "ONLINE" as const,
    minimumGrade: null,
    maximumGrade: null,
    participationType: "BOTH" as const,
    minimumTeamSize: 1,
    maximumTeamSize: null,
    price: 0,
    requirements: ["Все участники являются старшеклассниками", "Действующий бизнес или проработанная бизнес-идея"],
    requiredDocuments: [],
    unknownTerms: [],
    priceKnown: true,
    deadlineEvidence: "Official AwardX International page: Submit application by Nov 14",
  },
] as const;

function archivePayload(): ArchiveMedia[] {
  const raw = process.env.VERIFIED_TELEGRAM_ARCHIVE_JSON;
  if (!raw) throw new Error("VERIFIED_TELEGRAM_ARCHIVE_JSON is required for apply");
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error("Archive payload must be an array");
  return value as ArchiveMedia[];
}

async function assertExternalPages() {
  const urls = reviewed.flatMap((item) => [item.officialPage, item.applicationUrl]);
  const responses = await Promise.all(urls.map((url) => fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) })));
  const unavailable = responses.map((response, index) => ({ response, url: urls[index] })).filter(({ response }) => !response.ok);
  if (unavailable.length) throw new Error(`External evidence unavailable: ${unavailable.map(({ url, response }) => `${url} (${response.status})`).join(", ")}`);
}

async function main() {
  const apply = process.argv.includes("--apply");
  await assertExternalPages();
  const mediaPayload = apply ? archivePayload() : [];
  const plan = [];

  for (const item of reviewed) {
    const opportunity = await db.opportunity.findUnique({ where: { id: item.id }, include: { media: true, provenance: true } });
    if (!opportunity || opportunity.status !== "PENDING_REVIEW" || opportunity.moderationStatus !== "PENDING" || opportunity.sourceUrl !== item.sourceUrl) {
      throw new Error(`Candidate changed: ${item.sourceUrl}`);
    }
    if (!opportunity.applicationDeadline || opportunity.applicationDeadline <= new Date()) throw new Error(`Deadline passed: ${item.sourceUrl}`);
    if (opportunity.media.length !== 1) throw new Error(`Media set is ambiguous: ${item.sourceUrl}`);
    const currentMedia = opportunity.media[0];
    if (currentMedia.id !== item.mediaId || currentMedia.checksum !== item.expectedChecksum
      || currentMedia.platformMediaId !== item.expectedPlatformMediaId || currentMedia.rightsState !== "SOURCE_POST"
      || currentMedia.rightsEvidenceRef !== item.sourceUrl) throw new Error(`Source media changed: ${item.sourceUrl}`);
    const duplicate = await db.opportunity.findFirst({
      where: { id: { not: item.id }, status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON"] }, OR: [{ title: item.title }, { applicationUrl: item.applicationUrl }] },
      select: { id: true },
    });
    if (duplicate) throw new Error(`Published duplicate exists: ${item.sourceUrl}`);
    const archived = apply ? mediaPayload.find((media) => media.sourceUrl === item.sourceUrl) : null;
    if (apply && (!archived || archived.checksum !== item.expectedChecksum || archived.platformMediaId !== item.expectedPlatformMediaId
      || archived.url !== `${appOrigin}/api/telegram-media/${item.expectedChecksum}`
      || !/^telegram-archive:v1:-?[1-9][0-9]*:[1-9][0-9]*:[A-Za-z0-9_-]{20,300}$/.test(archived.storageKey))) {
      throw new Error(`Archive proof is invalid: ${item.sourceUrl}`);
    }
    const corrected = {
      title: item.title,
      shortDescription: item.shortDescription,
      fullDescription: item.fullDescription,
      organizerName: item.organizerName,
      organizerVerified: "VERIFIED" as const,
      applicationUrl: item.applicationUrl,
      country: item.country,
      format: item.format,
      minimumGrade: item.minimumGrade,
      maximumGrade: item.maximumGrade,
      participationType: item.participationType,
      minimumTeamSize: item.minimumTeamSize,
      maximumTeamSize: item.maximumTeamSize,
      price: item.price,
      currency: "KZT",
      requirements: [...item.requirements],
      requiredDocuments: [...item.requiredDocuments],
      applicationMethod: "external",
      directApplySupported: false,
      assistedApplySupported: false,
      trustScore: 90,
      confidenceScore: 95,
    };
    const proposedMedia = [{ ...currentMedia, ...(archived ?? {}) }];
    const gate = publicationGate({
      ...opportunity,
      ...corrected,
      media: proposedMedia,
      moderationStatus: "APPROVED",
      allowUnknownPrice: !item.priceKnown,
      audienceStatus: "SCHOOL",
      ingestUnknownTerms: [...item.unknownTerms],
      duplicateReviewRequired: false,
    });
    if (!gate.allowed) throw new Error(`Publication gate ${item.sourceUrl}: ${gate.reasons.join(", ")}`);
    if (isOpportunityPriceKnown({ ...opportunity, ...corrected }) !== item.priceKnown) throw new Error(`Price evidence mismatch: ${item.sourceUrl}`);
    plan.push({ sourceUrl: item.sourceUrl, title: item.title, deadline: opportunity.applicationDeadline.toISOString(), price: item.priceKnown ? "free" : "unknown", mediaChecksum: item.expectedChecksum });
  }

  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", publishable: plan.length, plan }, null, 2));
    return;
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    for (const item of reviewed) {
      const archived = mediaPayload.find((media) => media.sourceUrl === item.sourceUrl)!;
      const corrected = {
        title: item.title,
        shortDescription: item.shortDescription,
        fullDescription: item.fullDescription,
        organizerName: item.organizerName,
        organizerVerified: "VERIFIED" as const,
        applicationUrl: item.applicationUrl,
        country: item.country,
        format: item.format,
        minimumGrade: item.minimumGrade,
        maximumGrade: item.maximumGrade,
        participationType: item.participationType,
        minimumTeamSize: item.minimumTeamSize,
        maximumTeamSize: item.maximumTeamSize,
        price: item.price,
        currency: "KZT",
        requirements: [...item.requirements],
        requiredDocuments: [...item.requiredDocuments],
        applicationMethod: "external",
        directApplySupported: false,
        assistedApplySupported: false,
        trustScore: 90,
        confidenceScore: 95,
        verifiedAt: now,
        lastCheckedAt: now,
        status: "REGISTRATION_OPEN" as const,
        moderationStatus: "APPROVED" as const,
      };
      const changed = await tx.opportunity.updateMany({
        where: { id: item.id, status: "PENDING_REVIEW", moderationStatus: "PENDING", sourceUrl: item.sourceUrl },
        data: corrected,
      });
      if (changed.count !== 1) throw new Error(`Concurrent candidate change: ${item.sourceUrl}`);
      const changedMedia = await tx.opportunityMedia.updateMany({
        where: { id: item.mediaId, opportunityId: item.id, checksum: item.expectedChecksum, platformMediaId: item.expectedPlatformMediaId, rightsEvidenceRef: item.sourceUrl },
        data: { url: archived.url, storageKey: archived.storageKey, processingState: "READY", altText: `Исходное изображение публикации «${item.title}»` },
      });
      if (changedMedia.count !== 1) throw new Error(`Concurrent media change: ${item.sourceUrl}`);
      const currentProvenance = await tx.opportunityProvenance.findUniqueOrThrow({ where: { opportunityId: item.id } });
      const original = currentProvenance.adminOnlyJson && typeof currentProvenance.adminOnlyJson === "object" && !Array.isArray(currentProvenance.adminOnlyJson)
        ? currentProvenance.adminOnlyJson as Record<string, unknown> : {};
      await tx.opportunityProvenance.update({ where: { opportunityId: item.id }, data: {
        sourceAccount: item.organizerName,
        adminOnlyJson: {
          ...original,
          audienceStatus: "SCHOOL",
          ingestUnknownTerms: [...item.unknownTerms],
          officialPage: item.officialPage,
          applicationUrl: item.applicationUrl,
          organizerEvidence: item.officialPage,
          deadlineEvidence: item.deadlineEvidence,
          countryEvidence: item.country === "International" ? `${item.officialPage} and live World-region registration` : item.officialPage,
          priceEvidence: item.priceKnown ? `${item.officialPage}: free` : "Organizer did not publish a participation fee; show price as unknown",
          mediaArchiveBackend: "telegram_archive",
          reviewedAt: now.toISOString(),
        } as Prisma.InputJsonValue,
      } });
      await tx.auditLog.create({ data: {
        action: "opportunity_officially_verified_and_published",
        entity: "opportunity",
        entityId: item.id,
        meta: { sourcePost: item.sourceUrl, officialPage: item.officialPage, applicationUrl: item.applicationUrl, deadlineEvidence: item.deadlineEvidence, mediaChecksum: item.expectedChecksum, mediaBackend: "telegram_archive" },
      } });
    }
  }, { timeout: 60_000 });
  console.log(JSON.stringify({ mode: "applied", published: plan.length, plan }, null, 2));
}

void main().finally(() => db.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

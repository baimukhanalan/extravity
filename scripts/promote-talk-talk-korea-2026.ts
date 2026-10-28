import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const opportunityId = "67a956c2-10b6-4ac0-b8c7-9c4fd1a8bd1a";
const coverPath = "/opportunity-covers/talk-talk-korea-2026.png";
const coverUrl = `https://extracurriculars-kz.vercel.app${coverPath}`;
const officialSite = "https://www.talktalkkorea.or.kr/";
const officialAnnouncement = "https://www.korea.net/Events/Overseas/view?articleId=27161";
const deadline = new Date("2026-09-28T14:59:00.000Z");

async function main() {
  if (process.argv.includes("--apply")) throw new Error("Generated covers are retired; publish only original source media");
  const apply = process.argv.includes("--apply");
  const [opportunity, category, coverResponse] = await Promise.all([
    prisma.opportunity.findUnique({ where: { id: opportunityId }, include: { media: true, provenance: true } }),
    prisma.category.findUnique({ where: { slug: "creative" } }),
    fetch(coverUrl, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(15_000) }),
  ]);

  if (!opportunity) throw new Error("Talk Talk Korea candidate was not found");
  if (!category) throw new Error("Creative category was not found");
  if (!coverResponse.ok || coverResponse.headers.get("content-type") !== "image/png") {
    throw new Error(`Generated cover is unavailable: ${coverResponse.status}`);
  }
  if (deadline <= new Date()) throw new Error("Talk Talk Korea deadline has already passed");
  if (opportunity.status !== "PENDING_REVIEW" && opportunity.status !== "DEADLINE_SOON") {
    throw new Error(`Unexpected current status: ${opportunity.status}`);
  }

  const plan = {
    id: opportunity.id,
    from: {
      title: opportunity.title,
      organizerName: opportunity.organizerName,
      categoryId: opportunity.categoryId,
      deadline: opportunity.applicationDeadline?.toISOString() ?? null,
      sourceType: opportunity.sourceType,
    },
    to: {
      title: "Talk Talk Korea 2026 — POV: My First K-Culture Moment",
      organizerName: "Министерство культуры, спорта и туризма Республики Корея (MCST)",
      category: category.slug,
      deadline: deadline.toISOString(),
        coverUrl: coverPath,
    },
  };
  if (!apply) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id: opportunityId },
      data: {
        slug: "talk-talk-korea-2026-my-first-k-culture-moment",
        title: "Talk Talk Korea 2026 — POV: My First K-Culture Moment",
        shortDescription: "Международный творческий конкурс о первом знакомстве с корейской культурой: видео, фотокнига, рисунок или текст. Участвовать могут иностранные граждане любого возраста.",
        fullDescription: "Talk Talk Korea 2026 приглашает рассказать о своём первом значимом знакомстве с K-culture в одной из четырёх категорий: видео, фотокнига, рисунок и иллюстрация или текст. Для участия нужно создать оригинальную работу без генеративного ИИ, опубликовать её в открытом доступе в личной социальной сети с обязательными хэштегами конкурса, затем заполнить форму выбранной категории на официальном сайте. Несовершеннолетним необходимо предварительное согласие законного представителя. Победителей объявят 5 ноября 2026 года; предусмотрено 124 награды, а победители первых мест получают туристический сертификат для поездки в Корею.",
        categoryId: category.id,
        tags: ["K-culture", "творчество", "видео", "иллюстрация", "фотография", "письмо"],
        organizerName: "Министерство культуры, спорта и туризма Республики Корея (MCST)",
        organizerVerified: "VERIFIED",
        sourceType: "official_site",
        sourceUrl: officialSite,
        applicationUrl: officialSite,
        country: "International",
        format: "ONLINE",
        participationType: "BOTH",
        applicationDeadline: deadline,
        timezone: "Asia/Seoul",
        requirements: [
          "Участник не является гражданином Республики Корея",
          "Для несовершеннолетнего получено согласие законного представителя",
          "Работа создана участником без генеративного ИИ",
          "Работа опубликована в открытом доступе с хэштегами #TalkTalkKorea2026, #TTK2026 и #MyPOV",
        ],
        selectionProcess: "Оценка оригинальности, качества и соответствия теме конкурса; организатор может запросить рабочие материалы, подтверждающие процесс создания.",
        prizes: "124 награды; первое место в каждой категории — туристический сертификат в Корею стоимостью 3 000 000 KRW.",
        applicationMethod: "external",
        directApplySupported: false,
        assistedApplySupported: false,
        prestigeScore: 85,
        difficultyScore: 65,
        competitionScore: 90,
        trustScore: 98,
        confidenceScore: 100,
        verifiedAt: now,
        lastCheckedAt: now,
        status: "DEADLINE_SOON",
        moderationStatus: "APPROVED",
      },
    });
    await tx.opportunityMedia.updateMany({
      where: { opportunityId, platformMediaId: { not: "extravity-generated:talk-talk-korea-2026:v1" } },
      data: { rightsState: "REJECTED", position: 10 },
    });
    await tx.opportunityMedia.upsert({
      where: {
        opportunityId_platformMediaId: {
          opportunityId,
          platformMediaId: "extravity-generated:talk-talk-korea-2026:v1",
        },
      },
      create: {
        opportunityId,
        kind: "IMAGE",
        url: coverPath,
        storageKey: "public/opportunity-covers/talk-talk-korea-2026.png",
        mimeType: "image/png",
        sizeBytes: 2541194,
        width: 1586,
        height: 992,
        position: 0,
        checksum: "61771bb6c38145e1a0c00e98fe845728588b2b7130dbb7a8f957d1b5b3867e0b",
        platformMediaId: "extravity-generated:talk-talk-korea-2026:v1",
        processingState: "READY",
        rightsState: "LICENSED_FALLBACK",
        altText: "Иллюстративная обложка Extravity: подростки создают работы о корейской культуре",
      },
      update: {
        url: coverPath,
        position: 0,
        processingState: "READY",
        rightsState: "LICENSED_FALLBACK",
      },
    });
    await tx.opportunityProvenance.upsert({
      where: { opportunityId },
      create: {
        opportunityId,
        sourceUrl: officialAnnouncement,
        sourceAccount: "Korea.net / Talk Talk Korea",
        accessScope: "PUBLIC",
        rightsBasis: "EXTRAVITY_GENERATED_FALLBACK",
        adminOnlyJson: {
          officialSite,
          officialAnnouncement,
          verifiedAt: now.toISOString(),
          originalDiscoveryUrl: opportunity.sourceUrl,
          generatedCover: {
            mode: "built-in image generation",
            file: "public/opportunity-covers/talk-talk-korea-2026.png",
            officialMedia: false,
          },
        },
      },
      update: {
        sourceUrl: officialAnnouncement,
        sourceAccount: "Korea.net / Talk Talk Korea",
        accessScope: "PUBLIC",
        rightsBasis: "EXTRAVITY_GENERATED_FALLBACK",
        adminOnlyJson: {
          officialSite,
          officialAnnouncement,
          verifiedAt: now.toISOString(),
          originalDiscoveryUrl: opportunity.provenance?.sourceUrl ?? opportunity.sourceUrl,
          generatedCover: {
            mode: "built-in image generation",
            file: "public/opportunity-covers/talk-talk-korea-2026.png",
            officialMedia: false,
          },
        },
      },
    });
    await tx.auditLog.create({
      data: {
        action: "opportunity_officially_verified_and_published",
        entity: "opportunity",
        entityId: opportunityId,
        meta: { officialSite, officialAnnouncement, deadline: deadline.toISOString(), cover: "generated_fallback" },
      },
    });
  });
  console.log(JSON.stringify({ applied: true, ...plan }, null, 2));
}

void main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

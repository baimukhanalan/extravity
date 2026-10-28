import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const opportunityId = "01c256ae-df34-4ca5-81c7-c5b055d1c114";
const mediaId = "b0784d69-76bb-422a-9d03-a5af4e4a833f";
const discoveryPost = "https://t.me/studyqa/15577";
const selectionPage = "https://www.jeffersonscholars.org/scholarships/selection";
const faqPage = "https://www.jeffersonscholars.org/scholarships/walentas-faqs";
const awardPage = "https://www.jeffersonscholars.org/scholarships";
const feePage = "https://uvafinance.virginia.edu/resources/2026-27-tuition-and-fee-rates";
const slug = "jefferson-scholarship-2027-university-of-virginia";
const assetPath = `/source-media/${slug}-1.jpg`;
const localPath = join(process.cwd(), "public", "source-media", `${slug}-1.jpg`);
const firstStepDeadline = new Date("2026-12-01T16:59:00.000Z");

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function checkedImage(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok || response.headers.get("content-type") !== "image/jpeg") throw new Error(`Source image unavailable: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 10_000 || bytes.length > 4_000_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Unexpected source image bytes");
  return bytes;
}

async function download() {
  const response = await fetch(`${discoveryPost}?embed=1&mode=tme`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Discovery post unavailable: ${response.status}`);
  const html = await response.text();
  const photos = [...html.matchAll(/tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/g)].map((match) => match[1]);
  if (photos.length !== 1 || new URL(photos[0]).hostname !== "cdn4.telesco.pe") throw new Error("Unexpected public source media set");
  const bytes = await checkedImage(photos[0]);
  await mkdir(join(process.cwd(), "public", "source-media"), { recursive: true });
  await writeFile(localPath, bytes);
  console.log(JSON.stringify({ mode: "download", assetPath, bytes: bytes.length, sha256: sha256(bytes), discoveryPost }, null, 2));
}

function plainText(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ");
}

async function verifyAndMaybeApply(apply: boolean) {
  if (firstStepDeadline <= new Date()) throw new Error("School nomination deadline has passed");
  const opportunity = await db.opportunity.findUnique({ where: { id: opportunityId }, include: { media: true } });
  if (!opportunity || opportunity.sourceUrl !== discoveryPost || opportunity.status !== "PENDING_REVIEW" || opportunity.moderationStatus !== "PENDING") {
    throw new Error("Candidate changed; review again");
  }
  if (opportunity.media.length !== 1 || opportunity.media[0].id !== mediaId) throw new Error("Media set changed");
  const media = opportunity.media[0];
  if (media.processingState !== "READY" || media.rightsState !== "SOURCE_POST" || media.rightsEvidenceRef !== discoveryPost ||
      !media.storageKey?.startsWith("opportunity-media/studyqa/15577/") || media.platformMediaId?.startsWith("extravity-generated:")) {
    throw new Error("Original source media provenance is unverified");
  }

  const [selectionResponse, faqResponse, awardResponse] = await Promise.all([selectionPage, faqPage, awardPage].map((url) => fetch(url, { signal: AbortSignal.timeout(15_000) })));
  if (![selectionResponse, faqResponse, awardResponse].every((response) => response.ok)) throw new Error("Official terms unavailable");
  const [selection, faq, award] = await Promise.all([selectionResponse, faqResponse, awardResponse].map(async (response) => plainText(await response.text())));
  if (!selection.includes("No one may apply for a Jefferson") || !selection.includes("senior class") ||
      !selection.includes("school counselor") || !faq.includes("December 1, 2026") ||
      !faq.includes("do not have to be U.S. citizens") || !faq.includes("outside the United States") ||
      !faq.includes("eligible to be nominated for the Jefferson Scholarship") || !faq.includes("must gain admission to UVA") ||
      !award.includes("entire cost of attendance for four years")) {
    throw new Error("Official scholarship conditions changed; verify again");
  }

  const local = new Uint8Array(await readFile(localPath));
  const deployed = await checkedImage(`https://extracurriculars-kz.vercel.app${assetPath}`);
  const checksum = sha256(local);
  if (checksum !== sha256(deployed)) throw new Error("Deployed source media differs from local asset");
  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", opportunityId, slug, discoveryPost, selectionPage, faqPage, awardPage, feePage, assetPath, checksum, bytes: local.length, firstStepDeadline: firstStepDeadline.toISOString(), admissionFeeUsd: 75 }, null, 2));
    return;
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    const changed = await tx.opportunity.updateMany({
      where: { id: opportunityId, status: "PENDING_REVIEW", moderationStatus: "PENDING", sourceUrl: discoveryPost },
      data: {
        slug,
        title: "Jefferson Scholarship 2027 — University of Virginia",
        shortDescription: "Полная стипендия на 4 года бакалавриата UVA для выпускников школы. Нужна номинация школы; срок документов школы и ученика — 1 декабря 2026 года.",
        fullDescription: "Jefferson Scholars Foundation отбирает будущих первокурсников University of Virginia по лидерству, академическим достижениям и участию в жизни общества. Стипендия покрывает полную стоимость обучения, проживания, питания, книг и других расходов на четыре года. Подходят школьники выпускного класса; числового возраста фонд не устанавливает. Гражданство США не требуется: иностранные школьники, включая учащихся за пределами США, могут быть номинированы на Jefferson Scholarship. Важно: это не самостоятельная заявка. Сначала ученик обращается к школьному консультанту; школа проверяет своё право номинации и направляет кандидата. Если школа не участвовала ранее, она должна связаться с фондом. Школьный консультант и номинант подают свои материалы до 1 декабря 2026 года; точное время фонд не указал, поэтому каталог использует осторожную границу 21:59 по Алматы. У школы может быть более ранний внутренний срок. Для получения стипендии нужно отдельно подать заявку на поступление и быть принятым в UVA. По тарифам UVA 2026/27 заявка на бакалавриат стоит USD 75; возможно освобождение от сбора по правилам университета. Стоимость школьной номинации фонд не указывает; цена в карточке относится к обязательной отдельной заявке на поступление. Walentas Scholarship имеет отдельные правила и недоступна для номинаций школ за пределами США — эта карточка только про Jefferson Scholarship. Кнопка ведёт к официальному описанию школьной номинации, не к личной форме подачи. Изображение взято из исходной публичной публикации и упоминает также Walentas; это не официальная фотография фонда. Требуются действия школы и собственные материалы ученика.",
        tags: ["стипендия", "бакалавриат", "США", "школьная номинация", "поступление за рубеж"],
        organizerName: "Jefferson Scholars Foundation",
        organizerVerified: "VERIFIED",
        sourceType: "official_site",
        sourceUrl: selectionPage,
        applicationUrl: selectionPage,
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
        price: 75,
        currency: "USD",
        financialAidAvailable: true,
        scholarshipAvailable: true,
        applicationDeadline: firstStepDeadline,
        timezone: "Asia/Almaty",
        requirements: ["Школьник выпускного класса", "Номинация от школы, имеющей право номинировать", "Материалы школы и кандидата до 1 декабря 2026 года", "Отдельное поступление и зачисление в University of Virginia"],
        selectionProcess: "Школьная номинация, документы школы и ученика, региональные интервью и финальный виртуальный этап.",
        prizes: "Полная стоимость обучения и проживания на 4 года в University of Virginia, а также возможности развития от фонда.",
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
    if (changed.count !== 1) throw new Error("Candidate changed during publication");
    await tx.opportunityMedia.update({ where: { id: mediaId }, data: { url: assetPath, storageKey: assetPath.slice(1), checksum, sizeBytes: local.length, rightsState: "SOURCE_POST", rightsEvidenceRef: discoveryPost, position: 0, altText: "Исходное изображение публикации о Jefferson Scholarship 2027" } });
    await tx.opportunityProvenance.upsert({
      where: { opportunityId },
      create: { opportunityId, sourceUrl: selectionPage, sourceAccount: "Jefferson Scholars Foundation", accessScope: "PUBLIC", rightsBasis: "SOURCE_POST_ATTRIBUTED", adminOnlyJson: { discoveryPost, selectionPage, faqPage, awardPage, feePage, mediaSource: discoveryPost, mediaAsset: assetPath, officialDeadline: "2026-12-01", catalogConservativeCutoff: firstStepDeadline.toISOString(), verifiedAt: now.toISOString() } },
      update: { sourceUrl: selectionPage, sourceAccount: "Jefferson Scholars Foundation", accessScope: "PUBLIC", rightsBasis: "SOURCE_POST_ATTRIBUTED", adminOnlyJson: { discoveryPost, selectionPage, faqPage, awardPage, feePage, mediaSource: discoveryPost, mediaAsset: assetPath, officialDeadline: "2026-12-01", catalogConservativeCutoff: firstStepDeadline.toISOString(), verifiedAt: now.toISOString() } },
    });
    await tx.auditLog.create({ data: { action: "opportunity_officially_verified_and_published", entity: "opportunity", entityId: opportunityId, meta: { selectionPage, faqPage, discoveryPost, mediaAsset: assetPath, firstStep: "school_nomination" } } });
  }, { timeout: 60_000 });
  console.log(JSON.stringify({ applied: true, slug, assetPath }));
}

const downloadMode = process.argv.includes("--download");
const applyMode = process.argv.includes("--apply");
if (downloadMode && applyMode) throw new Error("Choose one mode");
void (downloadMode ? download() : verifyAndMaybeApply(applyMode)).finally(() => db.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

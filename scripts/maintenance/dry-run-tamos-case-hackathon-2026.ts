import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const opportunityId = "ccbb98e0-1cc3-4631-a616-bbecd524fcd7";
const sourcePost = "https://t.me/myextrakz/3354";
const organizerPost = "https://www.instagram.com/tamos_case_hackaton/p/DdlZQ74sMzO/";
const rulesUrl = "https://docs.google.com/document/d/11joQGDthVSS1TvZUtnAJGgjY3Sflw7OsrJDk1ae0TYw/edit?usp=sharing";
const applicationUrl = "https://forms.gle/8NSi6ZfspXRCVYPfA";
const mediaPath = "/source-media/tamos-case-hackathon-2026-1.jpg";
const deadline = new Date("2026-10-01T16:59:00.000Z");
const imageChecksum = "5c461d9c43d38d9d96355a681725498661b2ad52f12bccb6eb477a61f62113a3";

async function main() {
  if (process.argv.includes("--apply")) throw new Error("This script is read-only and cannot publish");
  if (deadline <= new Date()) throw new Error("Conservative registration cutoff already passed");

  const bytes = new Uint8Array(await readFile(join(process.cwd(), "public", mediaPath)));
  if (bytes.length < 10_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Original media is not a valid JPEG");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (checksum !== imageChecksum) throw new Error("Original media changed since visual verification");

  const candidate = await prisma.opportunity.findUnique({ where: { id: opportunityId }, include: { media: true } });
  if (!candidate || candidate.status !== "PENDING_REVIEW" || candidate.moderationStatus !== "PENDING" || candidate.sourceUrl !== sourcePost) {
    throw new Error("TAMOS candidate changed; review again before publishing");
  }
  if (candidate.media.length !== 1) throw new Error("TAMOS source media count changed");
  const media = candidate.media[0];
  if (media.kind !== "IMAGE" || media.processingState !== "READY" || media.rightsState !== "SOURCE_POST" || media.rightsEvidenceRef !== sourcePost || !media.storageKey?.includes("myextrakz/3354/")) {
    throw new Error("TAMOS source media provenance changed");
  }

  console.log(JSON.stringify({
    mode: "dry-run-only",
    opportunityId,
    mediaId: media.id,
    originalMediaChecksum: media.checksum,
    proposedCard: {
      slug: "tamos-case-hackathon-2026",
      title: "TAMOS CASE HACKATHON 2026",
      shortDescription: "Школьный бизнес-хакатон для 8–11 классов: команда 3–5 человек, технологическое решение бизнес-кейса и очный финал 4 октября в TAMOS Education.",
      fullDescription: "TAMOS CASE HACKATHON — школьный бизнес-хакатон по цифровым и технологическим решениям, автоматизации и FinTech. Участвуют команды из 3–5 учеников 8–11 классов, всего не более 20 команд. В официальном положении нет прямого ограничения по школе, однако ученикам других школ стоит уточнить допуск у организатора до оплаты. Регистрация открыта по 1 октября 2026 года включительно, точный час организатор не указал: каталог использует осторожную техническую границу 21:59 по Алматы, поэтому подавайте раньше. Взнос — 3 000 ₸ с команды. Для регистрации нужны Google-вход, данные участников и школы, чек оплаты, скриншот репоста в Instagram Stories; реквизиты смотрите только в форме организатора. 3 октября старт очно или через онлайн-трансляцию; очное присутствие в первый день не обязательно. 4 октября финал и защита проходят очно в TAMOS Education. До 10:00 4 октября требуется промежуточная версия решения, до 14:00 — итоговая презентация PDF/PPTX; очный питчинг начинается в 15:15. Призовой фонд 300 000 ₸: 150 000/100 000/50 000 ₸. Сайт или код не обязательны. ИИ разрешён только как помощник для идей, структуры и иллюстраций; сдавать сырой полностью ИИ-сгенерированный контент запрещено, проект должен быть оригинальным. Команда самостоятельно подтверждает правила, оплачивает взнос и отправляет форму. Изображение взято из исходной публичной публикации, не сгенерировано Extravity.",
      applicationDeadline: deadline.toISOString(),
      timezone: "Asia/Almaty",
      deadlineTimeZoneAssumption: "Official rules say 1 October inclusive without an hour; 21:59 Asia/Almaty is a conservative catalog cutoff, not the organizer's stated closing time",
      minimumGrade: 8,
      maximumGrade: 11,
      minimumTeamSize: 3,
      maximumTeamSize: 5,
      price: 3000,
      currency: "KZT",
      participationType: "TEAM",
      format: "HYBRID",
      requiredDocuments: ["Данные команды и школы", "Чек оплаты 3 000 ₸ за команду", "Скриншот репоста в Instagram Stories"],
      applicationUrl,
      applicationMethod: "external",
      directApplySupported: false,
      assistedApplySupported: false,
      mediaPath,
      mediaChecksum: checksum,
      mediaBytes: bytes.length,
      sourcePost,
      organizerPost,
      rulesUrl,
      status: "REGISTRATION_OPEN",
      moderationStatus: "APPROVED",
    },
    databaseWrites: false,
    deployedAssetVerified: false,
  }, null, 2));
}

void main().finally(() => prisma.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

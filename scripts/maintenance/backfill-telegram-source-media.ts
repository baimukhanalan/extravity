import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BATCH_SIZE = 80;

function sourcePostFor(storageKey: string | null, sourceUrl: string | null): string | null {
  if (!storageKey || !sourceUrl) return null;
  const match = /^https:\/\/(?:t\.me|telegram\.me)\/([A-Za-z0-9_]+)\/(\d+)(?:\?.*)?$/.exec(sourceUrl);
  if (!match) return null;
  const [, account, post] = match;
  const expected = [
    `opportunity-media/${account}/${post}/`,
    `opportunity-media/telegram/${account}/${post}/`,
  ];
  return expected.some((prefix) => storageKey.startsWith(prefix)) ? `https://t.me/${account}/${post}` : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const media = await prisma.opportunityMedia.findMany({
    where: { rightsState: "PENDING", processingState: "READY", opportunity: { sourceType: "telegram" } },
    select: { id: true, storageKey: true, opportunity: { select: { sourceUrl: true } } },
    orderBy: { id: "asc" },
  });
  const eligible = media.flatMap((item) => {
    const sourcePost = sourcePostFor(item.storageKey, item.opportunity.sourceUrl);
    return sourcePost ? [{ id: item.id, sourcePost }] : [];
  });
  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", scanned: media.length, eligible: eligible.length, unmatched: media.length - eligible.length }));
    return;
  }

  let changed = 0;
  for (let offset = 0; offset < eligible.length; offset += BATCH_SIZE) {
    const batch = eligible.slice(offset, offset + BATCH_SIZE);
    const updates = await prisma.$transaction(
      batch.map((item) => prisma.opportunityMedia.updateMany({
        where: { id: item.id, rightsState: "PENDING", processingState: "READY", opportunity: { sourceType: "telegram", sourceUrl: item.sourcePost } },
        data: { rightsState: "SOURCE_POST", rightsEvidenceRef: item.sourcePost },
      })),
    );
    changed += updates.reduce((total, update) => total + update.count, 0);
    console.log(JSON.stringify({ batch: Math.floor(offset / BATCH_SIZE) + 1, changed, eligible: eligible.length }));
  }
  console.log(JSON.stringify({ mode: "applied", scanned: media.length, eligible: eligible.length, changed, unmatched: media.length - eligible.length }));
}

void main().finally(() => prisma.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

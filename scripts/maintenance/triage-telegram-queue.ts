import { PrismaClient } from "@prisma/client";
import { contentRisks } from "../../lib/opportunity-moderation";

const prefixes = [
  "Стартап-чайхана стала",
  "Ищешь канал",
  "В Астане состоялся",
  "Spaceborne из Узбекистана вышел",
  "Билеты на AI",
  "Агробанк запустил",
];

const db = new PrismaClient();

async function main() {
  const rows = await db.opportunity.findMany({
    where: { status: "PENDING_REVIEW", moderationStatus: "PENDING", sourceType: "telegram" },
    select: { id: true, title: true, shortDescription: true, fullDescription: true },
  });
  const targets = rows.filter((row) =>
    prefixes.some((prefix) => row.title.startsWith(prefix)) &&
    contentRisks(row).some((risk) => risk !== "confidence_below_review_threshold"),
  );
  const matchedPrefixes = new Set(targets.map((row) => prefixes.find((prefix) => row.title.startsWith(prefix))));
  if (targets.length !== prefixes.length || matchedPrefixes.size !== prefixes.length) {
    throw new Error("Reviewed target set changed; rerun the dry-run before applying");
  }
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ mode: "dry-run", scanned: rows.length, targets: targets.map((row) => row.title) }));
    return;
  }

  await db.$transaction(async (tx) => {
    for (const row of targets) {
      const updated = await tx.opportunity.updateMany({
        where: { id: row.id, status: "PENDING_REVIEW", moderationStatus: "PENDING" },
        data: { status: "SUSPICIOUS" },
      });
      if (updated.count !== 1) throw new Error("Opportunity status changed during triage");
      await tx.auditLog.create({
        data: {
          action: "opportunity_flagged_for_review",
          entity: "opportunity",
          entityId: row.id,
          meta: { reason: "deterministic_content_risk", source: "telegram_queue_audit" },
        },
      });
    }
  }, { timeout: 20_000 });
  console.log(JSON.stringify({ mode: "applied", moved: targets.length }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

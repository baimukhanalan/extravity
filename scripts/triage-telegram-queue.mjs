import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();

try {
  const opportunities = await prisma.opportunity.findMany({
    where: { sourceType: "telegram", status: { in: ["PENDING_REVIEW", "SUSPICIOUS"] }, deletedAt: null },
    select: {
      id: true,
      fullDescription: true,
      organizerName: true,
      status: true,
      provenance: { select: { id: true, adminOnlyJson: true } },
    },
  });
  const cwd = resolve("apps/parser");
  const input = opportunities.map((item) => JSON.stringify({ id: item.id, text: item.fullDescription })).join("\n");
  const result = spawnSync(".venv/bin/python", ["-m", "tgcollect.triage_jsonl"], {
    cwd,
    input: `${input}\n`,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || "Telegram triage failed");
  const decisions = new Map(result.stdout.trim().split("\n").filter(Boolean).map((line) => {
    const decision = JSON.parse(line);
    return [decision.id, decision];
  }));
  if (decisions.size !== opportunities.length) throw new Error("Telegram triage did not return every candidate");

  const counts = { SCHOOL: 0, NON_SCHOOL: 0, UNKNOWN: 0, explicitOrganizer: 0, updated: 0 };
  const updates = [];
  for (const item of opportunities) {
    const decision = decisions.get(item.id);
    counts[decision.audienceStatus]++;
    if (decision.organizerName) counts.explicitOrganizer++;
    if (!apply || !item.provenance) continue;
    if (decision.audienceStatus === "UNKNOWN" && !decision.organizerName) continue;
    const previous = item.provenance.adminOnlyJson;
    const adminOnlyJson = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
    const organizerChanged = Boolean(decision.organizerName && decision.organizerName !== item.organizerName);
    const audienceChanged = adminOnlyJson.audienceStatus !== decision.audienceStatus;
    if (!organizerChanged && !audienceChanged) continue;
    updates.push(() => prisma.$transaction([
      prisma.opportunityProvenance.update({
        where: { id: item.provenance.id },
        data: { adminOnlyJson: {
          ...adminOnlyJson,
          audienceStatus: decision.audienceStatus,
          audienceEvidence: decision.audienceEvidence,
          organizerEvidence: decision.organizerName ? "SOURCE_TEXT" : "SOURCE_CHANNEL_UNVERIFIED",
        } },
      }),
      prisma.opportunity.update({
        where: { id: item.id },
        data: {
          ...(organizerChanged ? { organizerName: decision.organizerName } : {}),
          ...(decision.audienceStatus === "NON_SCHOOL" ? { status: "SUSPICIOUS" } : {}),
        },
      }),
    ]));
  }
  for (let index = 0; index < updates.length; index += 12) {
    await Promise.all(updates.slice(index, index + 12).map((run) => run()));
    counts.updated += Math.min(12, updates.length - index);
  }
  console.log(JSON.stringify({ mode: apply ? "applied" : "dry_run", total: opportunities.length, ...counts }));
} finally {
  await prisma.$disconnect();
}

import { spawnSync } from "node:child_process";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";


const db = new PrismaClient();
const python = "/tmp/extravity-parser-test-20261021/bin/python";
const archiveScript = path.join(process.cwd(), "scripts/archive-pending-telegram-media.py");
const appOrigin = "https://extravity.vercel.app";
const publicWarning = "Условия уточняйте у организатора.";


function provenanceObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}


async function main() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 10 * 864e5);
  const repairPublic = process.argv.includes("--repair-public");
  const limitArg = process.argv.find((value) => value.startsWith("--limit="));
  const sourceArg = process.argv.find((value) => value.startsWith("--source="));
  const limit = limitArg ? Math.max(1, Number.parseInt(limitArg.split("=", 2)[1], 10) || 1) : 25;
  const candidates = await db.opportunity.findMany({
    where: {
      deletedAt: null,
      sourceType: { in: ["telegram", "telegram_forward"] },
      sourceUrl: { startsWith: "https://t.me/" },
      moderationStatus: repairPublic ? "APPROVED" : "PENDING",
    },
    include: { provenance: true, media: { where: { processingState: "READY", rightsState: "SOURCE_POST" }, orderBy: { position: "asc" } } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: sourceArg ? 1 : Math.max(100, limit * 5),
  });
  const eligibleBase = candidates.filter((candidate) => {
    const provenance = provenanceObject(candidate.provenance?.adminOnlyJson ?? null);
    const validStatus = repairPublic
      ? ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON", "SUSPICIOUS", "CLOSED"].includes(candidate.status)
      : ["PENDING_REVIEW", "SUSPICIOUS"].includes(candidate.status);
    return candidate.provenance?.accessScope === "PUBLIC"
      && validStatus
      && (!candidate.applicationDeadline || candidate.applicationDeadline > cutoff)
      && (repairPublic ? provenance.publicListingMode === "parsed_unverified" : true)
      && provenance.mediaArchiveHold !== true
      && candidate.media.length > 0
      && candidate.media.every((media, position) => media.processingState === "READY"
        && media.rightsState === "SOURCE_POST"
        && media.rightsEvidenceRef === candidate.sourceUrl
        && Boolean(media.checksum)
        && Boolean(media.platformMediaId)
        && media.position === position);
  });
  const repairChecks = repairPublic
    ? await Promise.all(eligibleBase.map(async (candidate) => {
        const checks = await Promise.all(candidate.media.map(async (media) => {
          try {
            return (await fetch(media.url, { method: "HEAD", signal: AbortSignal.timeout(20_000) })).ok;
          } catch {
            return false;
          }
        }));
        return checks.every(Boolean);
      }))
    : [];
  const eligible = repairPublic ? eligibleBase.filter((_candidate, index) => !repairChecks[index]) : eligibleBase;
  const selected = (sourceArg ? eligible.filter((candidate) => candidate.sourceUrl === sourceArg.slice("--source=".length)) : eligible).slice(0, limit);
  const alreadyArchivedChecks = await Promise.all(selected.map(async (candidate) => {
    const durable = candidate.media.length > 0 && candidate.media.every((media) =>
      media.url === `${appOrigin}/api/telegram-media/${media.checksum}`
      && /^telegram-archive:v1:-?[1-9][0-9]*:[1-9][0-9]*:[A-Za-z0-9_-]{20,300}$/.test(media.storageKey ?? "")
      && Boolean(media.mimeType)
      && Boolean(media.sizeBytes),
    );
    if (!durable) return false;
    const checks = await Promise.all(candidate.media.map(async (media) => {
      try {
        const response = await fetch(media.url, { method: "HEAD", signal: AbortSignal.timeout(20_000) });
        return response.ok && /^(image|video)\//.test(response.headers.get("content-type") ?? "");
      } catch {
        return false;
      }
    }));
    return checks.every(Boolean);
  }));
  const alreadyArchived = selected.filter((_candidate, index) => alreadyArchivedChecks[index]);
  const needsArchive = selected.filter((_candidate, index) => !alreadyArchivedChecks[index]);
  const manifest = needsArchive.map((candidate) => ({
    id: candidate.id,
    sourceUrl: candidate.sourceUrl,
    media: candidate.media.map((media) => ({
      id: media.id,
      position: media.position,
      checksum: media.checksum,
      platformMediaId: media.platformMediaId,
    })),
  }));
  if (process.argv.includes("--plan")) {
    console.log(JSON.stringify({ repairPublic, futureCandidates: candidates.length, publishableAsUnverified: eligible.length, selected: selected.length, heldWithoutExactMedia: candidates.length - eligible.length }, null, 2));
    return;
  }
  const archived = {
    archived: alreadyArchived.map((candidate) => ({
      id: candidate.id,
      sourceUrl: candidate.sourceUrl,
      media: candidate.media.map((media) => ({
        kind: media.kind,
        url: media.url,
        storageKey: media.storageKey!,
        mimeType: media.mimeType!,
        sizeBytes: media.sizeBytes!,
        position: media.position,
        checksum: media.checksum!,
        platformMediaId: media.platformMediaId!,
      })),
    })),
    failures: [] as Array<{ id?: string; sourceUrl?: string; reason: string }>,
  } as {
    archived: Array<{ id: string; sourceUrl: string; media: Array<{ kind: "IMAGE" | "VIDEO"; url: string; storageKey: string; mimeType: string; sizeBytes: number; position: number; checksum: string; platformMediaId: string }> }>;
    failures: Array<{ id?: string; sourceUrl?: string; reason: string }>;
  };
  if (manifest.length > 0) {
    const child = spawnSync(python, [archiveScript], {
      cwd: process.cwd(),
      env: { ...process.env, APP_URL: appOrigin },
      input: JSON.stringify(manifest),
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30 * 60 * 1000,
    });
    if (child.status !== 0) throw new Error(`Archive process failed: ${child.stderr.slice(-1000)}`);
    const uploaded = JSON.parse(child.stdout) as typeof archived;
    archived.archived.push(...uploaded.archived);
    archived.failures.push(...uploaded.failures);
  }
  let published = 0;
  await db.$transaction(async (tx) => {
    for (const result of archived.archived) {
      const candidate = selected.find((item) => item.id === result.id && item.sourceUrl === result.sourceUrl);
      if (!candidate || result.media.length !== candidate.media.length) continue;
      const valid = result.media.every((media, position) => {
        const expected = candidate.media[position];
        return media.position === position
          && media.checksum === expected.checksum
          && media.platformMediaId === expected.platformMediaId
          && media.url === `${appOrigin}/api/telegram-media/${expected.checksum}`
          && /^telegram-archive:v1:-?[1-9][0-9]*:[1-9][0-9]*:[A-Za-z0-9_-]{20,300}$/.test(media.storageKey);
      });
      if (!valid) continue;
      for (const media of result.media) {
        const expected = candidate.media[media.position];
        const changedMedia = await tx.opportunityMedia.updateMany({
          where: { id: expected.id, opportunityId: candidate.id, checksum: expected.checksum, platformMediaId: expected.platformMediaId, rightsEvidenceRef: candidate.sourceUrl },
          data: { ...media, processingState: "READY", rightsState: "SOURCE_POST", rightsEvidenceRef: candidate.sourceUrl },
        });
        if (changedMedia.count !== 1) throw new Error(`Concurrent media change: ${candidate.sourceUrl}`);
      }
      const changed = await tx.opportunity.updateMany({
        where: repairPublic
          ? { id: candidate.id, moderationStatus: "APPROVED", deletedAt: null }
          : { id: candidate.id, status: { in: ["PENDING_REVIEW", "SUSPICIOUS"] }, moderationStatus: "PENDING", deletedAt: null },
        data: {
          status: candidate.applicationDeadline && candidate.applicationDeadline <= now ? "CLOSED" : "PUBLISHED",
          moderationStatus: "APPROVED",
          verifiedAt: null,
          lastCheckedAt: now,
          directApplySupported: false,
          assistedApplySupported: false,
          shortDescription: candidate.shortDescription.replace(publicWarning, "").trim().slice(0, 500),
          fullDescription: candidate.fullDescription.replace(publicWarning, "").trim().slice(0, 8000),
        },
      });
      if (changed.count !== 1) throw new Error(`Concurrent candidate change: ${candidate.sourceUrl}`);
      const original = provenanceObject(candidate.provenance?.adminOnlyJson ?? null);
      await tx.opportunityProvenance.update({
        where: { opportunityId: candidate.id },
        data: { adminOnlyJson: { ...original, publicListingMode: "parsed_unverified", publicListingAt: now.toISOString(), applicationDisabled: false, publicNotice: publicWarning } as Prisma.InputJsonValue },
      });
      await tx.auditLog.create({
        data: {
          action: repairPublic ? "opportunity_parsed_unverified_media_repaired" : "opportunity_published_as_parsed_unverified",
          entity: "opportunity",
          entityId: candidate.id,
          meta: { sourcePost: candidate.sourceUrl, exactMediaCount: result.media.length, applicationDisabled: false },
        },
      });
      published += 1;
    }
    for (const failure of archived.failures) {
      if (!failure.id || !/(changed|unavailable|invalid|no user has)/i.test(failure.reason)) continue;
      const candidate = selected.find((item) => item.id === failure.id);
      if (!candidate) continue;
      const original = provenanceObject(candidate.provenance?.adminOnlyJson ?? null);
      await tx.opportunityProvenance.update({
        where: { opportunityId: candidate.id },
        data: { adminOnlyJson: {
          ...original,
          mediaArchiveHold: true,
          mediaArchiveHoldAt: now.toISOString(),
          mediaArchiveHoldReason: failure.reason,
        } as Prisma.InputJsonValue },
      });
      await tx.auditLog.create({
        data: {
          action: "opportunity_media_archive_held",
          entity: "opportunity",
          entityId: candidate.id,
          meta: { sourcePost: candidate.sourceUrl, reason: failure.reason },
        },
      });
    }
  }, { maxWait: 60_000, timeout: 120_000 });
  console.log(JSON.stringify({ repairPublic, candidates: candidates.length, eligible: eligible.length, attempted: selected.length, published, failedArchive: archived.failures.length, failures: archived.failures }, null, 2));
}


void main().finally(() => db.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

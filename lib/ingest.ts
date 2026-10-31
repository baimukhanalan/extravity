import "server-only";
import type { Format, ParticipationType } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { slugify } from "./slug";
import { duplicateReviewFromProvenance, likelySamePublishedOpportunity } from "./ingest-duplicate";
import {
  type Candidate,
  type Connector,
  computeTrust,
  missingMaterialTerms,
  sourceAccessScope,
  shouldFlagCandidateSuspicious,
  shouldAutoPublish,
  shouldAutoPublishParsedTelegram,
} from "./ingest-rules";

// Re-export the pure rules so existing importers (route, tests) keep working.
export {
  candidateSchema,
  connectorSchema,
  computeTrust,
  shouldAutoPublish,
  type Candidate,
  type Connector,
} from "./ingest-rules";

/**
 * Shared candidate ingestion.
 *
 * Producers use this: the Python parser (HTML/RSS/sitemap, Telegram over
 * MTProto, Instagram Graph API and approved WhatsApp exports) through
 * `/api/parser/ingest`, and the Telegram bot when a moderator
 * forwards a post. Keeping one implementation means deduplication, trust
 * scoring and the auto-publish rule cannot drift apart between the two paths.
 * The pure decision rules live in `lib/ingest-rules.ts`.
 */

export type IngestResult = {
  jobId: string;
  outcome: "completed" | "partial_failure" | "failed";
  found: number;
  created: number;
  duplicate: number;
  expired: number;
  failed: number;
  quarantined: number;
  autoPublished: number;
  suspicious: number;
  refreshSkipped: number;
};

/**
 * Validates, deduplicates and stores candidates. Trusted primary sources may
 * auto-publish under the strict evidence gate. Public Telegram candidates may
 * also publish as visibly unverified listings when the dedicated production
 * switch is enabled and every media item is an exact Telegram archive object.
 */
export async function ingestCandidates(connector: Connector, items: Candidate[]): Promise<IngestResult> {
  const existing = await prisma.sourceConnector.findFirst({ where: { url: connector.url } });
  const conn = existing
    ? await prisma.sourceConnector.update({
        where: { id: existing.id },
        data: { lastRunAt: new Date(), name: connector.name, type: connector.type },
      })
    : await prisma.sourceConnector.create({
        data: { name: connector.name, type: connector.type, url: connector.url, lastRunAt: new Date() },
      });

  const job = await prisma.parserJob.create({
    data: { connectorId: conn.id, status: "running", startedAt: new Date(), itemsFound: items.length },
  });

  const started = Date.now();
  try {
  // Read the flag once per batch, not per item.
  const autoPublishFlag = await prisma.featureFlag.findUnique({
    where: { key: "auto_publish_trusted" },
    select: { enabled: true },
  });
  const parsedTelegramAutoPublishEnabled = process.env.AUTO_PUBLISH_PARSED_TELEGRAM === "true";
  const approvedSourceOrigins = new Set(
    (process.env.AUTO_PUBLISH_SOURCE_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const publishedForDuplicateReview = connector.type.toLowerCase().startsWith("telegram")
    ? await prisma.opportunity.findMany({
        where: { deletedAt: null, status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON"] } },
        select: { id: true, title: true, organizerName: true, applicationUrl: true, applicationDeadline: true },
      })
    : [];
  let autoPublished = 0;
  let created = 0;
  let duplicate = 0;
  let expired = 0;
  let failed = 0;
  let quarantined = 0;
  let suspicious = 0;
  let refreshSkipped = 0;

  async function recordFailedItem(item: Candidate, error: string): Promise<"failed" | "quarantined"> {
    const failureKey = createHash("sha256")
      .update(`${conn.id}\u0000${item.sourceUrl}\u0000${item.contentHash ?? ""}`)
      .digest("hex");
    const recorded = await prisma.rawSourceItem.upsert({
      where: { failureKey },
      create: {
        connectorId: conn.id,
        url: item.sourceUrl,
        contentHash: item.contentHash,
        failureKey,
        attemptCount: 1,
        lastAttemptAt: new Date(),
        httpStatus: 200,
        extracted: item as object,
        processingState: "failed",
        error,
      },
      update: {
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
        processingState: "quarantined",
        error,
      },
      select: { processingState: true },
    });
    return recorded.processingState === "quarantined" ? "quarantined" : "failed";
  }

  for (const item of items) {
    if (item.refreshExistingPendingOnly) {
      const source = /^https:\/\/(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{5,32})\/[1-9]\d*$/.exec(item.sourceUrl);
      const connectorSource = /^https:\/\/(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{5,32})\/?$/.exec(connector.url);
      const deadline = item.applicationDeadline ? new Date(item.applicationDeadline) : null;
      if (connector.type !== "telegram" || !source || !connectorSource ||
        source[1].toLowerCase() !== connectorSource[1].toLowerCase() ||
        !deadline || deadline <= new Date()) {
        refreshSkipped++;
        continue;
      }
      const refreshed = await prisma.opportunity.updateMany({
        where: {
          sourceUrl: item.sourceUrl,
          sourceType: "telegram",
          status: { in: ["PENDING_REVIEW", "SUSPICIOUS"] },
          moderationStatus: "PENDING",
          deletedAt: null,
          applicationDeadline: null,
        },
        data: { applicationDeadline: deadline, lastCheckedAt: new Date() },
      });
      if (refreshed.count === 0) {
        refreshSkipped++;
        continue;
      }
      duplicate++;
      continue;
    }
    if (sourceAccessScope(item.sourceUrl) === "PRIVATE") {
      const failureState = await recordFailedItem(item, "Private Telegram source is not eligible for public ingest");
      if (failureState === "quarantined") quarantined++;
      else failed++;
      continue;
    }
    const category = await prisma.category.findUnique({ where: { slug: item.categorySlug } });
    const rawBase = {
      connectorId: conn.id,
      url: item.sourceUrl,
      contentHash: item.contentHash,
      httpStatus: 200,
      extracted: item as object,
    };
    const unknownTerms = missingMaterialTerms(item);
    const reviewNote = unknownTerms.length > 0
      ? `Требует проверки перед публикацией: ${unknownTerms.join(", ")}. `
      : "";
    const provenanceAdminOnlyJson = {
      connectorType: connector.type,
      connectorUrl: connector.url,
      ingestUnknownTerms: unknownTerms,
      audienceStatus: item.audienceStatus ?? "UNKNOWN",
      audienceEvidence: item.audienceEvidence ?? null,
      organizerEvidence: item.organizerEvidence ?? null,
      priceEvidenceUrl: item.priceEvidenceUrl ?? null,
      priceEvidenceText: item.priceEvidenceText ?? null,
      sourcePublishedAt: item.sourcePublishedAt ?? null,
      sourceEditedAt: item.sourceEditedAt ?? null,
    };

    if (!category) {
      const failureState = await recordFailedItem(item, `Unknown category: ${item.categorySlug}`);
      if (failureState === "quarantined") quarantined++;
      else failed++;
      continue;
    }

    const sameSource = await prisma.opportunity.findFirst({
      where: { sourceUrl: item.sourceUrl },
      select: { id: true, sourceUrl: true, sourceType: true, status: true, moderationStatus: true, deletedAt: true, provenance: { select: { adminOnlyJson: true } } },
    });
    const dupe = sameSource ?? await prisma.opportunity.findFirst({
      where: {
        title: item.title,
        organizerName: item.organizerName,
        categoryId: category.id,
        applicationDeadline: item.applicationDeadline ? new Date(item.applicationDeadline) : null,
        deletedAt: null,
      },
      select: { id: true, sourceUrl: true, sourceType: true, status: true, moderationStatus: true, deletedAt: true, provenance: { select: { adminOnlyJson: true } } },
    });
    if (dupe) {
      const refreshPendingSource = dupe.sourceUrl === item.sourceUrl &&
        dupe.sourceType === connector.type &&
        !dupe.deletedAt &&
        ["PENDING_REVIEW", "SUSPICIOUS"].includes(dupe.status) &&
        dupe.moderationStatus === "PENDING";
      if (refreshPendingSource) {
        const sourceDeadline = item.applicationDeadline ? new Date(item.applicationDeadline) : null;
        const promoteParsedTelegram = Boolean(
          parsedTelegramAutoPublishEnabled &&
          (!sourceDeadline || sourceDeadline > new Date()) &&
          !duplicateReviewFromProvenance(dupe.provenance?.adminOnlyJson) &&
          shouldAutoPublishParsedTelegram(connector.type, item)
        );
        const refreshedAdminOnlyJson = {
          ...provenanceAdminOnlyJson,
          ...(duplicateReviewFromProvenance(dupe.provenance?.adminOnlyJson)
            ? { potentialDuplicate: duplicateReviewFromProvenance(dupe.provenance?.adminOnlyJson) }
            : {}),
          ...(promoteParsedTelegram
            ? {
                publicListingMode: "parsed_unverified",
                publicListingAt: new Date().toISOString(),
                applicationDisabled: false,
                publicNotice: "Условия уточняйте у организатора.",
              }
            : {}),
        };
        await prisma.opportunity.update({
          where: { id: dupe.id },
          data: {
            lastCheckedAt: new Date(),
            title: item.title,
            shortDescription: `${promoteParsedTelegram ? "" : reviewNote}${item.shortDescription}`.slice(0, 500),
            fullDescription: `${promoteParsedTelegram ? "" : reviewNote}${item.fullDescription ?? item.shortDescription}`.slice(0, 8000),
            categoryId: category.id,
            tags: item.tags,
            organizerName: item.organizerName,
            originalLanguage: item.originalLanguage,
            ...(item.country ? { country: item.country } : {}),
            city: item.city ?? null,
            ...(item.format ? { format: item.format as Format } : {}),
            minimumAge: item.minimumAge ?? null,
            maximumAge: item.maximumAge ?? null,
            minimumGrade: item.minimumGrade ?? null,
            maximumGrade: item.maximumGrade ?? null,
            participationType: (item.participationType ?? "INDIVIDUAL") as ParticipationType,
            ...(item.price !== undefined ? { price: item.price } : {}),
            applicationUrl: item.applicationUrl ?? null,
            applicationDeadline: item.applicationDeadline ? new Date(item.applicationDeadline) : null,
            eventStartDate: item.eventStartDate ? new Date(item.eventStartDate) : null,
            requiredDocuments: item.requiredDocuments,
            requirements: item.requirements,
            prizes: item.prizes ?? null,
            trustScore: computeTrust(connector.type, item),
            confidenceScore: Math.round((item.confidence ?? 0.7) * 100),
            ...(promoteParsedTelegram
              ? { status: "PUBLISHED", moderationStatus: "APPROVED", verifiedAt: null }
              : {}),
            provenance: {
              upsert: {
                create: {
                  sourceUrl: item.sourceUrl,
                  sourceAccount: connector.name,
                  sourcePostId: item.sourceUrl.split("/").pop() || null,
                  accessScope: sourceAccessScope(item.sourceUrl),
                  rightsBasis: "SOURCE_POST_ATTRIBUTED",
                  adminOnlyJson: refreshedAdminOnlyJson,
                },
                update: { adminOnlyJson: refreshedAdminOnlyJson },
              },
            },
          },
        });
        if (item.media.length > 0) {
          await prisma.opportunityMedia.createMany({
            data: item.media.map((media) => ({
              opportunityId: dupe.id,
              kind: media.kind,
              url: media.url,
              posterUrl: media.posterUrl ?? null,
              storageKey: media.storageKey ?? null,
              mimeType: media.mimeType,
              sizeBytes: media.sizeBytes,
              width: media.width ?? null,
              height: media.height ?? null,
              durationMs: media.durationMs ?? null,
              position: media.position,
              checksum: media.checksum,
              platformMediaId: media.platformMediaId,
              processingState: "READY",
              rightsState: "SOURCE_POST",
              rightsEvidenceRef: item.sourceUrl,
            })),
            skipDuplicates: true,
          });
          for (const media of item.media) {
            await prisma.opportunityMedia.updateMany({
              where: {
                opportunityId: dupe.id,
                platformMediaId: media.platformMediaId,
                rightsState: "SOURCE_POST",
              },
              data: {
                kind: media.kind,
                url: media.url,
                posterUrl: media.posterUrl ?? null,
                storageKey: media.storageKey ?? null,
                mimeType: media.mimeType,
                sizeBytes: media.sizeBytes,
                width: media.width ?? null,
                height: media.height ?? null,
                durationMs: media.durationMs ?? null,
                position: media.position,
                checksum: media.checksum,
                processingState: "READY",
                rightsEvidenceRef: item.sourceUrl,
              },
            });
          }
        }
        if (promoteParsedTelegram) {
          autoPublished++;
          await prisma.auditLog.create({
            data: {
              action: "opportunity_published_as_parsed_unverified",
              entity: "opportunity",
              entityId: dupe.id,
              meta: { source: connector.type, refreshedExisting: true },
            },
          });
        }
      } else if (dupe.sourceUrl === item.sourceUrl && !dupe.deletedAt) {
        const sourceDeadline = item.applicationDeadline ? new Date(item.applicationDeadline) : null;
        const closeFromSource = dupe.sourceType === connector.type &&
          dupe.moderationStatus === "APPROVED" &&
          ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON", "SUSPICIOUS"].includes(dupe.status) &&
          sourceDeadline !== null && sourceDeadline <= new Date();
        await prisma.opportunity.update({
          where: { id: dupe.id },
          data: closeFromSource
            ? { lastCheckedAt: new Date(), applicationDeadline: sourceDeadline, status: "CLOSED" }
            : { lastCheckedAt: new Date() },
        });
        if (closeFromSource) {
          await prisma.auditLog.create({
            data: {
              action: "opportunity_closed_by_source_deadline",
              entity: "opportunity",
              entityId: dupe.id,
              meta: { sourceUrl: item.sourceUrl, applicationDeadline: item.applicationDeadline },
            },
          });
        }
      }
      await prisma.rawSourceItem.create({
        data: { ...rawBase, processingState: "duplicate", opportunityId: dupe.id },
      });
      duplicate++;
      continue;
    }

    if (item.applicationDeadline && new Date(item.applicationDeadline) <= new Date()) {
      await prisma.rawSourceItem.create({
        data: { ...rawBase, processingState: "expired", error: "Application deadline passed" },
      });
      expired++;
      continue;
    }

    const potentialDuplicate = publishedForDuplicateReview.find((published) => likelySamePublishedOpportunity({
      title: item.title,
      organizerName: item.organizerName,
      applicationUrl: item.applicationUrl ?? null,
      applicationDeadline: item.applicationDeadline ? new Date(item.applicationDeadline) : null,
    }, published));
    const duplicateReview = potentialDuplicate
      ? { matchedOpportunityId: potentialDuplicate.id, reason: "matching_published_event" }
      : null;

    let slug = slugify(item.title);
    if (await prisma.opportunity.findUnique({ where: { slug } })) {
      slug = `${slug}-${Math.floor(Math.random() * 9000 + 1000)}`;
    }

    const trust = computeTrust(connector.type, item);
    const parsedTelegramAutoPublish = Boolean(
      !duplicateReview &&
      parsedTelegramAutoPublishEnabled &&
      shouldAutoPublishParsedTelegram(connector.type, item)
    );
    const strictAutoPublish = Boolean(
      !duplicateReview &&
      autoPublishFlag?.enabled &&
      shouldAutoPublish(connector.type, item, trust, {
        connectorUrl: conn.url,
        approvedSourceOrigins,
      }),
    );
    const autoPublish = parsedTelegramAutoPublish || strictAutoPublish;
    const flagSuspicious = !autoPublish && (Boolean(duplicateReview) || shouldFlagCandidateSuspicious(item, trust));
    const publicNotice = "Условия уточняйте у организатора.";
    try {
      const opp = await prisma.opportunity.create({
        data: {
          slug,
          title: item.title,
          shortDescription: `${parsedTelegramAutoPublish ? "" : reviewNote}${item.shortDescription}`.slice(0, 500),
          fullDescription: `${parsedTelegramAutoPublish ? "" : reviewNote}${item.fullDescription ?? item.shortDescription}`.slice(0, 8000),
          categoryId: category.id,
          tags: item.tags,
          organizerName: item.organizerName,
          sourceType: connector.type,
          sourceUrl: item.sourceUrl,
          applicationUrl: item.applicationUrl,
          originalLanguage: item.originalLanguage,
          country: item.country ?? "Unspecified",
          city: item.city ?? null,
          format: (item.format ?? "OFFLINE") as Format,
          minimumAge: item.minimumAge ?? null,
          maximumAge: item.maximumAge ?? null,
          minimumGrade: item.minimumGrade ?? null,
          maximumGrade: item.maximumGrade ?? null,
          participationType: (item.participationType ?? "INDIVIDUAL") as ParticipationType,
          price: item.price ?? 0,
          applicationDeadline: item.applicationDeadline ? new Date(item.applicationDeadline) : null,
          eventStartDate: item.eventStartDate ? new Date(item.eventStartDate) : null,
          requiredDocuments: item.requiredDocuments,
          requirements: item.requirements,
          prizes: item.prizes ?? null,
          trustScore: trust,
          confidenceScore: Math.round((item.confidence ?? 0.7) * 100),
          prestigeScore: 50,
          // Below the trust floor it's always flagged; auto-publish only when the
          // flag is on and the candidate clears every bar in shouldAutoPublish.
          status: flagSuspicious ? "SUSPICIOUS" : autoPublish ? "PUBLISHED" : "PENDING_REVIEW",
          moderationStatus: autoPublish ? "APPROVED" : "PENDING",
          verifiedAt: strictAutoPublish ? new Date() : null,
          lastCheckedAt: new Date(),
          provenance: {
            create: {
              sourceUrl: item.sourceUrl,
              sourceAccount: connector.name,
              sourcePostId: item.sourceUrl.split("/").pop() || null,
              accessScope: sourceAccessScope(item.sourceUrl),
              rightsBasis: parsedTelegramAutoPublish
                ? "SOURCE_POST_ATTRIBUTED"
                : autoPublish
                ? item.media.find((media) => media.rightsState && media.rightsBasis && media.rightsEvidenceUrl)?.rightsBasis ?? null
                : "SOURCE_POST_ATTRIBUTED",
              adminOnlyJson: {
                ...provenanceAdminOnlyJson,
                ...(duplicateReview ? { potentialDuplicate: duplicateReview } : {}),
                ...(parsedTelegramAutoPublish
                  ? {
                      publicListingMode: "parsed_unverified",
                      publicListingAt: new Date().toISOString(),
                      applicationDisabled: false,
                      publicNotice,
                    }
                  : autoPublish
                  ? {
                      mediaRightsEvidenceUrl:
                        item.media.find((media) => media.rightsState && media.rightsBasis && media.rightsEvidenceUrl)?.rightsEvidenceUrl ?? null,
                    }
                  : {}),
              },
            },
          },
          media: {
            create: item.media.map((media) => ({
              kind: media.kind,
              url: media.url,
              posterUrl: media.posterUrl ?? null,
              storageKey: media.storageKey ?? null,
              mimeType: media.mimeType,
              sizeBytes: media.sizeBytes,
              width: media.width ?? null,
              height: media.height ?? null,
              durationMs: media.durationMs ?? null,
              position: media.position,
              checksum: media.checksum,
              platformMediaId: media.platformMediaId,
              processingState: "READY",
              rightsState: parsedTelegramAutoPublish ? "SOURCE_POST" : autoPublish ? media.rightsState ?? "PENDING" : "SOURCE_POST",
              rightsEvidenceRef: parsedTelegramAutoPublish ? item.sourceUrl : autoPublish ? media.rightsEvidenceUrl ?? null : item.sourceUrl,
            })),
          },
        },
      });
      await prisma.rawSourceItem.create({
        data: { ...rawBase, processingState: "ingested", opportunityId: opp.id },
      });
      created++;
      if (flagSuspicious) suspicious++;
      if (autoPublish) {
        autoPublished++;
        // Auto-publish is a privileged action; leave an audit trail as "система".
        await prisma.auditLog.create({
          data: {
            action: parsedTelegramAutoPublish ? "opportunity_published_as_parsed_unverified" : "opportunity_auto_published",
            entity: "opportunity",
            entityId: opp.id,
            meta: { source: connector.type, trust, confidence: item.confidence ?? null, parsedTelegramAutoPublish },
          },
        });
      }
    } catch (e) {
      const failureState = await recordFailedItem(item, String(e).slice(0, 300));
      if (failureState === "quarantined") quarantined++;
      else failed++;
    }
  }

  const outcome = failed > 0
    ? created + duplicate + expired + quarantined > 0 ? "partial_failure" : "failed"
    : quarantined > 0 ? "partial_failure" : "completed";
  await prisma.parserJob.update({
    where: { id: job.id },
    data: {
      status: outcome,
      finishedAt: new Date(),
      itemsCreated: created,
      itemsDuplicate: duplicate,
      itemsExpired: expired,
      itemsFailed: failed,
      itemsQuarantined: quarantined,
      durationMs: Date.now() - started,
      error: failed + quarantined > 0
        ? `${failed} items failed${quarantined > 0 ? `, ${quarantined} quarantined` : ""}`
        : null,
    },
  });

  return { jobId: job.id, outcome, found: items.length, created, duplicate, expired, failed, quarantined, autoPublished, suspicious, refreshSkipped };
  } catch (error) {
    await prisma.parserJob.updateMany({
      where: { id: job.id, status: "running" },
      data: {
        status: "failed",
        finishedAt: new Date(),
        durationMs: Date.now() - started,
        error: String(error).slice(0, 500),
      },
    });
    throw error;
  }
}

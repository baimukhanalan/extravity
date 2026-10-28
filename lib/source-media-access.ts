import "server-only";
import { prisma } from "./prisma";
import { isOriginalTelegramPostMedia, publicSourceMediaWhere } from "./source-media-provenance";
import { appMediaOrigin, assetIdForChecksum, isTrustedAppMediaUrl, signedRailwayMediaUrl } from "./parser-source-media";

export async function sourceMediaRedirectTarget(assetId: string, preview = false): Promise<URL | null> {
  if (!/^[a-f0-9]{64}$/.test(assetId)) return null;
  const secret = process.env.PARSER_INGEST_SECRET;
  const app = appMediaOrigin();
  if (!secret || !app) return null;
  const media = await prisma.opportunityMedia.findFirst({
    where: {
      ...(preview ? { processingState: "READY" as const, rightsState: { not: "REJECTED" as const } } : publicSourceMediaWhere),
      storageKey: `railway-volume:${assetId}`,
      opportunity: {
        is: preview
          ? { deletedAt: null, provenance: { is: { accessScope: "PUBLIC" } } }
          : {
              deletedAt: null,
              status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON", "SUSPICIOUS", "CLOSED", "COMPLETED"] },
              moderationStatus: "APPROVED",
              provenance: { is: { accessScope: "PUBLIC" } },
            },
      },
    },
    select: {
      checksum: true,
      url: true,
      storageKey: true,
      platformMediaId: true,
      processingState: true,
      rightsState: true,
      rightsEvidenceRef: true,
      opportunity: { select: { sourceType: true, sourceUrl: true } },
    },
  });
  if (!media || assetIdForChecksum(media.checksum) !== assetId) return null;
  if (!preview && (!["telegram", "telegram_forward"].includes(media.opportunity.sourceType)
    || !isOriginalTelegramPostMedia(media.opportunity.sourceUrl, media))) return null;
  if (!isTrustedAppMediaUrl(media.url, `/api/source-media/${assetId}`)) return null;
  return signedRailwayMediaUrl(assetId);
}

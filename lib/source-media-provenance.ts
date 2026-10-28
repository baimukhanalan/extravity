import type { Prisma } from "@prisma/client";

type MediaProvenance = {
  url?: string | null;
  storageKey?: string | null;
  platformMediaId?: string | null;
  rightsEvidenceRef?: string | null;
};

type SourcePostMedia = MediaProvenance & {
  processingState: string;
  rightsState: string;
};

export function isPublicTelegramPostUrl(value: string | null | undefined): boolean {
  return /^https:\/\/t\.me\/[A-Za-z0-9_]+\/[1-9][0-9]*$/.test(value ?? "");
}

export function isOriginalTelegramPostMedia(sourceUrl: string | null | undefined, media: SourcePostMedia): boolean {
  return isPublicTelegramPostUrl(sourceUrl)
    && media.processingState === "READY"
    && media.rightsState === "SOURCE_POST"
    && media.rightsEvidenceRef === sourceUrl
    && Boolean(media.platformMediaId?.trim())
    && !isKnownExtravityGeneratedMedia(media);
}

const generatedEvidence = ["extravity generated illustration", "extravity-generated", "built-in image generation"];

export function isKnownExtravityGeneratedMedia(media: MediaProvenance): boolean {
  const url = media.url?.toLowerCase() ?? "";
  const storageKey = media.storageKey?.toLowerCase() ?? "";
  const evidence = media.rightsEvidenceRef?.toLowerCase() ?? "";
  return (media.platformMediaId?.toLowerCase().startsWith("extravity-generated:") ?? false)
    || url.startsWith("/opportunity-covers/")
    || url.startsWith("https://extracurriculars-kz.vercel.app/opportunity-covers/")
    || storageKey.startsWith("public/opportunity-covers/")
    || generatedEvidence.some((marker) => evidence.includes(marker));
}

export const publicSourceMediaWhere: Prisma.OpportunityMediaWhereInput = {
  processingState: "READY",
  rightsState: "SOURCE_POST",
  rightsEvidenceRef: { startsWith: "https://t.me/" },
  platformMediaId: { not: null },
  AND: [
    { NOT: { rightsEvidenceRef: "" } },
    { OR: [{ platformMediaId: null }, { NOT: { platformMediaId: { startsWith: "extravity-generated:", mode: "insensitive" } } }] },
    { NOT: { url: { startsWith: "/opportunity-covers/", mode: "insensitive" } } },
    { NOT: { url: { startsWith: "https://extracurriculars-kz.vercel.app/opportunity-covers/", mode: "insensitive" } } },
    { OR: [{ storageKey: null }, { NOT: { storageKey: { startsWith: "public/opportunity-covers/", mode: "insensitive" } } }] },
    ...generatedEvidence.map((marker) => ({ NOT: { rightsEvidenceRef: { contains: marker, mode: "insensitive" as const } } })),
  ],
};

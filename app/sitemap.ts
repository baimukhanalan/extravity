import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { CATEGORIES } from "@/lib/constants";
import { publicOpportunityWhere } from "@/lib/public-opportunity";
import { isOriginalTelegramPostMedia, publicSourceMediaWhere } from "@/lib/source-media-provenance";

const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages = [
    "", "/catalog", "/pricing", "/security", "/for-students",
    "/for-parents", "/for-schools", "/for-organizers", "/faq", "/privacy", "/terms", "/contact",
  ].map((p) => ({ url: `${base}${p}`, lastModified: new Date(), priority: p === "" ? 1 : 0.7 }));

  const categoryPages = CATEGORIES.map((c) => ({
    url: `${base}/catalog?category=${c.slug}`,
    lastModified: new Date(),
    priority: 0.6,
  }));

  let opportunityPages: MetadataRoute.Sitemap = [];
  try {
    const opps = await prisma.opportunity.findMany({
      where: {
        ...publicOpportunityWhere(),
        status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "DEADLINE_SOON"] },
      },
      select: { slug: true, sourceUrl: true, updatedAt: true, media: { where: publicSourceMediaWhere } },
      take: 1000,
    });
    opportunityPages = opps.filter((o) => o.media.some((media) => isOriginalTelegramPostMedia(o.sourceUrl, media))).map((o) => ({
      url: `${base}/opportunities/${o.slug}`,
      lastModified: o.updatedAt,
      priority: 0.8,
    }));
  } catch {
    // DB may be unavailable at build time; static pages still emit.
  }

  return [...staticPages, ...categoryPages, ...opportunityPages];
}

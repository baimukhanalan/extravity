"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { getT } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isFlagEnabled } from "@/lib/flags";
import { slugify } from "@/lib/slug";

/**
 * Public portfolio toggle. Turning it on assigns a stable, unguessable-enough
 * public slug (name + short random suffix) the first time, so the shareable URL
 * doesn't change on later toggles. Gated by the portfolio_public_links flag.
 */

async function uniqueSlug(base: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = `${base}-${randomBytes(3).toString("hex")}`;
    const taken = await prisma.studentProfile.findUnique({ where: { publicSlug: slug }, select: { id: true } });
    if (!taken) return slug;
  }
  return `${base}-${randomBytes(6).toString("hex")}`;
}

export type PortfolioState = { error?: string; enabled?: boolean; slug?: string } | undefined;

export async function togglePublicPortfolio(): Promise<PortfolioState> {
  const user = await requireUser();
  const { t } = await getT();
  if (!(await isFlagEnabled("portfolio_public_links"))) {
    return { error: t.actA.publicLinksDisabled };
  }
  const profile = user.studentProfile;
  if (!profile) return { error: t.actA.studentProfileNotFound };

  const enabling = !profile.publicPortfolio;
  let slug = profile.publicSlug;

  if (enabling && !slug) {
    const base = slugify(`${profile.firstName}-${profile.lastName}`) || "portfolio";
    slug = await uniqueSlug(base);
  }

  await prisma.studentProfile.update({
    where: { userId: user.id },
    data: { publicPortfolio: enabling, publicSlug: slug },
  });

  revalidatePath("/app/portfolio");
  return { enabled: enabling, slug: slug ?? undefined };
}

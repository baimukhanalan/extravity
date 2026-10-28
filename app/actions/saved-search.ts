"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { interpolate } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/**
 * Saved searches turn the catalog from pull to push: a student stores a filter,
 * and the daily cron (lib/alerts.ts) notifies them when a new matching
 * opportunity appears. The stored `filters` mirror CatalogParams.
 */

const filterSchema = z.object({
  q: z.string().max(100).optional(),
  category: z.string().max(50).optional(),
  city: z.string().max(100).optional(),
  format: z.enum(["ONLINE", "OFFLINE", "HYBRID"]).optional(),
  free: z.enum(["1"]).optional(),
});

export type SavedSearchState = { error?: string; success?: boolean } | undefined;

const MAX_PER_USER = 20;

export async function createSavedSearch(name: string, filters: unknown): Promise<SavedSearchState> {
  const user = await requireUser();
  const { t } = await getT();
  const createSchema = z.object({
    name: z.string().min(1, t.actA.searchNameRequired).max(120),
    filters: filterSchema,
  });
  const parsed = createSchema.safeParse({ name: name.trim(), filters });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const count = await prisma.savedSearch.count({ where: { userId: user.id } });
  if (count >= MAX_PER_USER) return { error: interpolate(t.actA.maxSavedSearches, { max: MAX_PER_USER }) };

  await prisma.savedSearch.create({
    data: {
      userId: user.id,
      name: parsed.data.name,
      // Drop undefined keys so the stored JSON stays clean.
      filters: Object.fromEntries(Object.entries(parsed.data.filters).filter(([, v]) => v !== undefined)),
    },
  });
  revalidatePath("/app/saved");
  return { success: true };
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const user = await requireUser();
  await prisma.savedSearch.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/app/saved");
}

export async function toggleSavedSearchAlerts(id: string): Promise<void> {
  const user = await requireUser();
  const s = await prisma.savedSearch.findFirst({ where: { id, userId: user.id } });
  if (!s) return;
  await prisma.savedSearch.update({ where: { id: s.id }, data: { alertsEnabled: !s.alertsEnabled } });
  revalidatePath("/app/saved");
}

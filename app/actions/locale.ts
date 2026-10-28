"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isLocale } from "@/lib/i18n";

/**
 * Language switch available to anonymous visitors too — the cookie drives
 * rendering, and signed-in users additionally get it stored on their account.
 */
export async function switchLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;

  const store = await cookies();
  store.set("eckz_locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });

  const user = await getCurrentUser();
  if (user) {
    await prisma.user.update({ where: { id: user.id }, data: { locale } });
  }

  revalidatePath("/", "layout");
}

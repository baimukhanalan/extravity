"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function reviewNewsAction(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id");
  const decision = formData.get("decision");
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return;
  if (decision !== "PUBLISHED" && decision !== "REJECTED") return;
  await prisma.newsArticle.updateMany({ where: { id, status: "PENDING_REVIEW" }, data: { status: decision } });
  revalidatePath("/admin/news");
  revalidatePath("/news");
  revalidatePath(`/news/${id}`);
}

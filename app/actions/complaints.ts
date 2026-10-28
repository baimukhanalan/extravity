"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { getT } from "@/lib/locale";
import type { Dict } from "@/lib/i18n";

const makeReportSchema = (t: Dict) => z.object({
  targetId: z.string().min(1),
  reason: z.string().min(3, t.actB.reasonRequired),
  details: z.string().max(1000).optional(),
});

export type ReportState = { error?: string; success?: boolean } | undefined;

export async function reportOpportunity(_prev: ReportState, formData: FormData): Promise<ReportState> {
  const { t } = await getT();
  const user = await getCurrentUser();
  const parsed = makeReportSchema(t).safeParse({
    targetId: String(formData.get("targetId") || ""),
    reason: String(formData.get("reason") || "").trim(),
    details: String(formData.get("details") || "").trim() || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.complaint.create({
    data: {
      userId: user?.id ?? null,
      targetType: "opportunity",
      targetId: parsed.data.targetId,
      reason: parsed.data.reason,
      details: parsed.data.details,
    },
  });
  return { success: true };
}

export async function resolveComplaint(id: string, status: "resolved" | "dismissed" | "reviewing") {
  const admin = await requireAdmin();
  await prisma.complaint.update({ where: { id }, data: { status } });
  await prisma.auditLog.create({
    data: { userId: admin.id, action: "complaint_updated", entity: "complaint", entityId: id, meta: { status } },
  });
  revalidatePath("/admin/complaints");
}

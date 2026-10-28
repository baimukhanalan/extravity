"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getT } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { deleteDocumentObject } from "@/lib/storage";

export type DocState = { error?: string; success?: boolean } | undefined;

/** Metadata-only entry. File uploads go through /api/documents/upload. */
export async function addDocument(_prev: DocState, formData: FormData): Promise<DocState> {
  const user = await requireUser();
  const { t } = await getT();
  const docSchema = z.object({
    name: z.string().min(1, t.actA.titleRequired),
    type: z.string().min(1),
  });
  const parsed = docSchema.safeParse({
    name: String(formData.get("name") || "").trim(),
    type: String(formData.get("type") || "cv"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.document.create({
    data: {
      userId: user.id,
      name: parsed.data.name,
      type: parsed.data.type,
      isMock: true,
    },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "document_added", entity: "document" },
  });
  revalidatePath("/app/documents");
  return { success: true };
}

export async function deleteDocument(id: string) {
  const user = await requireUser();
  const doc = await prisma.document.findFirst({ where: { id, userId: user.id } });
  if (!doc) return;

  if (doc.url) {
    try {
      await deleteDocumentObject(doc.url);
    } catch (e) {
      // The row still goes away; an orphaned object is cleaned by lifecycle rules.
      console.error("[documents] object delete failed", e);
    }
  }

  await prisma.document.delete({ where: { id: doc.id } });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "document_deleted", entity: "document", entityId: id },
  });
  revalidatePath("/app/documents");
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getDownloadUrl } from "@/lib/storage";
import { getT } from "@/lib/locale";

/** Redirects to a short-lived signed URL. Ownership is checked on every hit. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { t } = await getT();

  const doc = await prisma.document.findFirst({ where: { id, userId: user.id } });
  if (!doc) return NextResponse.json({ error: t.apiMsg.documentNotFound }, { status: 404 });
  if (!doc.url) return NextResponse.json({ error: t.apiMsg.documentFileMissing }, { status: 404 });

  const signed = await getDownloadUrl(doc.url);
  if (!signed) return NextResponse.json({ error: t.apiMsg.documentStorageUnavailable }, { status: 503 });

  return NextResponse.redirect(signed);
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { uploadDocument, validateUpload, isStorageConfigured } from "@/lib/storage";
import { getT } from "@/lib/locale";
import { interpolate } from "@/lib/i18n";
import { createHash } from "node:crypto";
import { normalizeDocumentType } from "@/lib/document-types";
import { scanDocumentBytes } from "@/lib/document-scan";

export async function POST(request: Request) {
  const user = await requireUser();
  const { t } = await getT();

  const rl = await rateLimit(`upload:${user.id}`, 20, 60 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: interpolate(t.apiMsg.uploadRateLimited, { seconds: Math.ceil(rl.retryAfterMs / 1000) }) },
      { status: 429 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  const type = normalizeDocumentType(String(form.get("type") || "cv"));
  const name = String(form.get("name") || "").trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: t.apiMsg.uploadNoFile }, { status: 400 });
  }
  if (!type) return NextResponse.json({ error: t.apiMsg.uploadInvalidType }, { status: 400 });

  const invalid = validateUpload({ name: file.name, size: file.size, type: file.type });
  if (invalid) return NextResponse.json(invalid, { status: 400 });

  const body = await file.arrayBuffer();
  const scan = scanDocumentBytes(file.type, new Uint8Array(body));
  if (!scan.ok) {
    return NextResponse.json({ error: t.apiMsg.uploadUnsafe, code: scan.code }, { status: 400 });
  }
  let url: string | null = null;
  if (isStorageConfigured()) {
    try {
      url = await uploadDocument(user.id, {
        name: file.name,
        type: file.type,
        buffer: body,
      });
    } catch (e) {
      console.error("[upload] storage failed", e);
      return NextResponse.json({ error: t.apiMsg.uploadFailed }, { status: 502 });
    }
  }

  const checksum = createHash("sha256").update(Buffer.from(body)).digest("hex");
  const doc = await prisma.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        userId: user.id,
        name: name || file.name,
        type,
        mimeType: file.type,
        sizeBytes: file.size,
        url,
        isMock: url === null,
        ...(url ? {
          versions: {
            create: {
              userId: user.id,
              version: 1,
              storageKey: url,
              checksum,
              mimeType: file.type,
              sizeBytes: file.size,
              scanStatus: scan.scanStatus,
              verificationStatus: "VERIFIED",
            },
          },
        } : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "document_uploaded",
        entity: "document",
        entityId: created.id,
        meta: { type, stored: Boolean(url), checksum, scanStatus: scan.scanStatus },
      },
    });
    return created;
  });

  return NextResponse.json({ ok: true, id: doc.id, stored: url !== null, verified: url !== null && scan.scanStatus === "static_clean" });
}

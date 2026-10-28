import { NextResponse } from "next/server";
import { readPrivateDocument, verifyPrivateDownload } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("signature") || "";

  if (!key || !verifyPrivateDownload(key, expires, signature)) {
    return NextResponse.json({ error: "Недействительная или истёкшая ссылка" }, { status: 403 });
  }

  try {
    const result = await readPrivateDocument(key);
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
    }

    return new Response(result.stream, {
      status: 200,
      headers: {
        "Content-Type": result.blob.contentType || "application/octet-stream",
        "Content-Length": String(result.blob.size),
        "Content-Disposition": result.blob.contentDisposition || "attachment",
        "Cache-Control": "private, no-store, max-age=0",
        ETag: result.blob.etag,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[documents] private blob read failed", error);
    return NextResponse.json({ error: "Хранилище временно недоступно" }, { status: 502 });
  }
}

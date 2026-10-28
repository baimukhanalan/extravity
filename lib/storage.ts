import "server-only";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { del as vercelBlobDelete, get as vercelBlobGet, put as vercelBlobPut } from "@vercel/blob";

/**
 * Document storage. Supabase Storage and S3-compatible buckets are both
 * supported through plain HTTP — no SDK dependency. Without credentials the
 * module reports `configured: false` and callers fall back to mock records,
 * so the upload flow works end-to-end and starts persisting the moment keys
 * are added.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

const DANGEROUS_EXTENSIONS = [
  ".exe", ".sh", ".bat", ".cmd", ".com", ".msi", ".js", ".mjs", ".jar",
  ".php", ".py", ".rb", ".ps1", ".vbs", ".scr", ".dll", ".app", ".html", ".htm", ".svg",
];

export type StorageBackend = "supabase" | "s3" | "vercel_blob" | "mock";

export function storageBackend(): StorageBackend {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return "supabase";
  if (process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) return "s3";
  if (process.env.BLOB_READ_WRITE_TOKEN) return "vercel_blob";
  return "mock";
}

export function isStorageConfigured(): boolean {
  return storageBackend() !== "mock";
}

export type ValidationError = { error: string };

/** Rejects anything we would not want sitting in a bucket full of minors' documents. */
export function validateUpload(file: { name: string; size: number; type: string }): ValidationError | null {
  if (file.size <= 0) return { error: "Файл пустой" };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: `Файл больше ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ` };
  }
  const lower = file.name.toLowerCase();
  if (DANGEROUS_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return { error: "Такой тип файла загружать нельзя" };
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return { error: "Поддерживаются PDF, изображения и документы Word" };
  }
  return null;
}

/** Storage path is namespaced by user so one signed URL can never span accounts. */
export function objectPath(userId: string, fileName: string): string {
  // Separators become underscores and dot runs collapse, so nothing in the
  // original name can climb out of the user's prefix.
  const safe = fileName.replace(/[^\w.\-]+/g, "_").replace(/\.{2,}/g, ".").slice(-80);
  const stamp = Date.now().toString(36);
  return `${userId}/${stamp}-${safe}`;
}

function bucket(): string {
  return process.env.STORAGE_BUCKET || "documents";
}

function downloadSecret(): string | null {
  return process.env.DOCUMENT_DOWNLOAD_SECRET
    || process.env.AUTH_SECRET
    || null;
}

function appUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  return vercelUrl ? `https://${vercelUrl.replace(/\/$/, "")}` : null;
}

function signedDownloadPayload(path: string, expiresAt: number): string {
  return `${expiresAt}.${path}`;
}

export function signPrivateDownload(path: string, expiresAt: number): string | null {
  const secret = downloadSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(signedDownloadPayload(path, expiresAt)).digest("hex");
}

export function verifyPrivateDownload(path: string, expiresAt: number, signature: string, now = Date.now()): boolean {
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;
  const expected = signPrivateDownload(path, expiresAt);
  if (!expected || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

/* ---------------- Supabase ---------------- */

async function supabaseUpload(path: string, body: ArrayBuffer, contentType: string): Promise<string> {
  const url = `${process.env.SUPABASE_URL}/storage/v1/object/${bucket()}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    body,
  });
  if (!res.ok) throw new Error(`Supabase upload failed: ${res.status} ${await res.text()}`);
  return path;
}

async function supabaseSignedUrl(path: string, expiresIn: number): Promise<string> {
  const url = `${process.env.SUPABASE_URL}/storage/v1/object/sign/${bucket()}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) throw new Error(`Supabase sign failed: ${res.status}`);
  const json = (await res.json()) as { signedURL?: string };
  if (!json.signedURL) throw new Error("Supabase sign returned no URL");
  return `${process.env.SUPABASE_URL}/storage/v1${json.signedURL}`;
}

async function supabaseDelete(path: string): Promise<void> {
  const url = `${process.env.SUPABASE_URL}/storage/v1/object/${bucket()}/${path}`;
  await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
}

async function vercelBlobUpload(path: string, body: ArrayBuffer, contentType: string): Promise<string> {
  const blob = await vercelBlobPut(path, body, {
    access: "private",
    contentType,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return blob.url;
}

export async function readPrivateDocument(path: string) {
  if (storageBackend() !== "vercel_blob") return null;
  return vercelBlobGet(path, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
    useCache: false,
  });
}

/* ---------------- S3 (SigV4) ---------------- */

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

type S3Config = { endpoint: string; region: string; accessKeyId: string; secretAccessKey: string };

function s3Config(): S3Config {
  return {
    endpoint: (process.env.S3_ENDPOINT || "").replace(/\/$/, ""),
    region: process.env.S3_REGION || "us-east-1",
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  };
}

/** Minimal SigV4 for a single-object PUT — enough for uploads, no SDK needed. */
async function s3Upload(path: string, body: ArrayBuffer, contentType: string): Promise<string> {
  const cfg = s3Config();
  const host = new URL(cfg.endpoint).host;
  const key = `/${bucket()}/${path}`;
  const payloadHash = sha256Hex(Buffer.from(body));
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const canonicalHeaders =
    `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `PUT\n${key}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonicalRequest)}`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, dateStamp), cfg.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  const res = await fetch(`${cfg.endpoint}${key}`, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`S3 upload failed: ${res.status} ${await res.text()}`);
  return path;
}

/** Presigned SigV4 URL (query-string auth) for a single-object method. */
function s3PresignedUrl(method: "GET" | "DELETE", path: string, expiresIn: number): string {
  const cfg = s3Config();
  const host = new URL(cfg.endpoint).host;
  const key = `/${bucket()}/${path}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;

  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${cfg.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": "host",
  });

  const canonicalRequest = `${method}\n${key}\n${params.toString()}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonicalRequest)}`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, dateStamp), cfg.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  params.set("X-Amz-Signature", signature);
  return `${cfg.endpoint}${key}?${params.toString()}`;
}

/** Presigned GET (query-string SigV4). */
function s3SignedUrl(path: string, expiresIn: number): string {
  return s3PresignedUrl("GET", path, expiresIn);
}

/* ---------------- Public API ---------------- */

/** Returns the storage path, or null when no backend is configured. */
export async function uploadDocument(
  userId: string,
  file: { name: string; type: string; buffer: ArrayBuffer },
): Promise<string | null> {
  const backend = storageBackend();
  if (backend === "mock") return null;

  const path = objectPath(userId, file.name);
  if (backend === "supabase") return supabaseUpload(path, file.buffer, file.type);
  if (backend === "vercel_blob") return vercelBlobUpload(path, file.buffer, file.type);
  return s3Upload(path, file.buffer, file.type);
}

/** Short-lived download URL. Callers must have already checked ownership. */
export async function getDownloadUrl(path: string, expiresIn = 300): Promise<string | null> {
  const backend = storageBackend();
  if (backend === "mock") return null;
  if (backend === "supabase") return supabaseSignedUrl(path, expiresIn);
  if (backend === "vercel_blob") {
    const base = appUrl();
    const expiresAt = Math.floor(Date.now() / 1000) + Math.max(30, Math.min(expiresIn, 900));
    const signature = signPrivateDownload(path, expiresAt);
    if (!base || !signature) return null;
    const params = new URLSearchParams({ key: path, expires: String(expiresAt), signature });
    return `${base}/api/documents/private?${params.toString()}`;
  }
  return s3SignedUrl(path, expiresIn);
}

export async function deleteDocumentObject(path: string): Promise<void> {
  const backend = storageBackend();
  if (backend === "mock") return;
  if (backend === "supabase") {
    await supabaseDelete(path);
    return;
  }
  if (backend === "vercel_blob") {
    await vercelBlobDelete(path, { token: process.env.BLOB_READ_WRITE_TOKEN });
    return;
  }
  // S3: issue a presigned DELETE so the actual object is removed (important for
  // account deletion / minors' documents — lifecycle rules are not deletion).
  const res = await fetch(s3PresignedUrl("DELETE", path, 60), { method: "DELETE" });
  // 204 = deleted, 404 = already gone; both are fine.
  if (!res.ok && res.status !== 404) {
    throw new Error(`S3 delete failed: ${res.status}`);
  }
}

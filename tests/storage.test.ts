import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  isStorageConfigured,
  objectPath,
  signPrivateDownload,
  storageBackend,
  validateUpload,
  verifyPrivateDownload,
} from "@/lib/storage";

const STORAGE_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "DOCUMENT_DOWNLOAD_SECRET",
] as const;

describe("validateUpload", () => {
  const pdf = { name: "cv.pdf", size: 1024, type: "application/pdf" };

  it("accepts a normal PDF", () => {
    expect(validateUpload(pdf)).toBeNull();
  });

  it("rejects an empty file", () => {
    expect(validateUpload({ ...pdf, size: 0 })?.error).toBeTruthy();
  });

  it("rejects files above the size limit", () => {
    expect(validateUpload({ ...pdf, size: MAX_UPLOAD_BYTES + 1 })?.error).toBeTruthy();
  });

  it("rejects executable and script extensions even with an allowed MIME type", () => {
    for (const name of ["payload.exe", "run.sh", "x.php", "evil.svg", "page.html"]) {
      expect(validateUpload({ name, size: 100, type: "application/pdf" })?.error).toBeTruthy();
    }
  });

  it("rejects disallowed MIME types", () => {
    expect(validateUpload({ name: "archive.zip", size: 100, type: "application/zip" })?.error).toBeTruthy();
  });
});

describe("objectPath", () => {
  it("namespaces the object by user", () => {
    expect(objectPath("user-1", "cv.pdf").startsWith("user-1/")).toBe(true);
  });

  it("strips characters that could escape the prefix", () => {
    const path = objectPath("user-1", "../../etc/passwd");
    expect(path.startsWith("user-1/")).toBe(true);
    expect(path).not.toContain("..");
    expect(path.split("/")).toHaveLength(2);
  });
});

describe("storageBackend", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of STORAGE_ENV) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of STORAGE_ENV) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("reports mock when nothing is configured", () => {
    expect(storageBackend()).toBe("mock");
    expect(isStorageConfigured()).toBe(false);
  });

  it("prefers Supabase when its credentials exist", () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    expect(storageBackend()).toBe("supabase");
    expect(isStorageConfigured()).toBe(true);
  });

  it("falls back to S3 when only S3 credentials exist", () => {
    process.env.S3_ENDPOINT = "https://s3.example.com";
    process.env.S3_ACCESS_KEY_ID = "id";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    expect(storageBackend()).toBe("s3");
  });

  it("uses private Vercel Blob when its token exists", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    expect(storageBackend()).toBe("vercel_blob");
    expect(isStorageConfigured()).toBe(true);
  });

  it("prefers S3 over Vercel Blob when both are configured", () => {
    process.env.S3_ENDPOINT = "https://s3.example.com";
    process.env.S3_ACCESS_KEY_ID = "id";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    expect(storageBackend()).toBe("s3");
  });

  it("stays mock with partial credentials", () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    expect(storageBackend()).toBe("mock");
  });
});

describe("private document links", () => {
  const saved = process.env.DOCUMENT_DOWNLOAD_SECRET;

  beforeEach(() => {
    process.env.DOCUMENT_DOWNLOAD_SECRET = "test-download-secret";
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.DOCUMENT_DOWNLOAD_SECRET;
    else process.env.DOCUMENT_DOWNLOAD_SECRET = saved;
  });

  it("accepts an unexpired signature for the exact object only", () => {
    const now = 1_800_000_000_000;
    const expiresAt = Math.floor(now / 1000) + 300;
    const signature = signPrivateDownload("user/file.pdf", expiresAt)!;

    expect(verifyPrivateDownload("user/file.pdf", expiresAt, signature, now)).toBe(true);
    expect(verifyPrivateDownload("user/other.pdf", expiresAt, signature, now)).toBe(false);
  });

  it("rejects expired and malformed signatures", () => {
    const now = 1_800_000_000_000;
    const expiresAt = Math.floor(now / 1000) - 1;
    const signature = signPrivateDownload("user/file.pdf", expiresAt)!;

    expect(verifyPrivateDownload("user/file.pdf", expiresAt, signature, now)).toBe(false);
    expect(verifyPrivateDownload("user/file.pdf", expiresAt + 600, "bad", now)).toBe(false);
  });
});

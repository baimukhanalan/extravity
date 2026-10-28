import { inflateRawSync } from "node:zlib";

export const STATIC_CLEAN_SCAN_STATUS = "static_clean";

type ScanFailureCode =
  | "SIGNATURE_MISMATCH"
  | "MALWARE_TEST_SIGNATURE"
  | "ACTIVE_PDF_CONTENT"
  | "LEGACY_WORD_UNSUPPORTED"
  | "INVALID_DOCX"
  | "ENCRYPTED_DOCX"
  | "DOCX_EXPANSION_LIMIT"
  | "ACTIVE_DOCX_CONTENT";

export type DocumentScanResult =
  | { ok: true; scanStatus: typeof STATIC_CLEAN_SCAN_STATUS }
  | { ok: false; code: ScanFailureCode };

type ZipEntry = {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

const MAX_DOCX_EXPANDED_BYTES = 30 * 1024 * 1024;
const MAX_DOCX_RATIO = 100;

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("latin1");
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const lowerBound = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= lowerBound; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function zipEntries(bytes: Uint8Array): ZipEntry[] | null {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 22) return null;
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) return null;
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (entryCount > 2_000 || centralOffset + centralSize > buffer.length) return null;

  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  let expandedTotal = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) return null;
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > buffer.length || (method !== 0 && method !== 8)) return null;
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) return null;
    expandedTotal += uncompressedSize;
    if (
      expandedTotal > MAX_DOCX_EXPANDED_BYTES
      || (compressedSize === 0 ? uncompressedSize > 0 : uncompressedSize / compressedSize > MAX_DOCX_RATIO)
    ) return null;
    entries.push({ name, flags, method, compressedSize, uncompressedSize, localOffset });
    offset = end;
  }
  return entries;
}

function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Buffer | null {
  const buffer = Buffer.from(bytes);
  const offset = entry.localOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) return null;
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > buffer.length) return null;
  const payload = buffer.subarray(start, end);
  if (entry.method === 0) return payload;
  try {
    return inflateRawSync(payload, { maxOutputLength: Math.min(entry.uncompressedSize + 1, MAX_DOCX_EXPANDED_BYTES) });
  } catch {
    return null;
  }
}

function scanDocx(bytes: Uint8Array): DocumentScanResult {
  const entries = zipEntries(bytes);
  if (!entries) return { ok: false, code: "INVALID_DOCX" };
  if (entries.some((entry) => (entry.flags & 0x1) !== 0)) return { ok: false, code: "ENCRYPTED_DOCX" };
  const names = new Set(entries.map((entry) => entry.name.toLowerCase()));
  if (!names.has("[content_types].xml") || !names.has("word/document.xml")) {
    return { ok: false, code: "INVALID_DOCX" };
  }
  const dangerousName = entries.some((entry) => /(^|\/)(vbaproject\.bin|activex\/|embeddings\/|customui\/)/i.test(entry.name));
  if (dangerousName) return { ok: false, code: "ACTIVE_DOCX_CONTENT" };

  for (const entry of entries) {
    if (!entry.name.toLowerCase().endsWith(".rels") && entry.name.toLowerCase() !== "[content_types].xml") continue;
    const content = readZipEntry(bytes, entry);
    if (!content) return { ok: false, code: "INVALID_DOCX" };
    const text = content.toString("utf8");
    if (/macroEnabled|vbaProject|oleObject|activeX/i.test(text)) {
      return { ok: false, code: "ACTIVE_DOCX_CONTENT" };
    }
  }
  return { ok: true, scanStatus: STATIC_CLEAN_SCAN_STATUS };
}

export function scanDocumentBytes(mimeType: string, bytes: Uint8Array): DocumentScanResult {
  const raw = ascii(bytes);
  if (raw.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) {
    return { ok: false, code: "MALWARE_TEST_SIGNATURE" };
  }

  if (mimeType === "application/pdf") {
    if (!startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { ok: false, code: "SIGNATURE_MISMATCH" };
    if (/\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA|OpenAction)\b/i.test(raw)) {
      return { ok: false, code: "ACTIVE_PDF_CONTENT" };
    }
    return { ok: true, scanStatus: STATIC_CLEAN_SCAN_STATUS };
  }
  if (mimeType === "image/jpeg") {
    return startsWith(bytes, [0xff, 0xd8, 0xff]) ? { ok: true, scanStatus: STATIC_CLEAN_SCAN_STATUS } : { ok: false, code: "SIGNATURE_MISMATCH" };
  }
  if (mimeType === "image/png") {
    return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? { ok: true, scanStatus: STATIC_CLEAN_SCAN_STATUS } : { ok: false, code: "SIGNATURE_MISMATCH" };
  }
  if (mimeType === "image/webp") {
    const valid = raw.startsWith("RIFF") && raw.slice(8, 12) === "WEBP";
    return valid ? { ok: true, scanStatus: STATIC_CLEAN_SCAN_STATUS } : { ok: false, code: "SIGNATURE_MISMATCH" };
  }
  if (mimeType === "image/heic") {
    const brand = raw.slice(8, 12);
    const valid = raw.slice(4, 8) === "ftyp" && ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand);
    return valid ? { ok: true, scanStatus: STATIC_CLEAN_SCAN_STATUS } : { ok: false, code: "SIGNATURE_MISMATCH" };
  }
  if (mimeType === "application/msword") return { ok: false, code: "LEGACY_WORD_UNSUPPORTED" };
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    if (!startsWith(bytes, [0x50, 0x4b])) return { ok: false, code: "SIGNATURE_MISMATCH" };
    return scanDocx(bytes);
  }
  return { ok: false, code: "SIGNATURE_MISMATCH" };
}

export function acceptableDocumentScanStatus(status: string): boolean {
  return [STATIC_CLEAN_SCAN_STATUS, "clean", "passed", "verified"].includes(status.toLowerCase());
}

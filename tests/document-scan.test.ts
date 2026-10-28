import { describe, expect, it } from "vitest";
import { acceptableDocumentScanStatus, scanDocumentBytes } from "@/lib/document-scan";

function storedZip(entries: Array<[string, string]>): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const [name, content] of entries) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(content);
    const local = Buffer.alloc(30 + nameBytes.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    data.copy(local, 30 + nameBytes.length);
    localParts.push(local);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(localOffset, 42);
    nameBytes.copy(central, 46);
    centralParts.push(central);
    localOffset += local.length;
  }
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, central, eocd]);
}

describe("document static safety scan", () => {
  it("accepts passive PDF and canonical image signatures", () => {
    expect(scanDocumentBytes("application/pdf", Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj"))).toEqual({ ok: true, scanStatus: "static_clean" });
    expect(scanDocumentBytes("image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({ ok: true, scanStatus: "static_clean" });
  });

  it("rejects MIME spoofing, active PDF actions, and the EICAR marker", () => {
    expect(scanDocumentBytes("application/pdf", Buffer.from("not a pdf"))).toMatchObject({ ok: false, code: "SIGNATURE_MISMATCH" });
    expect(scanDocumentBytes("application/pdf", Buffer.from("%PDF-1.7\n/OpenAction 2 0 R"))).toMatchObject({ ok: false, code: "ACTIVE_PDF_CONTENT" });
    expect(scanDocumentBytes("application/pdf", Buffer.from("%PDF-1.7 EICAR-STANDARD-ANTIVIRUS-TEST-FILE"))).toMatchObject({ ok: false, code: "MALWARE_TEST_SIGNATURE" });
  });

  it("accepts a minimal passive DOCX container", () => {
    const docx = storedZip([
      ["[Content_Types].xml", "<Types></Types>"],
      ["word/document.xml", "<w:document></w:document>"],
      ["_rels/.rels", "<Relationships></Relationships>"],
    ]);
    expect(scanDocumentBytes("application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx)).toEqual({ ok: true, scanStatus: "static_clean" });
  });

  it("rejects DOCX macros and embedded payloads", () => {
    const docx = storedZip([
      ["[Content_Types].xml", "<Types></Types>"],
      ["word/document.xml", "<w:document></w:document>"],
      ["word/vbaProject.bin", "macro"],
    ]);
    expect(scanDocumentBytes("application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx)).toMatchObject({ ok: false, code: "ACTIVE_DOCX_CONTENT" });
  });

  it("does not treat old binary Word files as automatically verified", () => {
    expect(scanDocumentBytes("application/msword", Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))).toMatchObject({ ok: false, code: "LEGACY_WORD_UNSUPPORTED" });
  });

  it("exposes the static clean status to document readiness", () => {
    expect(acceptableDocumentScanStatus("static_clean")).toBe(true);
    expect(acceptableDocumentScanStatus("pending")).toBe(false);
  });
});

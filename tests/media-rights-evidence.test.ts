import { describe, expect, it } from "vitest";
import { normalizeMediaRightsEvidence } from "@/lib/media-rights-evidence";

describe("media rights evidence", () => {
  it("requires a substantive reference", () => {
    expect(normalizeMediaRightsEvidence(undefined)).toBeNull();
    expect(normalizeMediaRightsEvidence("ok")).toBeNull();
    expect(normalizeMediaRightsEvidence("  letter-123  ")).toBe("letter-123");
  });

  it("rejects control characters and oversized references", () => {
    expect(normalizeMediaRightsEvidence("letter-123\nnext")).toBeNull();
    expect(normalizeMediaRightsEvidence("x".repeat(501))).toBeNull();
  });
});

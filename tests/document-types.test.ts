import { describe, expect, it } from "vitest";
import { normalizeDocumentType } from "@/lib/document-types";

describe("normalizeDocumentType", () => {
  it("keeps every application document type canonical", () => {
    expect(normalizeDocumentType("motivation_letter")).toBe("motivation_letter");
    expect(normalizeDocumentType("parental_consent")).toBe("parental_consent");
    expect(normalizeDocumentType("project_presentation")).toBe("project_presentation");
  });

  it("supports stored legacy aliases without accepting arbitrary types", () => {
    expect(normalizeDocumentType("motivation")).toBe("motivation_letter");
    expect(normalizeDocumentType("id")).toBe("student_id");
    expect(normalizeDocumentType("unknown-secret")).toBeNull();
  });
});

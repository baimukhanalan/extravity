import { describe, expect, it } from "vitest";
import { safeReturnPath, withReturnPath } from "@/lib/safe-return-path";

describe("safeReturnPath", () => {
  it("preserves supported first-party student journeys", () => {
    expect(safeReturnPath("/opportunities/talk-talk-korea-2026?from=catalog")).toBe(
      "/opportunities/talk-talk-korea-2026?from=catalog",
    );
    expect(safeReturnPath("/app/applications/123")).toBe("/app/applications/123");
    expect(safeReturnPath("/catalog?category=creative")).toBe("/catalog?category=creative");
  });

  it("rejects external, protocol-relative and unsupported destinations", () => {
    expect(safeReturnPath("https://evil.example/steal")).toBeNull();
    expect(safeReturnPath("//evil.example/steal")).toBeNull();
    expect(safeReturnPath("/\\evil.example/steal")).toBeNull();
    expect(safeReturnPath("/admin/users")).toBeNull();
    expect(safeReturnPath("/application-phishing")).toBeNull();
    expect(safeReturnPath("/catalog-copy")).toBeNull();
  });

  it("encodes a validated destination for the auth hop", () => {
    expect(withReturnPath("/signup", "/opportunities/example?x=1")).toBe(
      "/signup?next=%2Fopportunities%2Fexample%3Fx%3D1",
    );
    expect(withReturnPath("/signup", null)).toBe("/signup");
  });
});

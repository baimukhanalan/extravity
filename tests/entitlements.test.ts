import { describe, it, expect } from "vitest";
import { can, withinSavedLimit, parseEntitlements } from "@/lib/entitlements";

describe("entitlements", () => {
  const free = parseEntitlements({ savedLimit: 20, recommendations: "basic", aiAssistant: false });
  const pro = parseEntitlements({ savedLimit: null, recommendations: "advanced", telegram: true, aiAssistant: true, applicationPack: true });

  it("free plan lacks AI assistant", () => {
    expect(can(free, "aiAssistant")).toBe(false);
  });
  it("pro grants AI assistant and application pack", () => {
    expect(can(pro, "aiAssistant")).toBe(true);
    expect(can(pro, "applicationPack")).toBe(true);
  });
  it("enforces free saved limit", () => {
    expect(withinSavedLimit(free, 19)).toBe(true);
    expect(withinSavedLimit(free, 20)).toBe(false);
  });
  it("unlimited when savedLimit is null", () => {
    expect(withinSavedLimit(pro, 9999)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("transliterates Cyrillic to ASCII", () => {
    expect(slugify("Олимпиада по физике")).toBe("olimpiada-po-fizike");
  });
  it("handles English text", () => {
    expect(slugify("Almaty AI Hackathon 2026")).toBe("almaty-ai-hackathon-2026");
  });
  it("strips punctuation and collapses dashes", () => {
    expect(slugify("MUN — Almaty!!! 2026")).toBe("mun-almaty-2026");
  });
  it("caps length at 60 chars", () => {
    expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(60);
  });
  it("falls back for empty result", () => {
    expect(slugify("!!!")).toBe("opportunity");
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { isOpportunityPriceKnown } from "@/lib/opportunity-price";
import { buildWhere } from "@/lib/queries";

function opportunity(overrides: Partial<Parameters<typeof isOpportunityPriceKnown>[0]> = {}) {
  return {
    price: 0,
    sourceType: "telegram",
    shortDescription: "Открыта регистрация на олимпиаду",
    fullDescription: "Открыта регистрация на олимпиаду для школьников.",
    ...overrides,
  };
}

describe("opportunity participation price evidence", () => {
  it("does not call an unspecified imported price free", () => {
    expect(isOpportunityPriceKnown(opportunity())).toBe(false);
    expect(isOpportunityPriceKnown(opportunity({ fullDescription: "Подробнее: https://example.kz/free" }))).toBe(false);
  });

  it("accepts a stated free price, a positive price, or an editor-entered price", () => {
    expect(isOpportunityPriceKnown(opportunity({ fullDescription: "Участие бесплатное." }))).toBe(true);
    expect(isOpportunityPriceKnown(opportunity({ price: 5000 }))).toBe(true);
    expect(isOpportunityPriceKnown(opportunity({ sourceType: "organizer" }))).toBe(true);
  });

  it("does not mistake a negated free claim for free participation", () => {
    expect(isOpportunityPriceKnown(opportunity({ fullDescription: "Участие не бесплатно." }))).toBe(false);
    expect(isOpportunityPriceKnown(opportunity({ fullDescription: "Бесплатные материалы к олимпиаде." }))).toBe(false);
  });

  it("filters the free catalog by evidence rather than price zero alone", () => {
    const where = buildWhere({ free: "1" });
    const filters = JSON.stringify(where);
    expect(filters).toContain('"price":0');
    expect(filters).toContain('"sourceType"');
    expect(filters).toContain('"бесплатн"');
    expect(filters).toContain('"не бесплатно"');
  });
});

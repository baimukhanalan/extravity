import { describe, it, expect } from "vitest";
import { daysUntil, deadlineLabel, pluralize, formatKzt, formatOpportunityPrice } from "@/lib/utils";

describe("daysUntil", () => {
  it("returns null for missing date", () => {
    expect(daysUntil(null)).toBeNull();
  });
  it("is positive for future dates", () => {
    expect(daysUntil(new Date(Date.now() + 5 * 864e5))).toBeGreaterThan(3);
  });
  it("is negative for past dates", () => {
    expect(daysUntil(new Date(Date.now() - 5 * 864e5))).toBeLessThan(0);
  });
});

describe("deadlineLabel", () => {
  it("flags danger within 3 days", () => {
    expect(deadlineLabel(new Date(Date.now() + 2 * 864e5)).tone).toBe("danger");
  });
  it("flags warning within a week", () => {
    expect(deadlineLabel(new Date(Date.now() + 6 * 864e5)).tone).toBe("warning");
  });
  it("marks passed deadlines muted", () => {
    expect(deadlineLabel(new Date(Date.now() - 864e5)).tone).toBe("muted");
  });
});

describe("pluralize (Russian)", () => {
  const f: [string, string, string] = ["возможность", "возможности", "возможностей"];
  it("1 -> singular", () => expect(pluralize(1, f)).toBe("возможность"));
  it("3 -> few", () => expect(pluralize(3, f)).toBe("возможности"));
  it("5 -> many", () => expect(pluralize(5, f)).toBe("возможностей"));
  it("11 -> many (teens)", () => expect(pluralize(11, f)).toBe("возможностей"));
  it("21 -> singular", () => expect(pluralize(21, f)).toBe("возможность"));
});

describe("formatKzt", () => {
  it("labels zero as free", () => expect(formatKzt(0)).toBe("Бесплатно"));
  it("appends currency symbol", () => expect(formatKzt(1990)).toContain("₸"));
});

describe("formatOpportunityPrice", () => {
  it("keeps foreign-currency participation fees distinct from tenge", () => {
    expect(formatOpportunityPrice(10, "USD")).toContain("$");
    expect(formatOpportunityPrice(10, "USD")).not.toContain("₸");
  });
  it("uses the free label for zero in any currency", () => {
    expect(formatOpportunityPrice(0, "GBP")).toBe("Бесплатно");
  });
});

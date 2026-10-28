import { describe, it, expect } from "vitest";
import { parseKzDateTime, toKzDateTimeInput, daysFromNow } from "@/lib/utils";

describe("Kazakhstan datetime handling", () => {
  it("parses a datetime-local value as Almaty wall clock (UTC+5)", () => {
    const parsed = parseKzDateTime("2026-08-06T10:00");
    expect(parsed?.toISOString()).toBe("2026-08-06T05:00:00.000Z");
  });

  it("round-trips through the input format", () => {
    const value = "2026-12-31T23:30";
    expect(toKzDateTimeInput(parseKzDateTime(value))).toBe(value);
  });

  it("returns null for an unparseable value", () => {
    expect(parseKzDateTime("")).toBeNull();
    expect(parseKzDateTime("not-a-date")).toBeNull();
  });

  it("renders an empty string for a missing date", () => {
    expect(toKzDateTimeInput(null)).toBe("");
    expect(toKzDateTimeInput(undefined)).toBe("");
  });

  it("does not shift the day for a midday deadline", () => {
    // A 12:00 Almaty deadline must stay on the same calendar day in the input.
    const stored = parseKzDateTime("2026-08-06T12:00");
    expect(toKzDateTimeInput(stored).slice(0, 10)).toBe("2026-08-06");
  });
});

describe("daysFromNow", () => {
  it("moves forward by whole days", () => {
    const diff = daysFromNow(7).getTime() - Date.now();
    expect(Math.round(diff / 864e5)).toBe(7);
  });
});

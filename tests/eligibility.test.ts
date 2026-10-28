import { describe, it, expect } from "vitest";
import { evaluateEligibility } from "@/lib/eligibility";
import { makeStudent, makeOpportunity } from "./factories";

describe("evaluateEligibility", () => {
  it("eligible when all hard criteria pass", () => {
    const res = evaluateEligibility(makeStudent(), makeOpportunity());
    expect(res.eligible).toBe(true);
    expect(res.failures).toHaveLength(0);
  });

  it("fails on passed deadline", () => {
    const res = evaluateEligibility(makeStudent(), makeOpportunity({ applicationDeadline: new Date(Date.now() - 864e5) }));
    expect(res.eligible).toBe(false);
    expect(res.failures.join(" ")).toMatch(/дедлайн/i);
  });

  it("fails when grade below minimum", () => {
    const res = evaluateEligibility(makeStudent({ grade: 7 }), makeOpportunity({ minimumGrade: 9 }));
    expect(res.eligible).toBe(false);
  });

  it("fails offline event in another city without travel", () => {
    const res = evaluateEligibility(
      makeStudent({ city: "Астана", willingToTravel: false }),
      makeOpportunity({ city: "Алматы", format: "OFFLINE" }),
    );
    expect(res.eligible).toBe(false);
  });

  it("fails when price exceeds budget and no aid", () => {
    const res = evaluateEligibility(
      makeStudent({ maxBudget: 10000 }),
      makeOpportunity({ price: 50000, financialAidAvailable: false, scholarshipAvailable: false }),
    );
    expect(res.eligible).toBe(false);
  });

  it("warns (not fails) when price over budget but aid available", () => {
    const res = evaluateEligibility(
      makeStudent({ maxBudget: 10000 }),
      makeOpportunity({ price: 50000, scholarshipAvailable: true }),
    );
    expect(res.eligible).toBe(true);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it("null student yields warning, not crash", () => {
    const res = evaluateEligibility(null, makeOpportunity());
    expect(res.warnings.length).toBeGreaterThan(0);
  });
});

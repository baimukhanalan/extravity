import { describe, it, expect } from "vitest";
import { computeMatch } from "@/lib/match";
import { makeStudent, makeOpportunity } from "./factories";

describe("computeMatch", () => {
  it("returns a score in 3..99", () => {
    const m = computeMatch(makeStudent(), makeOpportunity());
    expect(m.score).toBeGreaterThanOrEqual(3);
    expect(m.score).toBeLessThanOrEqual(99);
  });

  it("caps ineligible opportunities at 40", () => {
    const m = computeMatch(
      makeStudent({ grade: 7 }),
      makeOpportunity({ minimumGrade: 10, maximumGrade: 11 }),
    );
    expect(m.eligible).toBe(false);
    expect(m.score).toBeLessThanOrEqual(40);
  });

  it("gives reasons for a well-matched opportunity", () => {
    const m = computeMatch(makeStudent(), makeOpportunity({ price: 0, organizerVerified: "VERIFIED" }));
    expect(m.reasons.length).toBeGreaterThan(0);
  });

  it("rewards interest overlap (AI/tech) with higher score", () => {
    const techie = makeStudent({ interests: ["technology"] });
    const aiOpp = makeOpportunity({ tags: ["AI", "программирование"], category: { slug: "hackathon" } });
    const artOpp = makeOpportunity({ tags: ["дизайн"], category: { slug: "creative" } });
    expect(computeMatch(techie, aiOpp).score).toBeGreaterThan(computeMatch(techie, artOpp).score);
  });

  it("estimates more hours when documents required", () => {
    const withDocs = computeMatch(makeStudent(), makeOpportunity({ requiredDocuments: ["motivation_letter", "cv"] }));
    const noDocs = computeMatch(makeStudent(), makeOpportunity({ requiredDocuments: [] }));
    expect(withDocs.estimatedHours).toBeGreaterThan(noDocs.estimatedHours);
  });

  it("handles null student without crashing", () => {
    const m = computeMatch(null, makeOpportunity());
    expect(typeof m.score).toBe("number");
  });
});

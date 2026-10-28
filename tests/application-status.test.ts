import { describe, expect, it } from "vitest";
import { canTransitionApplicationStatus } from "@/lib/application-status";

describe("application status transitions", () => {
  it("allows the normal preparation path", () => {
    expect(canTransitionApplicationStatus("PREPARING", "READY_FOR_REVIEW")).toBe(true);
    expect(canTransitionApplicationStatus("READY_FOR_REVIEW", "READY_TO_SUBMIT")).toBe(true);
    expect(canTransitionApplicationStatus("READY_TO_SUBMIT", "SUBMITTED")).toBe(true);
  });

  it("blocks skipping directly to a terminal result", () => {
    expect(canTransitionApplicationStatus("PREPARING", "ACCEPTED")).toBe(false);
    expect(canTransitionApplicationStatus("CONSIDERING", "SUBMITTED")).toBe(false);
  });

  it("does not create duplicate transitions", () => {
    expect(canTransitionApplicationStatus("PREPARING", "PREPARING")).toBe(false);
  });
});

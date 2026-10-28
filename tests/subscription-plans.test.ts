import { describe, expect, it } from "vitest";
import { SUBSCRIPTION_PLAN_DEFINITIONS } from "@/lib/subscription-plans";

describe("subscription plan contract", () => {
  it("offers only catalog and search plans", () => {
    expect(SUBSCRIPTION_PLAN_DEFINITIONS.map((plan) => plan.slug)).toEqual(["free", "pro_search"]);
  });
});

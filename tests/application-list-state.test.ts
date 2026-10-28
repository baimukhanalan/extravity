import { describe, expect, it } from "vitest";
import { applicationHistoryWhere, partitionApplicationsByAvailability } from "@/lib/application-list-state";

const now = new Date("2026-09-27T12:00:00.000Z");
const active = {
  status: "REGISTRATION_OPEN" as const,
  moderationStatus: "APPROVED" as const,
  applicationDeadline: new Date("2026-09-28T12:00:00.000Z"),
  deletedAt: null,
};

describe("partitionApplicationsByAvailability", () => {
  it("loads application history by owner without a public-catalog visibility condition", () => {
    expect(applicationHistoryWhere("student-1")).toEqual({ userId: "student-1" });
  });

  it("keeps current opportunities separate from expired, archived and removed history", () => {
    const applications = [
      { id: "open", opportunity: active },
      { id: "expired", opportunity: { ...active, applicationDeadline: now } },
      { id: "archived", opportunity: { ...active, status: "ARCHIVED" as const } },
      { id: "deleted", opportunity: { ...active, deletedAt: now } },
      { id: "unapproved", opportunity: { ...active, moderationStatus: "REJECTED" as const } },
    ];
    const result = partitionApplicationsByAvailability(applications, now);
    expect(result.current.map((application) => application.id)).toEqual(["open"]);
    expect(result.historical.map((application) => application.id)).toEqual(["expired", "archived", "deleted", "unapproved"]);
  });
});

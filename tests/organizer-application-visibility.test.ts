import { describe, expect, it } from "vitest";
import {
  ORGANIZER_VISIBLE_APPLICATION_STATUSES,
  organizerVisibleApplicationWhere,
} from "@/lib/organizer-application-visibility";

describe("organizer application visibility", () => {
  it("excludes drafts, incomplete data, and pre-submission stages", () => {
    for (const status of ["CONSIDERING", "SAVED", "PREPARING", "DOCUMENTS_MISSING", "READY_FOR_REVIEW", "READY_TO_SUBMIT"]) {
      expect(ORGANIZER_VISIBLE_APPLICATION_STATUSES).not.toContain(status);
    }
    expect(ORGANIZER_VISIBLE_APPLICATION_STATUSES).toContain("SUBMITTED");
    expect(ORGANIZER_VISIBLE_APPLICATION_STATUSES).toContain("ACCEPTED");
  });

  it("scopes submitted applications to the current organizer", () => {
    expect(organizerVisibleApplicationWhere("org-1")).toEqual({
      opportunity: { organizerId: "org-1" },
      status: { in: ORGANIZER_VISIBLE_APPLICATION_STATUSES },
    });
  });
});

import { describe, expect, it } from "vitest";
import { assessOpportunityModeration, audienceStatusFromProvenance, ingestUnknownTermsFromProvenance } from "@/lib/opportunity-moderation";

const base = {
  title: "Стажировка в Freedom Bank",
  shortDescription: "Открыт набор школьников на летнюю стажировку.",
  fullDescription: "Подайте заявку до установленного срока.",
  organizerName: "Freedom Bank",
  sourceType: "telegram",
  sourceUrl: "https://t.me/freedom/42",
  audienceStatus: "SCHOOL" as const,
  applicationUrl: "https://apply.example.org/internship",
  applicationDeadline: new Date("2030-05-01T17:59:59.999Z"),
  confidenceScore: 85,
  moderationStatus: "APPROVED",
  media: [{ processingState: "READY" as const, rightsState: "SOURCE_POST" as const, rightsEvidenceRef: "https://t.me/freedom/42", platformMediaId: "tg-photo-42" }],
  now: new Date("2026-09-26T00:00:00.000Z"),
};

describe("opportunity moderation assessment", () => {
  it("allows a concrete open opportunity with a distinct application form", () => {
    expect(assessOpportunityModeration(base)).toEqual({ publishAllowed: true, blockers: [], risks: [] });
  });

  it("blocks publication while parsed material terms remain unverified", () => {
    expect(assessOpportunityModeration({ ...base, country: "Unspecified" }).blockers).toContain("material_terms_unverified");
    expect(assessOpportunityModeration({ ...base, ingestUnknownTerms: ["price"] }).blockers).toContain("material_terms_unverified");
    expect(assessOpportunityModeration({ ...base, ingestUnknownTerms: ["price"], allowUnknownPrice: true }).blockers).not.toContain("material_terms_unverified");
    expect(ingestUnknownTermsFromProvenance({ ingestUnknownTerms: ["price", "unknown", 10] })).toEqual(["price"]);
    expect(audienceStatusFromProvenance({ audienceStatus: "NON_SCHOOL" })).toBe("NON_SCHOOL");
    expect(assessOpportunityModeration({ ...base, audienceStatus: "NON_SCHOOL" }).blockers).not.toContain("audience_unverified");
    expect(assessOpportunityModeration({ ...base, sourceType: "telegram", audienceStatus: "UNKNOWN" }).blockers).toContain("audience_unverified");
    expect(assessOpportunityModeration({ ...base, sourceType: "telegram", audienceStatus: "SCHOOL" }).blockers).not.toContain("audience_unverified");
    expect(assessOpportunityModeration({ ...base, sourceType: "manual", audienceStatus: "UNKNOWN" }).blockers).not.toContain("audience_unverified");
    expect(assessOpportunityModeration({ ...base, duplicateReviewRequired: true }).blockers).toContain("potential_duplicate_review_required");
  });

  it("distinguishes a missing, invalid and expired deadline", () => {
    expect(assessOpportunityModeration({ ...base, applicationDeadline: null }).blockers).toContain("deadline_missing");
    expect(assessOpportunityModeration({ ...base, applicationDeadline: new Date("invalid") }).blockers).toContain("deadline_invalid");
    expect(assessOpportunityModeration({ ...base, applicationDeadline: new Date("2025-01-01") }).blockers).toContain("deadline_expired");
  });

  it("requires media that is both processed and rights-approved", () => {
    expect(assessOpportunityModeration({ ...base, media: [] }).blockers).toContain("approved_media_missing");
    expect(assessOpportunityModeration({ ...base, media: [{ processingState: "READY", rightsState: "PENDING" }] }).blockers)
      .toContain("approved_media_missing");
    expect(assessOpportunityModeration({ ...base, media: [{ processingState: "STAGED", rightsState: "APPROVED" }] }).blockers)
      .toContain("approved_media_missing");
    expect(assessOpportunityModeration({ ...base, media: [{ processingState: "READY", rightsState: "APPROVED" }] }).blockers)
      .toContain("approved_media_missing");
    expect(assessOpportunityModeration({ ...base, media: [{ processingState: "READY", rightsState: "LICENSED_FALLBACK", rightsEvidenceRef: "generated" }] }).blockers)
      .toContain("approved_media_missing");
    expect(assessOpportunityModeration({ ...base, media: [{ processingState: "READY", rightsState: "SOURCE_POST", rightsEvidenceRef: base.sourceUrl, platformMediaId: "tg-photo-42" }] }).blockers)
      .not.toContain("approved_media_missing");
    expect(assessOpportunityModeration({ ...base, sourceType: "official_site" }).blockers).toContain("approved_media_missing");
    expect(assessOpportunityModeration({ ...base, media: [{ ...base.media[0], rightsEvidenceRef: "https://t.me/freedom/43" }] }).blockers)
      .toContain("approved_media_missing");
  });

  it.each([
    ["Подвели итоги конкурса", "content_resembles_retrospective"],
    ["Spaceborne: объявлены финалисты", "content_resembles_retrospective"],
    ["В Астане состоялся AI-хакатон HackAlem", "content_resembles_retrospective"],
    ["Spaceborne вышел в финал Constructor Start", "content_resembles_retrospective"],
    ["Компания запустила новый фонд", "content_resembles_news"],
    ["Стартап-чайхана стала информационным партнёром AWS Innovation Day", "content_resembles_news"],
    ["Розыгрыш билетов среди подписчиков", "content_resembles_promotion"],
    ["Digital Bridge tickets", "content_resembles_promotion"],
  ] as const)("flags risky content: %s", (title, expected) => {
    const assessment = assessOpportunityModeration({ ...base, title });
    expect(assessment.risks).toContain(expected);
    expect(assessment.publishAllowed).toBe(false);
  });

  it("flags low extraction confidence but not a score at the threshold", () => {
    expect(assessOpportunityModeration({ ...base, confidenceScore: 69 }).risks).toContain("confidence_below_review_threshold");
    expect(assessOpportunityModeration({ ...base, confidenceScore: 70 }).risks).not.toContain("confidence_below_review_threshold");
  });

  it("does not mistake a real competition for an ad solely because its description mentions a discount", () => {
    const assessment = assessOpportunityModeration({
      ...base,
      title: "Harvard Student Case Competition 2026",
      fullDescription: "Подайте заявку на конкурс. Для школьников есть скидка на регистрационный взнос.",
    });
    expect(assessment.risks).not.toContain("content_resembles_promotion");
  });

  it("keeps a new competition open when its description mentions an earlier season", () => {
    const assessment = assessOpportunityModeration({
      ...base,
      title: "Республиканская олимпиада по информатике 2030",
      fullDescription: "В прошлом году олимпиада прошла успешно. Подайте заявку на новый сезон.",
    });
    expect(assessment.risks).not.toContain("content_resembles_retrospective");
  });
});

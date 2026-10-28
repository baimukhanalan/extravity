import { z } from "zod";

export const publicationReviewSchema = z.object({
  evidenceRef: z.string().trim().min(8).max(500),
  organizerConfirmed: z.literal(true),
  ageConfirmed: z.literal(true),
  citizenshipConfirmed: z.literal(true),
  priceConfirmed: z.boolean(),
  priceUnspecifiedReviewed: z.boolean().default(false),
  deadlineConfirmed: z.literal(true),
  noConflictingDeadlines: z.literal(true),
  applicationRecipientConfirmed: z.literal(true),
}).refine((review) => review.priceConfirmed !== review.priceUnspecifiedReviewed, {
  message: "Confirm the price or explicitly review its absence",
  path: ["priceConfirmed"],
});

export type PublicationReview = z.infer<typeof publicationReviewSchema>;

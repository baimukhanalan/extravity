/**
 * Database-driven plan entitlements. Plans store an `entitlements` JSON blob
 * (see prisma seed); this reads it instead of hardcoding limits in the UI.
 */
export type Entitlements = {
  savedLimit?: number | null;
  recommendations?: "basic" | "advanced";
  telegram?: boolean;
  aiAssistant?: boolean;
  applicationPack?: boolean;
};

export function parseEntitlements(raw: unknown): Entitlements {
  return (raw ?? {}) as Entitlements;
}

/** Whether a boolean feature is granted by the plan. */
export function can(entitlements: Entitlements, feature: keyof Entitlements): boolean {
  const v = entitlements[feature];
  return v === true;
}

/** Whether the user is within the saved-opportunity limit (null = unlimited). */
export function withinSavedLimit(entitlements: Entitlements, currentCount: number): boolean {
  const limit = entitlements.savedLimit;
  if (limit == null) return true;
  return currentCount < limit;
}

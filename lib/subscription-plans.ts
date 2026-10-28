export const SUBSCRIPTION_PLAN_DEFINITIONS = [
  {
    slug: "free",
    name: "Free",
    priceKzt: 0,
    order: 0,
    entitlements: { savedLimit: 20, recommendations: "basic", aiAssistant: false },
  },
  {
    slug: "pro_search",
    name: "Pro Search",
    priceKzt: 2990,
    order: 1,
    entitlements: { savedLimit: null, recommendations: "advanced", telegram: true, aiAssistant: false },
  },
] as const;


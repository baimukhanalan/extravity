export const CURATED_PRICE_SOURCES = ["manual", "organizer"] as const;
export const FREE_CLAIM_FRAGMENTS = ["бесплатн", "тегін", "ақысыз", "free", "без оплаты", "без взноса", "0 ₸"] as const;
export const NEGATED_FREE_FRAGMENTS = [
  "не бесплатно", "не является бесплатным", "not free", "бесплатные материалы",
  "free materials", "бесплатная регистрация", "регистрация бесплатная", "free application",
] as const;

export function isOpportunityPriceKnown(input: {
  price: number;
  sourceType: string;
  fullDescription: string;
  shortDescription: string;
}): boolean {
  if (!Number.isInteger(input.price) || input.price < 0) return false;
  if (input.price > 0) return true;
  if (CURATED_PRICE_SOURCES.includes(input.sourceType as typeof CURATED_PRICE_SOURCES[number])) return true;

  const description = `${input.shortDescription} ${input.fullDescription}`
    .replace(/https?:\/\/\S+/gi, " ")
    .toLowerCase();
  if (NEGATED_FREE_FRAGMENTS.some((phrase) => description.includes(phrase))) return false;
  return FREE_CLAIM_FRAGMENTS.some((phrase) => description.includes(phrase));
}

import type { Opportunity, StudentProfile } from "@prisma/client";
import { evaluateEligibility } from "./eligibility";
import { daysUntil } from "./utils";
import { INTERESTS } from "./constants";
import { isOpportunityPriceKnown } from "./opportunity-price";

export type MatchResult = {
  score: number; // 0-100
  eligible: boolean;
  reasons: string[]; // why it fits
  gaps: string[]; // what's missing
  failures: string[]; // hard blockers
  missingDocuments: string[];
  difficulty: number;
  estimatedHours: number;
};

// Map interest keys -> tags/categories that signal a match.
const INTEREST_SIGNALS: Record<string, string[]> = {
  technology: ["AI", "программирование", "робототехника", "инженерия", "hackathon", "robotics"],
  entrepreneurship: ["предпринимательство", "финансы", "экономика", "startup"],
  science: ["исследования", "физика", "химия", "биология", "математика", "science", "research", "olympiad"],
  medicine: ["медицина", "биология"],
  engineering: ["инженерия", "робототехника", "физика"],
  economics: ["экономика", "финансы", "предпринимательство"],
  international: ["международные отношения", "mun", "exchange"],
  debate: ["дебаты", "публичные выступления", "debate", "mun"],
  creative: ["дизайн", "creative"],
  sport: ["спорт", "sport"],
  volunteer: ["волонтёрство", "volunteer", "social"],
};

/**
 * Personal match score. Hard eligibility is applied first — a student who is
 * not eligible is capped at 40 so ineligible items never look like strong fits.
 * Soft factors follow the weighting from the product spec.
 */
export function computeMatch(
  student: StudentProfile | null,
  opp: Opportunity & { category?: { slug: string } | null },
): MatchResult {
  const elig = evaluateEligibility(student, opp);
  const reasons: string[] = [];
  const gaps: string[] = [];

  if (!student) {
    return {
      score: 50,
      eligible: elig.eligible,
      reasons: ["Заполните профиль для точного подбора"],
      gaps: [],
      failures: elig.failures,
      missingDocuments: elig.missingDocuments,
      difficulty: opp.difficultyScore,
      estimatedHours: estimateHours(opp),
    };
  }

  const categorySlug = opp.category?.slug ?? "";
  const signalPool = [...opp.tags, categorySlug].map((s) => s.toLowerCase());

  // 30% interests
  let interestScore = 0;
  const matchedInterests: string[] = [];
  for (const key of student.interests) {
    const signals = (INTEREST_SIGNALS[key] || []).map((s) => s.toLowerCase());
    if (signals.some((s) => signalPool.includes(s))) {
      matchedInterests.push(INTERESTS.find((i) => i.key === key)?.label || key);
    }
  }
  if (student.interests.length > 0) {
    interestScore = Math.min(1, matchedInterests.length / Math.min(3, student.interests.length));
  }
  if (matchedInterests.length > 0) {
    reasons.push(`Совпадает с интересами: ${matchedInterests.slice(0, 3).join(", ")}`);
  }

  // 20% skills — reward if opportunity tags overlap skill areas
  const skillScore = student.skills.length > 0 ? Math.min(1, 0.4 + student.skills.length * 0.1) : 0.3;

  // 15% goals
  let goalScore = 0.3;
  if (student.goals.includes("portfolio")) goalScore += 0.3;
  if (student.goals.includes("study_abroad") && opp.prestigeScore >= 65) {
    goalScore += 0.3;
    reasons.push("Усиливает портфолио для поступления за рубеж");
  }
  if (student.goals.includes("competitions") && ["olympiad", "hackathon", "startup", "debate"].includes(categorySlug)) {
    goalScore += 0.2;
  }
  goalScore = Math.min(1, goalScore);

  // 10% portfolio value = prestige
  const portfolioScore = opp.prestigeScore / 100;

  // 10% likelihood to make the deadline
  const days = daysUntil(opp.applicationDeadline);
  let deadlineScore = 1;
  if (days !== null) {
    if (days < 0) deadlineScore = 0;
    else if (days < 3) deadlineScore = 0.3;
    else if (days < 7) deadlineScore = 0.6;
    else if (days < 14) deadlineScore = 0.85;
  }

  // 5% affordability
  const priceKnown = isOpportunityPriceKnown(opp);
  const affordScore = !priceKnown ? 0.4 : opp.price === 0 ? 1 : student.maxBudget && opp.price <= student.maxBudget ? 0.8 : 0.4;

  // 5% prestige (separate light weight)
  const prestigeScore = opp.prestigeScore / 100;

  // 5% probability of successful apply (based on competition)
  const successScore = 1 - opp.competitionScore / 200;

  const raw =
    0.3 * interestScore +
    0.2 * skillScore +
    0.15 * goalScore +
    0.1 * portfolioScore +
    0.1 * deadlineScore +
    0.05 * affordScore +
    0.05 * prestigeScore +
    0.05 * successScore;

  let score = Math.round(raw * 100);

  // Location & cost positives
  if (opp.format === "ONLINE") reasons.push("Доступно онлайн из любого города");
  else if (student.city && opp.city === student.city) reasons.push(`Проходит в вашем городе (${student.city})`);
  if (opp.price === 0 && priceKnown) reasons.push("Участие бесплатное");
  if (!priceKnown) gaps.push("Стоимость участия не указана");
  if (opp.scholarshipAvailable) reasons.push("Доступна стипендия / финансовая помощь");
  if (opp.organizerVerified === "VERIFIED") reasons.push("Организатор верифицирован");

  // Gaps
  if (opp.requiredDocuments.length > 0) {
    gaps.push(`Документы: ${opp.requiredDocuments.length} шт.`);
  }
  if (opp.participationType === "TEAM" && opp.minimumTeamSize) {
    gaps.push(`Команда из ${opp.minimumTeamSize}${opp.maximumTeamSize ? `–${opp.maximumTeamSize}` : ""} человек`);
  }

  // Cap ineligible items
  if (!elig.eligible) {
    score = Math.min(score, 40);
  }

  score = Math.max(3, Math.min(99, score));

  return {
    score,
    eligible: elig.eligible,
    reasons: reasons.slice(0, 5),
    gaps,
    failures: elig.failures,
    missingDocuments: elig.missingDocuments,
    difficulty: opp.difficultyScore,
    estimatedHours: estimateHours(opp),
  };
}

function estimateHours(opp: Opportunity): number {
  let h = 2;
  h += opp.requiredDocuments.length * 1.5;
  if (opp.requiredDocuments.includes("motivation_letter")) h += 3;
  if (opp.requiredDocuments.includes("project_presentation")) h += 4;
  if (opp.difficultyScore > 70) h += 3;
  return Math.round(h);
}

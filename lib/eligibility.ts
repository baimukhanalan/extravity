import type { Opportunity, StudentProfile } from "@prisma/client";
import { daysUntil } from "./utils";
import { isOpportunityPriceKnown } from "./opportunity-price";

export type EligibilityResult = {
  eligible: boolean;
  failures: string[];
  warnings: string[];
  missingDocuments: string[];
};

function ageFrom(birthDate: Date | null): number | null {
  if (!birthDate) return null;
  const diff = Date.now() - new Date(birthDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

/**
 * Hard eligibility filters. A student who fails any of these must not receive a
 * high match score (see match.ts). Missing profile data produces warnings, not
 * failures, so incomplete profiles still see opportunities.
 */
export function evaluateEligibility(
  student: StudentProfile | null,
  opp: Opportunity,
): EligibilityResult {
  const failures: string[] = [];
  const warnings: string[] = [];

  // Deadline
  const days = daysUntil(opp.applicationDeadline);
  if (days !== null && days < 0) {
    failures.push("Дедлайн подачи уже прошёл");
  }

  if (!student) {
    warnings.push("Заполните профиль, чтобы проверить соответствие");
    return { eligible: failures.length === 0, failures, warnings, missingDocuments: opp.requiredDocuments };
  }

  // Age
  const age = ageFrom(student.birthDate);
  if (age !== null) {
    if (opp.minimumAge && age < opp.minimumAge)
      failures.push(`Минимальный возраст — ${opp.minimumAge}, вам ${age}`);
    if (opp.maximumAge && age > opp.maximumAge)
      failures.push(`Максимальный возраст — ${opp.maximumAge}, вам ${age}`);
  } else if (opp.minimumAge || opp.maximumAge) {
    warnings.push("Укажите дату рождения для проверки возраста");
  }

  // Grade
  if (student.grade != null) {
    if (opp.minimumGrade && student.grade < opp.minimumGrade)
      failures.push(`Требуется класс не ниже ${opp.minimumGrade}`);
    if (opp.maximumGrade && student.grade > opp.maximumGrade)
      failures.push(`Требуется класс не выше ${opp.maximumGrade}`);
  } else if (opp.minimumGrade || opp.maximumGrade) {
    warnings.push("Укажите класс для проверки соответствия");
  }

  // Geography / format
  if (opp.format === "OFFLINE") {
    if (student.onlineOnly) {
      failures.push("Мероприятие офлайн, а вы выбрали только онлайн");
    } else if (student.city && opp.city && student.city !== opp.city && opp.city !== "Онлайн") {
      if (!student.willingToTravel) {
        failures.push(`Мероприятие в городе ${opp.city}, а вы не готовы к поездкам`);
      } else {
        warnings.push(`Потребуется поездка в город ${opp.city}`);
      }
    }
  }

  // Budget
  if (!isOpportunityPriceKnown(opp)) warnings.push("Стоимость участия не указана");
  if (opp.price > 0 && student.maxBudget != null && opp.price > student.maxBudget) {
    if (opp.financialAidAvailable || opp.scholarshipAvailable) {
      warnings.push("Стоимость выше бюджета, но доступна финансовая помощь");
    } else {
      failures.push(`Стоимость ${opp.price.toLocaleString("ru-RU")} ₸ выше вашего бюджета`);
    }
  }

  // Team
  if (opp.participationType === "TEAM" && opp.minimumTeamSize && opp.minimumTeamSize > 1) {
    warnings.push(`Нужна команда из ${opp.minimumTeamSize}–${opp.maximumTeamSize ?? opp.minimumTeamSize} человек`);
  }

  // Documents
  const missingDocuments = opp.requiredDocuments;

  return {
    eligible: failures.length === 0,
    failures,
    warnings,
    missingDocuments,
  };
}

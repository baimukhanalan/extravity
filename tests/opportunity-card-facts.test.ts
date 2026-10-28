import { describe, expect, it } from "vitest";
import { hasUsableApplicationUrl, opportunityCardFacts } from "@/lib/opportunity-card-facts";

const base = {
  title: "Digital SAT preparation cohort",
  shortDescription: "Подготовка к SAT для школьников",
  fullDescription: "",
  tags: ["SAT"],
  format: "ONLINE" as const,
  city: "Онлайн",
  minimumAge: 14,
  maximumAge: 18,
  minimumGrade: 9,
  maximumGrade: 11,
  applicationUrl: "https://apply.example.org/sat",
  sourceUrl: "https://t.me/example/12",
};

describe("opportunity card facts", () => {
  it("surfaces the exam, format, audience and direct application gate", () => {
    expect(opportunityCardFacts(base, "ru")).toEqual({
      exam: "SAT",
      audience: "9–11 классы",
      format: "Онлайн",
      applicationReady: true,
      application: "Ссылка подачи есть",
    });
  });

  it("recognizes multiple exams and falls back honestly when the audience is absent", () => {
    const facts = opportunityCardFacts({ ...base, title: "IELTS and TOEFL workshop", shortDescription: "Language exam workshop", tags: [], minimumGrade: null, maximumGrade: null, minimumAge: null, maximumAge: null }, "en");
    expect(facts.exam).toBe("IELTS + TOEFL");
    expect(facts.audience).toBe("Audience to be confirmed");
  });
});

describe("application URL gate", () => {
  it.each([null, "http://apply.example.org", "https://t.me/example/12", "https://instagram.com/p/abc", "not-a-url"])("rejects %s", (url) => {
    expect(hasUsableApplicationUrl(url, base.sourceUrl)).toBe(false);
  });

  it("accepts a separate HTTPS application form", () => {
    expect(hasUsableApplicationUrl("https://forms.gle/abc", base.sourceUrl)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import {
  extractCandidate,
  extractActivityTags,
  findApplicationUrl,
  findCity,
  findDeadline,
  findPrice,
  guessCategory,
  instagramPermalink,
  looksLikeOpportunity,
  makeTitle,
} from "@/lib/opportunity-extract";

/**
 * These mirror apps/parser/tests/test_tg_extract.py on purpose: the bot path
 * and the MTProto collector must read the same post the same way.
 */

const POSTED = new Date(Date.UTC(2026, 1, 10)); // 10 Feb 2026

const OLYMPIAD_POST = [
  "🏆 Республиканская олимпиада по информатике 2026",
  "",
  "Приглашаем учеников 8–11 классов принять участие в олимпиаде.",
  "Отборочный тур пройдёт онлайн, финал — в Астане.",
  "Участие бесплатное.",
  "Дедлайн подачи заявок: 20 марта",
  "Регистрация: https://forms.gle/example123",
].join("\n");

describe("findApplicationUrl", () => {
  it("does not treat a details or social link as an application form", () => {
    expect(findApplicationUrl("Подробнее: https://example.kz/info\nНовости: https://t.me/channel/1")).toBeUndefined();
  });

  it("uses a generic link when it is explicitly labeled for application", () => {
    expect(findApplicationUrl("Регистрация: https://example.kz/contest")).toBe("https://example.kz/contest");
  });

  it("prefers an explicitly labeled application link over an unrelated form", () => {
    expect(findApplicationUrl("Опрос: https://forms.gle/survey\nПодать заявку: https://official.kz/program"))
      .toBe("https://official.kz/program");
  });

  it("recognizes a known form host and application path", () => {
    expect(findApplicationUrl("Ссылка: https://example.kz/apply?event=1")).toBe("https://example.kz/apply?event=1");
    expect(findApplicationUrl("Ссылка: https://forms.gle/abc")).toBe("https://forms.gle/abc");
  });
});

describe("looksLikeOpportunity", () => {
  it("accepts a short Kazakh open call with a link and category", () => {
    const text = "Робототехника жарысына тіркеу ашылды. Өтінім 15 қазанға дейін: https://example.kz/apply";
    expect(looksLikeOpportunity(text)).toBe(true);
    const candidate = extractCandidate({ text, sourceUrl: "https://t.me/example/1", organizerName: "Organizer", publishedAt: POSTED });
    expect(candidate?.categorySlug).toBe("robotics");
    expect(candidate?.applicationDeadline).toBe("2026-10-15T23:59:00+05:00");
  });

  it("rejects retrospective news even if it mentions two opportunity terms", () => {
    expect(looksLikeOpportunity("В Астане состоялся хакатон. Участники представили проекты, победители получили гранты. Подробнее: https://example.kz/news")).toBe(false);
  });
  it("rejects a chat message", () => {
    expect(looksLikeOpportunity("Всем привет! Мы вернулись 👋")).toBe(false);
  });

  it("rejects channel self-promotion", () => {
    expect(
      looksLikeOpportunity(
        "Наш телеграм-канал вырос до 10 000 подписчиков! Спасибо, что вы с нами. Дальше — больше контента.",
      ),
    ).toBe(false);
  });

  it("accepts on repeated vocabulary", () => {
    expect(
      looksLikeOpportunity(
        "Открыт набор участников на конкурс проектов. Регистрация по ссылке, заявки принимаются до конца месяца.",
      ),
    ).toBe(true);
  });

  it("accepts a single signal backed by a deadline and a link", () => {
    expect(
      looksLikeOpportunity(
        "Летняя школа по биологии при университете. Две недели лекций и лабораторных, " +
          "проживание включено. Срок подачи документов — 1 июня 2026. Подробнее: https://example.kz/form",
      ),
    ).toBe(true);
  });

  it.each([
    "Open call for Academic Olympiad for high school students. Apply here: https://example.kz/olympiad",
    "Жазғы академияға қатысуға шақырамыз. Тіркеліңіз: https://example.kz/summer",
    "Открыт отбор на стажировку в Freedom Bank. Подайте заявку: https://example.kz/apply",
  ])("accepts expanded open-call wording: %s", (text) => {
    expect(looksLikeOpportunity(text)).toBe(true);
  });

  it("rejects free-material promotions even when they mention programs", () => {
    expect(looksLikeOpportunity("Бесплатные материалы для IELTS, SAT и TOEFL. Гранты, стажировки и программы в одном канале. Ссылка: https://example.kz")).toBe(false);
  });
});

describe("niche extracurricular activity classification", () => {
  it.each([
    ["Открыта регистрация на конкурс эссе", "creative", "эссе и письмо"],
    ["Кастинг моделей для fashion-показа", "creative", "моделинг и мода"],
    ["Вокальный конкурс молодых исполнителей", "creative", "вокал и музыка"],
    ["Открытый чемпионат по фехтованию", "sport", "фехтование"],
    ["Турнир по армрестлингу", "sport", "армрестлинг"],
    ["Streetlifting championship", "sport", "стритлифтинг"],
    ["Street workout battle", "sport", "воркаут"],
  ])("classifies %s", (text, category, tag) => {
    expect(guessCategory(text).slug).toBe(category);
    expect(extractActivityTags(text)).toContain(tag);
  });

  it("adds the direction tag to the ingest candidate", () => {
    const candidate = extractCandidate({
      text: "Открыта регистрация на чемпионат по армрестлингу. Заявки до 20 декабря 2026: https://example.kz/apply",
      sourceUrl: "https://t.me/sport_kz/10",
      organizerName: "Sport KZ",
      publishedAt: new Date(Date.UTC(2026, 9, 22)),
    });
    expect(candidate?.categorySlug).toBe("sport");
    expect(candidate?.tags).toContain("армрестлинг");
  });
});

describe("findDeadline", () => {
  it("reads a word date after a deadline marker", () => {
    expect(findDeadline("Дедлайн подачи заявок: 20 марта", POSTED)?.toISOString()).toBe(
      "2026-03-20T00:00:00.000Z",
    );
  });

  it("reads a numeric date with an explicit year", () => {
    expect(findDeadline("Приём заявок до 15.04.2026", POSTED)?.toISOString()).toBe(
      "2026-04-15T00:00:00.000Z",
    );
  });

  it("anchors a bare date on the post date, not on today", () => {
    const posted = new Date(Date.UTC(2026, 11, 1)); // December
    expect(findDeadline("дедлайн 20 марта", posted)?.getUTCFullYear()).toBe(2027);
  });

  it("does not roll a recently passed deadline into next year", () => {
    const posted = new Date(Date.UTC(2026, 8, 22));
    expect(findDeadline("дедлайн 20 сентября", posted)?.toISOString()).toBe("2026-09-20T00:00:00.000Z");
  });

  it("picks the earliest marked date", () => {
    const d = findDeadline("Старт 1 сентября. Дедлайн 5 мая, финальный дедлайн 20 июня.", POSTED);
    expect(d?.toISOString()).toBe("2026-05-05T00:00:00.000Z");
  });

  it("returns null when there is no date", () => {
    expect(findDeadline("Дедлайн скоро, следите за новостями", POSTED)).toBeNull();
  });

  it("rejects impossible calendar dates", () => {
    expect(findDeadline("Дедлайн 31 февраля 2026", POSTED)).toBeNull();
    expect(findDeadline("Дедлайн 31.02.2026", POSTED)).toBeNull();
  });

  it("does not turn an event date into an application deadline", () => {
    expect(findDeadline("Открыта регистрация на форум. Мероприятие состоится 15 марта 2026.", POSTED)).toBeNull();
    expect(findDeadline("Дедлайн уточняется. Форум пройдёт 15 марта 2026.", POSTED)).toBeNull();
    expect(findDeadline("Дедлайн уточняется\nФорум пройдёт 15 марта 2026.", POSTED)).toBeNull();
  });
});

describe("field parsing", () => {
  it("treats 'бесплатно' as zero even next to a prize amount", () => {
    expect(findPrice("Участие бесплатное, призовой фонд 500 000 ₸")).toBe(0);
  });

  it("parses a spaced price", () => {
    expect(findPrice("Стоимость: 120 000 тг")).toBe(120000);
  });

  it("returns null when no price is mentioned", () => {
    expect(findPrice("Подробности в описании")).toBeNull();
  });

  it.each([
    ["финал пройдёт в Астане", "Астана"],
    ["приезжайте из Караганды", "Караганда"],
    ["площадка — Алматы, Технопарк", "Алматы"],
    ["проводим в интернете", null],
  ])("finds a declined city in %s", (text, expected) => {
    expect(findCity(text)).toBe(expected);
  });

  it.each([
    ["Хакатон по AI", "hackathon"],
    ["Республиканская олимпиада", "olympiad"],
    ["Набор волонтёров", "volunteer"],
    ["Летняя школа по биологии", "summer"],
    ["Academic Olympiad for high school students", "olympiad"],
    ["Business plan competition for teens", "startup"],
    ["Youth exchange scholarship applications", "exchange"],
    ["Шетелге оқуға түсу бойынша кездесу", "career"],
    ["Пікірталас турниріне тіркеу", "debate"],
    ["Конкурс эссе для школьников", "creative"],
    ["Жазғы академияға өтінім", "summer"],
    ["Роботтар жарысына тіркеу", "robotics"],
    ["Конкурс по рисованию для школьников", "creative"],
    ["Қолөнер байқауы: өтінім қабылдау", "creative"],
    ["Шахматный турнир для школьников", "sport"],
    ["STEM competition for teens", "science"],
    ["University open day for applicants", "career"],
    ["Apprenticeship program for graduates", "internship"],
    ["Digital SAT registration for high school students", "test-prep"],
    ["IELTS Academic preparation cohort", "test-prep"],
    ["TOEFL iBT test registration", "test-prep"],
  ])("categorizes %s", (text, expected) => {
    expect(guessCategory(text).slug).toBe(expected);
  });

  it("prefers the headline category over an incidental later mention", () => {
    expect(guessCategory("Стажировка в Freedom Bank. На курсе также изучают стартапы.").slug).toBe("internship");
  });

  it.each(["recourse planning", "poststartup market report", "биохакатонный обзор"])("does not match a keyword inside a word: %s", (text) => {
    expect(guessCategory(text).slug).toBe("forum");
  });

  it("does not read SAT at the start of an ordinary English word", () => {
    expect(guessCategory("Saturday workshop for students").slug).not.toBe("test-prep");
  });

  it("drops emoji and hashtags from the title", () => {
    expect(makeTitle("🏆 #конкурс Олимпиада по информатике\nПодробности ниже")).toBe(
      "Олимпиада по информатике",
    );
  });
});

describe("extractCandidate", () => {
  const candidate = extractCandidate({
    text: OLYMPIAD_POST,
    sourceUrl: "https://t.me/demo/101",
    organizerName: "Demo",
    publishedAt: POSTED,
  });

  it("produces a candidate", () => {
    expect(candidate).not.toBeNull();
  });

  it("maps the fields the moderator needs", () => {
    expect(candidate?.categorySlug).toBe("olympiad");
    expect(candidate?.price).toBe(0);
    expect(candidate?.minimumGrade).toBe(8);
    expect(candidate?.maximumGrade).toBe(11);
    expect(candidate?.applicationUrl).toBe("https://forms.gle/example123");
    expect(candidate?.sourceUrl).toBe("https://t.me/demo/101");
  });

  it("writes the deadline as end of day in Almaty, without shifting it", () => {
    expect(candidate?.applicationDeadline).toBe("2026-03-20T23:59:00+05:00");
    // Same instant, stated in UTC: 18:59 on the same calendar day.
    expect(new Date(candidate!.applicationDeadline!).toISOString()).toBe("2026-03-20T18:59:00.000Z");
  });

  it("calls an online selection with an offline final a hybrid", () => {
    expect(candidate?.format).toBe("HYBRID");
    expect(candidate?.city).toBe("Астана");
  });

  it("leaves format unknown without online or venue evidence", () => {
    const unknown = extractCandidate({
      text: "Открыта регистрация на олимпиаду по физике. Подать заявку: https://example.org/apply",
      sourceUrl: "https://t.me/demo/102",
      organizerName: "Demo",
      publishedAt: POSTED,
    });
    expect(unknown).not.toBeNull();
    expect(unknown?.format).toBeUndefined();
  });

  it("returns null for a non-announcement", () => {
    expect(
      extractCandidate({
        text: "Всем привет 👋",
        sourceUrl: "https://t.me/demo/1",
        organizerName: "Demo",
      }),
    ).toBeNull();
  });

  it("keeps an open event without a stated application deadline active", () => {
    const event = extractCandidate({
      text: "Открыта регистрация на форум для школьников. Мероприятие состоится 15 марта 2026. Регистрация: https://forms.gle/forum-demo",
      sourceUrl: "https://t.me/demo/102",
      organizerName: "Demo",
      publishedAt: POSTED,
    });
    expect(event).not.toBeNull();
    expect(event?.applicationDeadline).toBeUndefined();
  });

  it("never reports full confidence — a moderator still decides", () => {
    expect(candidate?.confidence).toBeLessThanOrEqual(0.9);
    expect(candidate?.confidence).toBeGreaterThan(0.5);
  });
});

describe("instagramPermalink", () => {
  it("finds a post link inside a pasted caption", () => {
    const text = "Крутой конкурс! Подробнее: https://www.instagram.com/p/DEMOaaa111/ #kz";
    expect(instagramPermalink(text)).toBe("https://www.instagram.com/p/DEMOaaa111/");
  });

  it("normalizes reel and tv links to the /p/ form", () => {
    expect(instagramPermalink("см. https://instagram.com/reel/AbC123")).toBe(
      "https://www.instagram.com/p/AbC123/",
    );
    expect(instagramPermalink("https://www.instagram.com/tv/XyZ_9-8/")).toBe(
      "https://www.instagram.com/p/XyZ_9-8/",
    );
  });

  it("upgrades http to https and adds the trailing slash", () => {
    expect(instagramPermalink("http://instagram.com/p/Zzz999")).toBe(
      "https://www.instagram.com/p/Zzz999/",
    );
  });

  it("ignores non-post Instagram links and other hosts", () => {
    expect(instagramPermalink("https://www.instagram.com/some_profile/")).toBeNull();
    expect(instagramPermalink("https://t.me/channel/42")).toBeNull();
    expect(instagramPermalink("нет ссылки вообще")).toBeNull();
  });
});

describe("extractCandidate — Instagram caption", () => {
  // The bot feeds the pasted caption plus the resolved permalink here, exactly
  // as it does for a Telegram forward. Only the sourceUrl differs.
  const INSTAGRAM_CAPTION = [
    "📣 Открыт приём заявок на олимпиаду по математике для 7–9 классов!",
    "Отборочный тур онлайн, финал в Астане. Участие бесплатное.",
    "Дедлайн: 25 марта",
    "Регистрация: https://forms.gle/mathdemo",
    "#олимпиада #математика #школаkz",
  ].join("\n");

  const candidate = extractCandidate({
    text: INSTAGRAM_CAPTION,
    sourceUrl: "https://www.instagram.com/p/DEMOaaa111/",
    organizerName: "Instagram",
    publishedAt: new Date(Date.UTC(2026, 1, 12)),
  });

  it("parses the caption into the ingest schema", () => {
    expect(candidate).not.toBeNull();
    expect(candidate?.categorySlug).toBe("olympiad");
    expect(candidate?.price).toBe(0);
    expect(candidate?.minimumGrade).toBe(7);
    expect(candidate?.maximumGrade).toBe(9);
    expect(candidate?.applicationUrl).toBe("https://forms.gle/mathdemo");
  });

  it("keeps the Instagram permalink as the source", () => {
    expect(candidate?.sourceUrl).toBe("https://www.instagram.com/p/DEMOaaa111/");
  });

  it("anchors the deadline year on the post date", () => {
    expect(candidate?.applicationDeadline).toBe("2026-03-25T23:59:00+05:00");
  });
});

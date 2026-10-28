import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { categorySlugsForSearch, topicTermsForSearch } from "@/lib/catalog-search";
import { CATEGORIES, TAGS } from "@/lib/constants";
import { buildWhere } from "@/lib/queries";
import { ACTIVITY_DIRECTIONS, matchesActivityDirection } from "@/lib/activity-directions";

describe("catalog category aliases", () => {
  it.each([
    ["Робототехника", "robotics"],
    ["robotics", "robotics"],
    ["жазғы мектеп", "summer"],
    ["Стажировки", "internship"],
    ["пікірсайыс", "debate"],
    ["Модель ООН", "mun"],
    ["поступление за рубеж", "career"],
    ["шетелге оқуға түсу", "career"],
    ["academic olympiad", "olympiad"],
    ["бизнес-идеялар байқауы", "startup"],
    ["essay competition", "creative"],
    ["youth exchange", "exchange"],
    ["тағылымдама", "internship"],
    ["тәлімгерлік бағдарлама", "mentorship"],
    ["стажировке", "internship"],
    ["хакатонах", "hackathon"],
    ["робототехнические", "robotics"],
    ["тағылымдамалар", "internship"],
    ["еріктілерге", "volunteer"],
    ["дататон", "hackathon"],
    ["математический турнир", "olympiad"],
    ["конкурс сочинений", "creative"],
    ["эссе байқауы", "creative"],
    ["грант на обучение", "career"],
    ["шәкіртақы", "career"],
    ["scholarship", "career"],
    ["идеатон", "hackathon"],
    ["CTF", "hackathon"],
    ["programming contest", "hackathon"],
    ["spelling bee", "olympiad"],
    ["ораторский конкурс", "debate"],
    ["business case competition", "startup"],
    ["научная стажировка", "research"],
    ["конкурс научных проектов", "science"],
    ["summer programme", "summer"],
    ["академическая мобильность", "exchange"],
    ["service learning", "volunteer"],
    ["видеоконкурс", "creative"],
    ["photo contest", "creative"],
    ["education grant", "career"],
    ["bursary", "career"],
    ["оқыту бағдарламасы", "course"],
    ["кодинг марафон", "hackathon"],
    ["codefest", "hackathon"],
    ["школьная олимпиада", "olympiad"],
    ["модель бұұ", "mun"],
    ["дебатный турнир", "debate"],
    ["debating", "debate"],
    ["роботтар сайысы", "robotics"],
    ["first tech challenge", "robotics"],
    ["конкурс стартапов", "startup"],
    ["pitch day", "startup"],
    ["research programme", "research"],
    ["school science fair", "science"],
    ["tech camp", "bootcamp"],
    ["летние школы", "summer"],
    ["обмен школьниками", "exchange"],
    ["exchange programme", "exchange"],
    ["добровольчество", "volunteer"],
    ["социальные проекты", "social"],
    ["спортивные соревнования", "sport"],
    ["конкурс рисунков", "creative"],
    ["әдеби байқау", "creative"],
    ["өндірістік тәжірибе", "internship"],
    ["internship programme", "internship"],
    ["наставническая программа", "mentorship"],
    ["mentoring", "mentorship"],
    ["молодёжная конференция", "forum"],
    ["study overseas", "career"],
    ["университетке түсу", "career"],
    ["online training", "course"],
    ["scholarships", "career"],
    ["volunteers", "volunteer"],
    ["roboticists", "robotics"],
    ["рисование", "creative"],
    ["конкурс рисунка", "creative"],
    ["drawing contest", "creative"],
    ["painting competition", "creative"],
    ["қолөнер байқауы", "creative"],
    ["шахматный турнир", "sport"],
    ["chess tournament", "sport"],
    ["научный проект", "science"],
    ["STEM competition", "science"],
    ["день открытых дверей", "career"],
    ["university open day", "career"],
    ["apprenticeship", "internship"],
    ["волонтёрская акция", "volunteer"],
    ["IELTS preparation", "test-prep"],
    ["art residency", "creative"],
    ["арт-резиденция", "creative"],
    ["research assistant", "research"],
    ["case competition", "startup"],
    ["кейс байқауы", "startup"],
    ["online intensive", "course"],
    ["математическая олимпиада", "olympiad"],
    ["brain bee", "olympiad"],
    ["coding bootcamp", "bootcamp"],
    ["flex program", "exchange"],
    ["admissions webinar", "career"],
    ["турнир юных физиков", "olympiad"],
    ["informatics olympiad", "olympiad"],
    ["first lego league", "robotics"],
    ["соревнования роботов", "robotics"],
    ["предпринимательский конкурс", "startup"],
    ["venture competition", "startup"],
    ["футбольный турнир", "sport"],
    ["basketball tournament", "sport"],
    ["summer internship", "internship"],
    ["молодёжный саммит", "forum"],
    ["ярмарка вузов", "career"],
    ["college fair", "career"],
    ["подготовка к SAT", "test-prep"],
    ["TOEFL iBT", "test-prep"],
    ["online workshop", "course"],
  ])("maps %s to %s", (query, slug) => {
    expect(categorySlugsForSearch(query)).toEqual([slug]);
  });

  it.each(CATEGORIES)("recognizes the displayed names of $slug", (category) => {
    for (const name of [category.name, category.nameRu, category.nameKz]) {
      expect(categorySlugsForSearch(name)).toContain(category.slug);
    }
  });

  it("searches both short courses and bootcamps for an intensive", () => {
    expect(categorySlugsForSearch("интенсив")).toEqual(["bootcamp", "course"]);
  });

  it("keeps short exam acronyms exact instead of matching ordinary words", () => {
    expect(categorySlugsForSearch("SAT")).toEqual(["test-prep"]);
    expect(categorySlugsForSearch("saturday")).toEqual([]);
  });

  it("does not replace a specific organizer or title query with a broad category", () => {
    expect(categorySlugsForSearch("стажировка Freedom Bank")).toEqual([]);
    expect(categorySlugsForSearch("олимпиада по математике")).toEqual([]);
    expect(categorySlugsForSearch("конкурс")).toEqual([]);
    expect(categorySlugsForSearch("модель")).toEqual([]);
    expect(categorySlugsForSearch("грант")).toEqual([]);
    expect(categorySlugsForSearch("business")).toEqual([]);
    expect(categorySlugsForSearch("program")).toEqual([]);
    expect(categorySlugsForSearch("Freedom Bank internship")).toEqual([]);
    expect(categorySlugsForSearch("Codefest by Astana Hub")).toEqual([]);
    expect(categorySlugsForSearch("study overseas at Stanford")).toEqual([]);
  });

  it("searches the matching category alongside literal title, description and organizer", () => {
    const where = buildWhere({ q: "Робототехника" });
    expect(JSON.stringify(where)).toContain('"category":{"slug":{"in":["robotics"]}}');
    expect(JSON.stringify(where)).toContain('"title":{"contains":"Робототехника"');
  });

  it("matches tags regardless of their stored letter case", () => {
    const where = buildWhere({ q: "AI" });
    expect(JSON.stringify(where)).toContain('"tags":{"hasSome":["AI","ai"]}');
  });

  it.each([
    ["ИИ", "AI", "artificial intelligence"],
    ["жасанды интеллект", "AI", "искусственный интеллект"],
    ["coding", "программирование", "бағдарламалау"],
    ["экология", "экология", "environmental"],
    ["engineering", "инженерия", "инженерлік"],
  ])("expands the exact topic %s across languages", (query, tag, phrase) => {
    expect(topicTermsForSearch(query)?.tag).toBe(tag);
    const search = JSON.stringify(buildWhere({ q: query }));
    expect(search).toContain(`"tags":{"hasSome":`);
    expect(search).toContain(`"${tag}"`);
    expect(search).toContain(`"title":{"contains":"${phrase}"`);
  });

  it("does not broaden a specific organizer or program query into a whole topic", () => {
    expect(topicTermsForSearch("AI at Astana Hub")).toBeNull();
    expect(topicTermsForSearch("Coding at Freedom Bank")).toBeNull();
    const search = JSON.stringify(buildWhere({ q: "AI at Astana Hub" }));
    expect(search).toContain('"title":{"contains":"Astana"');
    expect(search).toContain('"title":{"contains":"Hub"');
  });

  it.each(TAGS)("expands the canonical topic tag %s", (tag) => {
    expect(topicTermsForSearch(tag)?.tag).toBe(tag);
  });

  it.each([
    ["arm wrestling", "армрестлинг"],
    ["fencing", "фехтование"],
    ["калистеника", "воркаут"],
    ["model casting", "моделинг и мода"],
    ["essay competition", "эссе и письмо"],
  ])("expands niche activity %s into the canonical tag %s", (query, tag) => {
    expect(topicTermsForSearch(query)?.tag).toBe(tag);
    expect(JSON.stringify(buildWhere({ q: query }))).toContain(`"${tag}"`);
  });

  it("matches a direction against stored source text even before it has been retagged", () => {
    const direction = ACTIVITY_DIRECTIONS.find((item) => item.slug === "streetlifting");
    expect(direction).toBeDefined();
    expect(matchesActivityDirection({
      title: "Открытый чемпионат по стритлифтингу",
      shortDescription: "Подтягивания и брусья с весом",
      fullDescription: "Регистрация открыта",
      tags: [],
    }, direction!)).toBe(true);
  });

  it("matches significant words across a title when the phrase is not contiguous", () => {
    const where = buildWhere({ q: "стажировка в Freedom Bank" });
    const search = JSON.stringify(where);
    expect(search).toContain('"title":{"contains":"стажировка в Freedom Bank"');
    expect(search).toContain('"title":{"contains":"стажировка"');
    expect(search).toContain('"title":{"contains":"Freedom"');
    expect(search).toContain('"title":{"contains":"Bank"');
    expect(search).not.toContain('"title":{"contains":"в"');
  });
});

export type ActivityDirection = {
  slug: string;
  group: "creative" | "sport";
  tag: string;
  nameRu: string;
  nameKz: string;
  name: string;
  descriptionRu: string;
  icon: string;
  aliases: readonly string[];
};

export const ACTIVITY_DIRECTIONS: readonly ActivityDirection[] = [
  {
    slug: "writing",
    group: "creative",
    tag: "эссе и письмо",
    nameRu: "Эссе и письмо",
    nameKz: "Эссе және жазу",
    name: "Essay and writing",
    descriptionRu: "Эссе, рассказы, поэзия, журналистика и литературные конкурсы",
    icon: "PenLine",
    aliases: ["эссе", "сочинение", "литературный конкурс", "writing competition", "essay competition", "essay contest", "poetry contest", "журналистика", "эссе байқауы", "әдеби байқау"],
  },
  {
    slug: "vocal-music",
    group: "creative",
    tag: "вокал и музыка",
    nameRu: "Вокал и музыка",
    nameKz: "Вокал және музыка",
    name: "Vocal and music",
    descriptionRu: "Вокальные, инструментальные и музыкальные конкурсы",
    icon: "Mic2",
    aliases: ["вокал", "вокальный конкурс", "конкурс певцов", "музыкальный конкурс", "singing competition", "vocal competition", "music competition", "ән байқауы", "вокалдық байқау"],
  },
  {
    slug: "dance-stage",
    group: "creative",
    tag: "танец и сцена",
    nameRu: "Танец, театр и сцена",
    nameKz: "Би, театр және сахна",
    name: "Dance, theatre and stage",
    descriptionRu: "Хореография, театр, актёрское мастерство и сценические фестивали",
    icon: "Drama",
    aliases: ["танцевальный конкурс", "конкурс танцев", "хореография", "театр", "актерский конкурс", "актёрский конкурс", "dance competition", "theatre festival", "performing arts", "би байқауы", "театр фестивалі"],
  },
  {
    slug: "modeling-fashion",
    group: "creative",
    tag: "моделинг и мода",
    nameRu: "Моделинг и мода",
    nameKz: "Модельдік өнер және сән",
    name: "Modeling and fashion",
    descriptionRu: "Кастинги, показы, конкурсы моделей и fashion-проекты",
    icon: "Camera",
    aliases: ["моделинг", "модельный конкурс", "конкурс моделей", "кастинг моделей", "fashion competition", "fashion casting", "model casting", "модельдік байқау", "сән байқауы"],
  },
  {
    slug: "visual-media",
    group: "creative",
    tag: "визуальное искусство",
    nameRu: "Фото, видео и дизайн",
    nameKz: "Фото, видео және дизайн",
    name: "Photo, video and design",
    descriptionRu: "Фотография, кино, иллюстрация, живопись и дизайн",
    icon: "Palette",
    aliases: ["фотоконкурс", "видеоконкурс", "конкурс рисунков", "иллюстрация", "дизайн конкурс", "photo competition", "film competition", "art contest", "сурет байқауы", "фото байқауы"],
  },
  {
    slug: "fencing",
    group: "sport",
    tag: "фехтование",
    nameRu: "Фехтование",
    nameKz: "Семсерлесу",
    name: "Fencing",
    descriptionRu: "Турниры, первенства и открытые наборы по фехтованию",
    icon: "Swords",
    aliases: ["фехтование", "фехтовальный турнир", "fencing", "fencing championship", "семсерлесу"],
  },
  {
    slug: "armwrestling",
    group: "sport",
    tag: "армрестлинг",
    nameRu: "Армрестлинг",
    nameKz: "Қол күресі",
    name: "Armwrestling",
    descriptionRu: "Любительские и профессиональные турниры по борьбе на руках",
    icon: "Dumbbell",
    aliases: ["армрестлинг", "армспорт", "борьба на руках", "armwrestling", "arm wrestling", "қол күресі"],
  },
  {
    slug: "streetlifting",
    group: "sport",
    tag: "стритлифтинг",
    nameRu: "Стритлифтинг",
    nameKz: "Стритлифтинг",
    name: "Streetlifting",
    descriptionRu: "Соревнования по подтягиваниям и отжиманиям с отягощением",
    icon: "Dumbbell",
    aliases: ["стритлифтинг", "streetlifting", "street lifting", "подтягивания с отягощением", "отжимания на брусьях с весом"],
  },
  {
    slug: "workout",
    group: "sport",
    tag: "воркаут",
    nameRu: "Воркаут и калистеника",
    nameKz: "Воркаут және калистеника",
    name: "Workout and calisthenics",
    descriptionRu: "Уличная гимнастика, фристайл и силовые элементы",
    icon: "PersonStanding",
    aliases: ["воркаут", "street workout", "калистеника", "calisthenics", "воркаут баттл", "уличная гимнастика"],
  },
  {
    slug: "martial-arts",
    group: "sport",
    tag: "единоборства",
    nameRu: "Единоборства",
    nameKz: "Жекпе-жек",
    name: "Martial arts",
    descriptionRu: "Бокс, борьба, дзюдо, карате, таэквондо и другие дисциплины",
    icon: "Medal",
    aliases: ["единоборства", "боевые искусства", "бокс", "дзюдо", "карате", "таэквондо", "грэпплинг", "martial arts", "boxing tournament", "жекпе-жек"],
  },
  {
    slug: "strength-sports",
    group: "sport",
    tag: "силовой спорт",
    nameRu: "Силовые виды",
    nameKz: "Күш спорты",
    name: "Strength sports",
    descriptionRu: "Пауэрлифтинг, гиревой спорт, тяжёлая атлетика и силовой экстрим",
    icon: "Trophy",
    aliases: ["пауэрлифтинг", "гиревой спорт", "тяжелая атлетика", "тяжёлая атлетика", "силовой экстрим", "powerlifting", "weightlifting", "kettlebell sport", "ауыр атлетика"],
  },
] as const;

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function activityDirectionName(direction: ActivityDirection, locale: string): string {
  return locale === "kk" ? direction.nameKz : locale === "en" ? direction.name : direction.nameRu;
}

export function matchesActivityDirection(
  opportunity: { title: string; shortDescription: string; fullDescription: string; tags: string[] },
  direction: ActivityDirection,
): boolean {
  const haystack = normalize([
    opportunity.title,
    opportunity.shortDescription,
    opportunity.fullDescription,
    ...opportunity.tags,
  ].join(" "));
  return [direction.tag, ...direction.aliases].some((alias) => haystack.includes(normalize(alias)));
}

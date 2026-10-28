import { CATEGORIES } from "./constants";

const CATEGORY_ALIASES: Record<string, string[]> = {
  hackathon: ["хакатон", "хакатоны", "дататон", "идеатон", "кодинг марафон", "соревнование по программированию", "конкурс по программированию", "бағдарламалау марафоны", "бағдарламалау жарысы", "hackathon", "hackathons", "datathon", "ideathon", "hack fest", "codefest", "code jam", "coding challenge", "coding contest", "programming contest", "capture the flag", "ctf"],
  olympiad: ["олимпиада", "олимпиады", "олимпиадасы", "школьная олимпиада", "математическая олимпиада", "математический турнир", "турнир юных физиков", "пәндік олимпиада", "зияткерлік олимпиада", "математика олимпиадасы", "olympiad", "olympiads", "academic olympiad", "school olympiad", "math challenge", "spelling bee", "brain bee", "physics olympiad", "biology olympiad", "informatics olympiad", "chemistry olympiad", "international young physicists tournament"],
  mun: ["модель оон", "модель бун", "модель бұұ", "модель объединенных наций", "біріккен ұлттар моделі", "model un", "model united nations", "mun", "mun conference"],
  debate: ["дебаты", "дебат", "дебатный турнир", "ораторский конкурс", "конкурс публичных выступлений", "пікірсайыс", "пікірталас", "пікірталас турнирі", "шешендік өнер байқауы", "debate", "debates", "debating", "debate tournament", "public speaking contest", "speech competition"],
  robotics: ["робототехника", "робототехнике", "робототехники", "роботика", "роботтар жарысы", "роботтар сайысы", "соревнования роботов", "robotics", "robot", "robot competition", "first tech challenge", "first lego league", "fll", "vex robotics", "robotics challenge"],
  startup: ["стартап", "стартапы", "конкурс стартапов", "предпринимательский конкурс", "кәсіпкерлік", "кәсіпкерлік байқау", "бизнес идеи", "бизнес идеи конкурс", "бизнес-идеялар байқауы", "конкурс бизнес-планов", "кейс-чемпионат", "кейс байқауы", "питчинг проектов", "стартап акселератор", "startup", "startups", "акселератор", "business plan competition", "business case competition", "case competition", "investment competition", "pitch competition", "pitch battle", "pitch day", "startup accelerator", "entrepreneurship challenge", "venture competition"],
  research: ["исследование", "исследования", "исследовательская программа", "исследовательская стажировка", "научная стажировка", "зерттеу", "ғылыми зерттеу", "зерттеу бағдарламасы", "зерттеу ассистенті", "research", "research program", "research programme", "summer research", "research internship", "research fellowship", "research assistant", "research mentorship"],
  "test-prep": ["sat", "digital sat", "sat exam", "sat test", "sat preparation", "подготовка к sat", "ielts", "ielts academic", "ielts exam", "ielts test", "ielts preparation", "подготовка к ielts", "toefl", "toefl ibt", "toefl preparation", "подготовка к toefl", "english proficiency exam", "языковой экзамен", "международный экзамен", "тестке дайындық"],
  science: ["наука", "научный конкурс", "научная ярмарка", "научный проект", "конкурс научных проектов", "ғылым", "ғылыми жоба", "ғылыми жоба конкурсы", "ғылыми жобалар байқауы", "science fair", "school science fair", "science competition", "science project competition", "stem competition", "stem challenge"],
  bootcamp: ["буткемп", "интенсив", "технологический лагерь", "оқу лагері", "программалау лагері", "технологиялық лагерь", "bootcamp", "boot camp", "coding camp", "coding bootcamp", "tech camp"],
  summer: ["летняя школа", "летние школы", "летний лагерь", "летняя академия", "летняя программа", "жазғы мектеп", "жазғы лагерь", "жазғы академия", "жазғы бағдарлама", "summer school", "summer schools", "summer camp", "summer academy", "summer program", "summer programme"],
  exchange: ["обмен", "программа обмена", "обмен школьниками", "академический обмен", "учебный обмен", "академическая мобильность", "алмасу", "халықаралық алмасу", "оқушылар алмасуы", "exchange", "exchange program", "exchange programme", "student exchange", "youth exchange", "academic mobility", "exchange year", "flex program"],
  volunteer: ["волонтерство", "волонтёрство", "волонтер", "волонтёр", "добровольчество", "волонтёрская программа", "волонтёрский набор", "волонтёрская акция", "волонтерская акция", "еріктілік", "еріктілер", "еріктілер бағдарламасы", "еріктілерге қабылдау", "еріктілер акциясы", "volunteering", "volunteer", "volunteer program", "volunteer event", "community service", "service learning"],
  social: ["социальный проект", "социальные проекты", "социальное предпринимательство", "әлеуметтік жоба", "әлеуметтік жобалар", "қоғамдық жоба", "social impact", "social project", "social innovation", "impact challenge"],
  sport: ["спорт", "спортивный турнир", "спортивные соревнования", "школьная лига", "шахматный турнир", "футбольный турнир", "баскетбольный турнир", "фехтование", "армрестлинг", "стритлифтинг", "воркаут", "калистеника", "пауэрлифтинг", "единоборства", "спорттық жарыс", "спорттық турнир", "шахмат жарысы", "шахмат турнирі", "мектеп лигасы", "семсерлесу", "қол күресі", "sport", "sports", "sports tournament", "chess tournament", "school league", "football tournament", "basketball tournament", "fencing", "armwrestling", "streetlifting", "street workout", "calisthenics", "powerlifting", "martial arts"],
  creative: ["творчество", "творческий конкурс", "рисование", "конкурс рисунка", "конкурс рисунков", "конкурс по рисованию", "конкурс эссе", "конкурс сочинений", "литературный конкурс", "вокальный конкурс", "танцевальный конкурс", "театральный конкурс", "модельный конкурс", "кастинг моделей", "фотоконкурс", "видеоконкурс", "конкурс короткометражек", "поэтический конкурс", "арт-резиденция", "арт резиденция", "резиденция для художников", "шығармашылық", "өнер байқауы", "сурет байқауы", "қолөнер байқауы", "әдеби байқау", "эссе байқауы", "фото байқауы", "ән байқауы", "би байқауы", "модельдік байқау", "creative contest", "art contest", "art residency", "artist residency", "creative residency", "drawing contest", "painting competition", "poster contest", "illustration competition", "design challenge", "music competition", "essay competition", "film competition", "photo contest", "photo competition", "photography competition", "short film contest", "writing competition", "vocal competition", "dance competition", "theatre festival", "fashion competition", "model casting", "k-culture contest"],
  internship: ["стажировка", "стажировки", "летняя стажировка", "практика в компании", "учебная практика", "тағылымдама", "өндірістік тәжірибе", "internship", "internships", "internship program", "internship programme", "summer internship", "traineeship", "apprenticeship", "work placement"],
  mentorship: ["менторство", "ментор", "наставничество", "наставник", "наставническая программа", "тәлімгерлік", "тәлімгерлік бағдарлама", "mentorship", "mentor", "mentoring", "mentoring program", "coaching program"],
  forum: ["форум", "конференция", "молодёжный форум", "молодёжная конференция", "молодёжный саммит", "жастар форумы", "жастар конференциясы", "forum", "conference", "summit", "youth forum", "youth summit", "student summit"],
  career: ["карьера", "профориентация", "стипендия", "стипендиальная программа", "грант на обучение", "гранты на обучение", "грант на учебу", "образовательный грант", "день открытых дверей", "университетский день открытых дверей", "ярмарка вузов", "университетская ярмарка", "оқу гранты", "шәкіртақы", "поступление за рубеж", "подготовка к поступлению", "кәсіптік бағдар", "университетке түсу", "шетелге оқуға түсу", "career guidance", "career day", "study abroad", "study overseas", "college admissions", "university admissions", "university application", "university open day", "college open day", "college fair", "university fair", "admissions webinar", "scholarship", "fully funded scholarship", "education grant", "bursary"],
  course: ["курс", "курсы", "курсы онлайн", "вебинар", "мастер класс", "мастер-класс", "интенсив", "тренинг", "образовательный семинар", "онлайн мастер-класс", "шеберлік сабағы", "оқу курсы", "оқыту бағдарламасы", "course", "courses", "online course", "online training", "intensive", "online intensive", "workshop", "online workshop", "masterclass", "training program", "exam preparation course", "webinar"],
};

const CATEGORY_STEMS: Record<string, string[]> = {
  hackathon: ["хакатон", "дататон", "идеатон", "hackathon", "datathon", "ideathon"],
  olympiad: ["олимпиад", "olympiad"],
  debate: ["дебат", "пікірсай", "debat"],
  robotics: ["робототех", "роботик", "robotic"],
  startup: ["стартап", "акселерат"],
  research: ["исследовательск", "зерттеу", "research"],
  "test-prep": ["sat", "ielts", "toefl"],
  science: ["научн", "ғылым", "scientific"],
  bootcamp: ["буткемп", "интенсив", "bootcamp"],
  summer: ["летн", "жазғы"],
  exchange: ["обмен", "алмасу", "exchange"],
  volunteer: ["волонтер", "волонтёр", "ерікт", "volunteer"],
  social: ["социальн", "әлеумет"],
  sport: ["спорт", "шахмат", "фехт", "армрестл", "стритлифт", "воркаут", "калистен", "пауэрлифт", "единобор", "sport", "chess", "fencing", "armwrest", "streetlift", "workout", "calisthen", "powerlift"],
  creative: ["творческ", "рисован", "шығармаш", "фотоконкурс", "видеоконкурс", "эссе", "вокал", "танцев", "хореограф", "моделинг", "кастинг модел", "drawing", "painting", "essay", "vocal", "dance", "fashion"],
  internship: ["стажиров", "тағылымдам", "internship", "traineeship", "apprenticeship"],
  mentorship: ["ментор", "наставнич", "тәлімгер", "mentorship", "mentoring"],
  forum: ["форум", "конференц", "conference"],
  career: ["профориент", "карьер", "мансап", "стипенд", "шәкіртақ", "scholarship", "bursar"],
  course: ["курс", "вебинар", "воркшоп", "интенсив", "intensive", "workshop", "webinar"],
};

const TOPIC_ALIASES: Record<string, string[]> = {
  AI: ["ии", "искусственный интеллект", "жасанды интеллект", "artificial intelligence", "machine learning", "машинное обучение"],
  программирование: ["programming", "coding", "бағдарламалау", "кодинг", "разработка программ"],
  медицина: ["medicine", "medical", "healthcare", "медицина", "медициналық", "здравоохранение"],
  экономика: ["economics", "economy", "экономика", "экономикалық"],
  экология: ["ecology", "environment", "environmental", "sustainability", "экология", "окружающая среда", "қоршаған орта", "экологиялық"],
  предпринимательство: ["entrepreneurship", "кәсіпкерлік", "предпринимательство"],
  лидерство: ["leadership", "leader", "лидерство", "көшбасшылық"],
  "публичные выступления": ["public speaking", "speech", "ораторское искусство", "публичные выступления", "шешендік өнер"],
  исследования: ["research", "зерттеу", "исследования"],
  математика: ["mathematics", "math", "математика", "математикасы"],
  физика: ["physics", "физика", "физикасы"],
  химия: ["chemistry", "химия", "химиясы"],
  биология: ["biology", "биология", "биологиясы"],
  дизайн: ["design", "дизайн", "дизайнерлік"],
  спорт: ["sport", "sports", "спорт", "спорттық"],
  волонтёрство: ["volunteering", "volunteer", "волонтерство", "волонтёрство", "еріктілік"],
  "международные отношения": ["international relations", "международные отношения", "халықаралық қатынастар"],
  робототехника: ["robotics", "robotic", "робототехника", "роботика", "робототехникасы"],
  финансы: ["finance", "financial literacy", "финансы", "қаржы", "қаржылық сауаттылық"],
  инженерия: ["engineering", "инженерия", "инженерлік"],
  SAT: ["sat", "digital sat", "sat exam", "sat test", "подготовка к sat"],
  IELTS: ["ielts", "ielts academic", "ielts exam", "ielts test", "подготовка к ielts"],
  TOEFL: ["toefl", "toefl ibt", "toefl exam", "подготовка к toefl"],
  "эссе и письмо": ["эссе", "сочинение", "литературный конкурс", "essay", "essay competition", "writing competition", "эссе байқауы", "әдеби байқау"],
  "вокал и музыка": ["вокал", "музыкальный конкурс", "vocal", "singing competition", "music competition", "ән байқауы"],
  "танец и сцена": ["танец", "танцевальный конкурс", "хореография", "театр", "dance competition", "theatre festival", "performing arts", "би байқауы"],
  "моделинг и мода": ["моделинг", "модельный конкурс", "кастинг моделей", "fashion competition", "model casting", "модельдік байқау"],
  "визуальное искусство": ["фотоконкурс", "видеоконкурс", "конкурс рисунков", "photo competition", "film competition", "art contest", "фото байқауы"],
  фехтование: ["фехтование", "fencing", "семсерлесу"],
  армрестлинг: ["армрестлинг", "армспорт", "борьба на руках", "armwrestling", "arm wrestling", "қол күресі"],
  стритлифтинг: ["стритлифтинг", "streetlifting", "street lifting"],
  воркаут: ["воркаут", "street workout", "калистеника", "calisthenics"],
  единоборства: ["единоборства", "боевые искусства", "martial arts", "жекпе-жек"],
  "силовой спорт": ["пауэрлифтинг", "гиревой спорт", "тяжелая атлетика", "powerlifting", "weightlifting", "ауыр атлетика"],
};

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

export function categorySlugsForSearch(query: string): string[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const oneWord = !normalized.includes(" ");
  return Object.entries(CATEGORY_ALIASES)
    .filter(([slug, aliases]) => {
      const category = CATEGORIES.find((item) => item.slug === slug);
      return normalize(slug) === normalized ||
        [category?.name, category?.nameRu, category?.nameKz, ...aliases]
          .some((alias) => alias && normalize(alias) === normalized) ||
        (oneWord && CATEGORY_STEMS[slug]?.some((stem) => /^[a-z0-9]+$/i.test(stem) && stem.length <= 5
          ? normalized === stem
          : normalized.startsWith(stem)));
    })
    .map(([slug]) => slug);
}

export function topicTermsForSearch(query: string): { tag: string; terms: string[] } | null {
  const normalized = normalize(query);
  if (!normalized) return null;
  const match = Object.entries(TOPIC_ALIASES).find(([tag, aliases]) =>
    [tag, ...aliases].some((alias) => normalize(alias) === normalized));
  return match ? { tag: match[0], terms: match[1] } : null;
}

import "server-only";
import type { Candidate } from "./ingest";
import { KZ_UTC_OFFSET_HOURS } from "./utils";

/**
 * Free-text → ingest candidate, for posts a moderator forwards to the bot.
 *
 * This is the deterministic half of the same rules the Python collector uses on
 * MTProto posts (`apps/parser/tgcollect/extract.py`). It is duplicated
 * deliberately: the bot path must keep working when the Python service is not
 * running, and a forwarded post is exactly one message — not worth a round trip
 * to another process. The two implementations are pinned by tests on both
 * sides so they cannot quietly diverge.
 */

const CATEGORY_KEYWORDS: [string, string[]][] = [
  ["hackathon", ["хакатон", "hackathon", "hack day", "codefest", "coding challenge", "code jam", "coding marathon", "хакатонға", "hackalem", "бағдарламалау марафоны"]],
  ["olympiad", ["олимпиад", "olympiad", "math challenge", "mathematics challenge", "academic competition", "academic olympiad", "brain bee", "пәндік олимпиада", "пән олимпиада", "математикалық олимпиада", "зияткерлік олимпиада"]],
  ["mun", ["model united nations", "model un", "модель оон", "модель бұұ", "mun conference", "модель организации объединённых наций", "модель объединенных наций", "біріккен ұлттар моделі"]],
  ["debate", ["дебат", "debate", "debating championship", "debate tournament", "debate cup", "пікірсайыс", "пікірталас турнирі", "парламентские дебаты"]],
  ["robotics", ["робототех", "роботик", "robotics", "robot contest", "robot competition", "robotics challenge", "first tech", "first robotics", "ftc", "frc", "vex robotics", "робот жарысы", "роботтар жарысы"]],
  ["startup", ["стартап", "startup", "акселерат", "инкубатор", "pitch competition", "pitch battle", "startup challenge", "talent pitch", "business plan competition", "entrepreneurship challenge", "питчинг", "кәсіпкерлік байқау", "бизнес-идеялар байқауы"]],
  ["research", ["исследовательск", "научно-исследов", "исследовательская стажировка", "research program", "research internship", "research scholar", "research fellowship", "summer research", "зерттеу бағдарлам", "ғылыми-зерттеу"]],
  ["test-prep", ["digital sat", "sat preparation", "sat prep", "sat exam", "sat test", "подготовка к sat", "ielts academic", "ielts preparation", "ielts prep", "ielts exam", "ielts test", "подготовка к ielts", "toefl ibt", "toefl preparation", "toefl prep", "toefl exam", "подготовка к toefl", "языковой экзамен", "международный экзамен", "sat", "ielts", "toefl"]],
  ["science", ["научн", "science fair", "science olympiad", "science competition", "stem competition", "stem challenge", "конкурс проектов", "научная ярмарка", "ғылыми жоба", "ғылыми жоба конкурсы", "ғылым байқауы", "ғылыми жобалар байқауы"]],
  ["bootcamp", ["буткемп", "bootcamp", "coding camp", "coding bootcamp", "интенсив", "оқу лагері", "технологиялық лагерь", "программалау лагері"]],
  ["summer", ["летняя школа", "летний лагерь", "летняя академия", "summer school", "summer program", "summer academy", "summer camp", "жазғы мектеп", "жазғы лагерь", "жазғы академия"]],
  ["exchange", ["программа обмена", "обмен студент", "академический обмен", "exchange program", "student exchange", "youth exchange", "exchange scholarship", "алмасу бағдарлам", "халықаралық алмасу", "flex program"]],
  ["volunteer", ["волонт", "волонтерская программа", "волонтёрская программа", "волонтёрская акция", "волонтерская акция", "volunteer", "volunteer event", "volunteering opportunity", "community service", "community volunteering", "еріктілер", "еріктілік", "ерікті бол", "еріктілер бағдарламасы", "еріктілер акциясы"]],
  ["social", ["социальный проект", "социальных проектов", "социальное предпринимательство", "social impact", "social project", "social innovation challenge", "impact challenge", "әлеуметтік жоба", "әлеуметтік жобалар байқауы", "қоғамдық жоба"]],
  ["sport", ["спортивный турнир", "спортивн", "чемпионат", "первенств", "турнир по", "школьная лига", "шахматный турнир", "фехтование", "фехтовальный турнир", "армрестлинг", "армспорт", "борьба на руках", "стритлифтинг", "воркаут", "калистеника", "пауэрлифтинг", "гиревой спорт", "тяжёлая атлетика", "тяжелая атлетика", "единоборства", "бокс", "дзюдо", "карате", "таэквондо", "грэпплинг", "fencing", "armwrestling", "arm wrestling", "streetlifting", "street workout", "calisthenics", "powerlifting", "weightlifting", "martial arts", "chess tournament", "sports tournament", "youth sports championship", "спорттық жарыс", "спорттық турнир", "шахмат жарысы", "шахмат турнирі", "жастар чемпионаты", "семсерлесу", "қол күресі", "ауыр атлетика"]],
  ["creative", ["творческ", "конкурс рисунк", "конкурс по рисованию", "drawing contest", "painting competition", "poster contest", "illustration competition", "фотоконкурс", "музыкальн", "вокал", "вокальный конкурс", "конкурс певцов", "танцевальный конкурс", "конкурс танцев", "хореография", "театральный конкурс", "актерский конкурс", "актёрский конкурс", "моделинг", "модельный конкурс", "конкурс моделей", "кастинг моделей", "конкурс эссе", "литературный конкурс", "art contest", "design contest", "essay contest", "essay competition", "short film contest", "vocal competition", "singing competition", "dance competition", "theatre festival", "performing arts", "fashion competition", "fashion casting", "model casting", "k-culture", "культурный конкурс", "шығармашылық байқау", "өнер байқауы", "сурет байқауы", "қолөнер байқауы", "музыкалық конкурс", "ән байқауы", "вокалдық байқау", "би байқауы", "театр фестивалі", "модельдік байқау", "сән байқауы"]],
  ["internship", ["стажировк", "учебная практика", "internship", "intern program", "traineeship", "apprenticeship", "industrial internship", "work placement", "тәжірибеден өту", "тағылымдам"]],
  ["mentorship", ["ментор", "наставник", "наставничеств", "mentorship", "mentoring program", "peer mentoring", "coaching program", "тәлімгер", "тәлімгерлік бағдарлама", "тәлімгерлік"]],
  ["forum", ["форум", "forum", "summit", "конференц", "conference", "youth summit", "student summit", "жастар форумы", "жастар конференциясы"]],
  ["career", ["карьер", "профориент", "день открытых дверей", "career guidance", "career day", "university open day", "college open day", "study abroad", "college admissions", "university admissions", "admissions webinar", "подготовка к поступлению", "поступление за рубеж", "университетке түсу", "шетелге оқуға түсу", "кәсіптік бағдар"]],
  ["course", ["курс", "course", "онлайн курс", "online course", "вебинар", "мастер-класс", "masterclass", "workshop", "воркшоп", "exam preparation course", "оқу курсы", "шеберлік сабағы"]],
];

const ACTIVITY_TAG_KEYWORDS: [string, string[]][] = [
  ["SAT", ["digital sat", "sat preparation", "sat prep", "sat exam", "sat test", "подготовка к sat"]],
  ["IELTS", ["ielts academic", "ielts preparation", "ielts prep", "ielts exam", "ielts test", "подготовка к ielts"]],
  ["TOEFL", ["toefl ibt", "toefl preparation", "toefl prep", "toefl exam", "подготовка к toefl"]],
  ["эссе и письмо", ["эссе", "сочинение", "литературный конкурс", "writing competition", "essay competition", "essay contest", "poetry contest", "эссе байқауы", "әдеби байқау"]],
  ["вокал и музыка", ["вокал", "вокальный конкурс", "конкурс певцов", "музыкальный конкурс", "singing competition", "vocal competition", "music competition", "ән байқауы", "вокалдық байқау"]],
  ["танец и сцена", ["танцевальный конкурс", "конкурс танцев", "хореография", "театральный конкурс", "актерский конкурс", "актёрский конкурс", "dance competition", "theatre festival", "performing arts", "би байқауы", "театр фестивалі"]],
  ["моделинг и мода", ["моделинг", "модельный конкурс", "конкурс моделей", "кастинг моделей", "fashion competition", "fashion casting", "model casting", "модельдік байқау", "сән байқауы"]],
  ["визуальное искусство", ["фотоконкурс", "видеоконкурс", "конкурс рисунков", "иллюстрация", "дизайн конкурс", "photo competition", "film competition", "art contest", "сурет байқауы", "фото байқауы"]],
  ["фехтование", ["фехтован", "fencing", "fencing championship", "семсерлесу"]],
  ["армрестлинг", ["армрестлинг", "армспорт", "борьба на руках", "armwrestling", "arm wrestling", "қол күресі"]],
  ["стритлифтинг", ["стритлифтинг", "streetlifting", "street lifting", "подтягивания с отягощением", "отжимания на брусьях с весом"]],
  ["воркаут", ["воркаут", "street workout", "калистеника", "calisthenics", "уличная гимнастика"]],
  ["единоборства", ["единоборства", "боевые искусства", "бокс", "дзюдо", "карате", "таэквондо", "грэпплинг", "martial arts", "boxing tournament", "жекпе-жек"]],
  ["силовой спорт", ["пауэрлифтинг", "гиревой спорт", "тяжёлая атлетика", "тяжелая атлетика", "силовой экстрим", "powerlifting", "weightlifting", "kettlebell sport", "ауыр атлетика"]],
];

export function extractActivityTags(text: string): string[] {
  const low = text.toLocaleLowerCase("ru").replaceAll("ё", "е");
  return ACTIVITY_TAG_KEYWORDS
    .filter(([, keywords]) => keywords.some((keyword) => low.includes(keyword.toLocaleLowerCase("ru").replaceAll("ё", "е"))))
    .map(([tag]) => tag);
}

const MONTHS: Record<string, number> = {
  января: 1, январь: 1, февраля: 2, февраль: 2, марта: 3, март: 3,
  апреля: 4, апрель: 4, мая: 5, май: 5, июня: 6, июнь: 6,
  июля: 7, июль: 7, августа: 8, август: 8, сентября: 9, сентябрь: 9,
  октября: 10, октябрь: 10, ноября: 11, ноябрь: 11, декабря: 12, декабрь: 12,
  қаңтар: 1, ақпан: 2, наурыз: 3, сәуір: 4, мамыр: 5, маусым: 6,
  шілде: 7, тамыз: 8, қыркүйек: 9, қазан: 10, қараша: 11, желтоқсан: 12,
};

const DEADLINE_MARKERS = [
  "дедлайн", "deadline", "срок подачи", "приём заявок до", "прием заявок до",
  "заявки до", "регистрация до", "подать до", "успей до", "өтінім", "мерзім",
  "қабылдау мерзімі", "тіркеу мерзімі", "registration closes", "apply by", "applications close",
];

const SIGNAL_WORDS = [
  "заявк", "регистрац", "дедлайн", "deadline", "конкурс", "олимпиад",
  "хакатон", "стажировк", "грант", "программ", "набор", "участник",
  "подач", "подать", "apply", "стипенди", "отбор", "сертификат",
  "соревнован", "турнир", "летняя школа",
  "өтінім", "байқау", "тіркеу", "қабылдау", "жарыс", "олимпиада", "тағылымдама", "жазғы мектеп",
  "applications", "registration", "scholarship", "fellowship", "competition",
];

const ACTION_MARKERS = [
  "открыт набор", "открываем набор", "открыта регистрация", "регистрац", "прием заявок",
  "приём заявок", "заявки принима", "подать заявку", "подача заявок", "заполнить анкет",
  "apply now", "applications open", "call for applications", "приглашаем к участию",
  "өтінім қабылдау", "тіркеу ашылды", "тіркелу ашық", "өтінім қабылданады",
  "өтінім беру", "өтініш қабылдау", "register now", "registration open", "apply by",
  "applications are open", "now accepting applications", "open call", "apply here", "register here", "submissions open",
  "подайте заявку", "принимаем заявки", "отбор открыт", "приём открыт", "прием открыт", "запись открыта",
  "өтінімдер қабылданады", "қатысуға шақырамыз", "құжат қабылдау", "қабылдау басталды", "тіркеліңіз",
];

const RETROSPECTIVE_MARKERS = [
  "состоялся", "состоялась", "состоялось", "прошел ", "прошёл ", "прошла ",
  "завершился", "завершилась", "подвели итоги", "объявлены победители", "наградили победителей",
  "прошло ", "стал партнером", "стала партнером", "вышел в финал", "вышла в финал",
];

const CITY_STEMS: [string, string][] = [
  ["алмат", "Алматы"], ["астан", "Астана"], ["шымкент", "Шымкент"],
  ["караганд", "Караганда"], ["актоб", "Актобе"], ["тараз", "Тараз"],
  ["павлодар", "Павлодар"], ["усть-каменогорск", "Усть-Каменогорск"],
  ["семей", "Семей"], ["атырау", "Атырау"], ["костанай", "Костанай"],
  ["кызылорд", "Кызылорда"], ["уральск", "Уральск"],
  ["петропавловск", "Петропавловск"], ["актау", "Актау"],
];

const APPLY_HOSTS = new Set(["forms.gle", "tally.so", "typeform.com", "jotform.com"]);
const APPLY_PATH_RE = /\/(?:apply|register|registration|application|form)(?:[/?#-]|$)/i;
const APPLY_LABEL_RE = /(?:регистрац[\p{L}\p{N}_]*|подать\s+заявк[\p{L}\p{N}_]*|подача\s+заявок|заявк[\p{L}\p{N}_]*|заполнить\s+(?:форм[\p{L}\p{N}_]*|анкет[\p{L}\p{N}_]*)|apply|application|sign\s*up|өтінім[\p{L}\p{N}_]*|тіркел[\p{L}\p{N}_]*)\s*(?:по\s+ссылке\s*)?(?:здесь|тут|here)?\s*[:—–-]?\s*$/iu;

const URL_RE = /https?:\/\/[^\s<>()[\]«»"]+/gi;
const WORD_DATE_RE = new RegExp(`\\b(\\d{1,2})\\s+(${Object.keys(MONTHS).join("|")})(?:ға|ге|да|де|та|те)?(?:\\s+(\\d{4}))?`, "gi");
const NUMERIC_DATE_RE = /\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/g;
const GRADE_RANGE_RE = /(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(?:класс|кл\.|сынып)/i;
const AGE_RANGE_RE = /(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(?:лет|года|жас)/i;
const PRICE_RE = /(\d[\d\s  ]{2,})\s*(?:₸|тг|тенге|kzt)/i;
const FREE_RE = /(бесплатн|free|тегін|без оплаты)/i;
const ONLINE_RE = /(онлайн|online|дистанционн|zoom)/i;
const OFFLINE_RE = /(офлайн|offline|очно|очный)/i;

export function findApplicationUrl(text: string): string | undefined {
  const matches = [...text.matchAll(URL_RE)];
  for (const match of matches) {
    const lineStart = text.lastIndexOf("\n", match.index) + 1;
    if (APPLY_LABEL_RE.test(text.slice(lineStart, match.index).trim())) {
      return match[0].replace(/[.,;)]+$/, "");
    }
  }
  for (const match of matches) {
    const value = match[0].replace(/[.,;)]+$/, "");
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      if (APPLY_HOSTS.has(host) || host.endsWith(".typeform.com") || host.endsWith(".jotform.com") ||
          (host === "docs.google.com" && url.pathname.startsWith("/forms/")) || APPLY_PATH_RE.test(url.pathname)) {
        return value;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

/** Cheap gate: most forwarded messages are not opportunities. */
export function looksLikeOpportunity(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 45) return false;
  const low = trimmed.toLowerCase();
  if (["бесплатные материалы", "подборка материалов", "скачать гайд"].some((marker) => low.includes(marker))
    && !DEADLINE_MARKERS.some((marker) => low.includes(marker))) return false;
  const hasAction = ACTION_MARKERS.some((marker) => low.includes(marker)) || DEADLINE_MARKERS.some((marker) => low.includes(marker));
  if (RETROSPECTIVE_MARKERS.some((marker) => low.includes(marker)) && !hasAction) return false;
  const hits = SIGNAL_WORDS.filter((w) => low.includes(w)).length;
  const hasType = guessCategory(trimmed).confidence > 0.35;
  const hasDeadlinePhrase = DEADLINE_MARKERS.some((m) => low.includes(m));
  const hasLink = /https?:\/\//i.test(trimmed);
  if (hasAction && hasType && hasLink) return true;
  if (trimmed.length >= 80 && hits >= 2 && hasAction) return true;
  return hits >= 1 && hasDeadlinePhrase && hasLink && trimmed.length >= 120;
}

/** A bare "20 марта" means the next 20 March at or after the reference date. */
function yearFor(month: number, day: number, reference: Date): number {
  const year = reference.getUTCFullYear();
  const candidate = Date.UTC(year, month - 1, Math.min(day, 28));
  return candidate < reference.getTime() - 864e5 && reference.getUTCMonth() + 1 >= 10 && month <= 3
    ? year + 1
    : year;
}

type Found = { index: number; date: Date };

function validDate(year: number, month: number, day: number): Date | null {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() + 1 === month && value.getUTCDate() === day
    ? value
    : null;
}

function findDates(text: string, reference: Date): Found[] {
  const out: Found[] = [];

  for (const m of text.matchAll(WORD_DATE_RE)) {
    const day = Number(m[1]);
    const month = MONTHS[m[2].toLowerCase()];
    if (!month || day < 1 || day > 31) continue;
    const year = m[3] ? Number(m[3]) : yearFor(month, day, reference);
    const date = validDate(year, month, day);
    if (date) out.push({ index: m.index ?? 0, date });
  }

  for (const m of text.matchAll(NUMERIC_DATE_RE)) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    let year: number;
    if (m[3]) {
      year = Number(m[3]);
      if (year < 100) year += 2000;
    } else {
      year = yearFor(month, day, reference);
    }
    const date = validDate(year, month, day);
    if (date) out.push({ index: m.index ?? 0, date });
  }

  return out.sort((a, b) => a.index - b.index);
}

/**
 * End of the day in Almaty — "до 15 марта" includes the 15th.
 * The calendar parts are already the intended wall-clock date, so the offset is
 * appended rather than applied: shifting the hours *and* labelling the result
 * +05:00 would move the deadline five hours earlier.
 */
function endOfDayKz(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const offset = String(KZ_UTC_OFFSET_HOURS).padStart(2, "0");
  return `${year}-${month}-${day}T23:59:00+${offset}:00`;
}

export function findDeadline(text: string, reference: Date): Date | null {
  const low = text.toLowerCase();
  const dates = findDates(text, reference);
  if (dates.length === 0) return null;

  let best: Date | null = null;
  for (const { index, date } of dates) {
    const lineStart = low.lastIndexOf("\n", index - 1) + 1;
    const window = low.slice(Math.max(lineStart, index - 60), index);
    const markerEnd = Math.max(...DEADLINE_MARKERS.map((marker) => {
      const position = window.lastIndexOf(marker);
      return position < 0 ? -1 : position + marker.length;
    }));
    if (markerEnd >= 0 && !/[.!?]\s/.test(window.slice(markerEnd))) {
      if (!best || date < best) best = date;
    }
  }
  return best;
}

export function guessCategory(text: string, fallback = "forum"): { slug: string; confidence: number } {
  const low = text.toLowerCase();
  let bestSlug = fallback;
  let bestScore = -1;
  let bestPosition = Number.POSITIVE_INFINITY;
  for (const [slug, keywords] of CATEGORY_KEYWORDS) {
    for (const keyword of keywords) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const endBoundary = /^[a-z0-9]+$/i.test(keyword) && keyword.length <= 5 ? "(?![\\p{L}\\p{N}_])" : "";
      const position = low.search(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}${endBoundary}`, "u"));
      if (position < 0) continue;
      const score = (position < 180 ? 6 : 2) + Math.min(4, Math.floor(keyword.length / 8));
      if (score > bestScore || (score === bestScore && position < bestPosition)) {
        bestSlug = slug;
        bestScore = score;
        bestPosition = position;
      }
    }
  }
  return bestScore >= 0 ? { slug: bestSlug, confidence: 0.85 } : { slug: fallback, confidence: 0.35 };
}

export function findCity(text: string): string | null {
  const low = text.toLowerCase();
  for (const [stem, canonical] of CITY_STEMS) {
    if (low.includes(stem)) return canonical;
  }
  return null;
}

export function findPrice(text: string): number | null {
  if (FREE_RE.test(text)) return 0;
  const m = PRICE_RE.exec(text);
  if (!m) return null;
  const digits = m[1].replace(/\D/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return value < 10_000_000 ? value : null;
}

export function makeTitle(text: string): string {
  for (const rawLine of text.split("\n")) {
    const cleaned = rawLine
      .replace(/#\S+/g, " ")
      .replace(/^[^\wА-Яа-яЁё]+/u, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[*_~`•—–-]+|[*_~`•—–-]+$/g, "")
      .trim();
    if (cleaned.length >= 8) return cleaned.slice(0, 300);
  }
  return text.replace(/\s+/g, " ").trim().slice(0, 300);
}

// Instagram posts arrive as pasted caption + link, not as a native forward.
const INSTAGRAM_POST_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?/i;

/**
 * Canonical `https://www.instagram.com/p/<id>/` permalink, or null.
 * The form is normalized (scheme, www, /p/, trailing slash) so the same post
 * pasted with or without www dedupes to one key.
 */
export function instagramPermalink(text: string): string | null {
  const match = text.match(INSTAGRAM_POST_RE);
  if (!match) return null;
  const idMatch = match[0].match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  if (!idMatch) return null;
  return `https://www.instagram.com/p/${idMatch[1]}/`;
}

export type ExtractInput = {
  text: string;
  /** Permalink of the original post; also the dedup key. */
  sourceUrl: string;
  organizerName: string;
  /** Publication date — anchors bare dates like "20 марта" to the right year. */
  publishedAt?: Date;
  defaultCategory?: string;
};

/**
 * Returns a candidate, or null when the text is not an announcement.
 * Confidence is advisory for the moderator; it never authorizes publishing.
 */
export function extractCandidate(input: ExtractInput): Candidate | null {
  const text = input.text.trim();
  if (!looksLikeOpportunity(text)) return null;

  const title = makeTitle(text);
  if (title.length < 3) return null;

  const reference = input.publishedAt ?? new Date();
  const category = guessCategory(text, input.defaultCategory ?? "forum");
  const deadline = findDeadline(text, reference);
  const applyUrl = findApplicationUrl(text);
  const price = findPrice(text);
  const city = findCity(text);
  const online = ONLINE_RE.test(text);
  const offline = OFFLINE_RE.test(text);
  const format = online && (offline || city) ? "HYBRID" : online ? "ONLINE" : offline || city ? "OFFLINE" : undefined;

  const gradeMatch = GRADE_RANGE_RE.exec(text);
  const ageMatch = AGE_RANGE_RE.exec(text);
  const body = text.replace(/\s+/g, " ").slice(0, 8000);

  let confidence = 0.35 + 0.25 * category.confidence;
  if (deadline) confidence += 0.15;
  if (applyUrl) confidence += 0.1;
  if (gradeMatch || ageMatch) confidence += 0.05;

  const candidate: Candidate = {
    title,
    shortDescription: body.slice(0, 300),
    fullDescription: body,
    categorySlug: category.slug,
    tags: extractActivityTags(text),
    organizerName: input.organizerName.slice(0, 200),
    sourceUrl: input.sourceUrl,
    originalLanguage: "ru",
    requiredDocuments: [],
    requirements: [],
    media: [],
    confidence: Math.round(Math.min(0.9, confidence) * 100) / 100,
  };

  if (format) candidate.format = format;

  if (applyUrl && applyUrl !== input.sourceUrl) candidate.applicationUrl = applyUrl;
  if (deadline) candidate.applicationDeadline = endOfDayKz(deadline);
  if (price !== null) candidate.price = price;
  if (city && format !== "ONLINE") candidate.city = city;
  if (gradeMatch) {
    const lo = Number(gradeMatch[1]);
    const hi = Number(gradeMatch[2]);
    if (lo >= 1 && lo <= hi && hi <= 12) {
      candidate.minimumGrade = lo;
      candidate.maximumGrade = hi;
    }
  }
  if (ageMatch) {
    const lo = Number(ageMatch[1]);
    const hi = Number(ageMatch[2]);
    if (lo >= 5 && lo <= hi && hi <= 30) {
      candidate.minimumAge = lo;
      candidate.maximumAge = hi;
    }
  }

  return candidate;
}

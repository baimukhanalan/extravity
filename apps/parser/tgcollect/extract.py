"""Turn a free-form Telegram post into an ingest candidate locally.

Telegram content is parsed only with deterministic rules and is never sent to
an AI/ML provider. Everything ends up in the same candidate schema the HTML/RSS
parser produces, so both paths share dedup, trust scoring and moderation.
"""
from __future__ import annotations

import hashlib
import re
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlparse

from parser.taxonomy import CATEGORY_KEYWORDS, ranked_category

# Kazakhstan is UTC+5 year-round (no DST since 2024).
KZ_TZ = timezone(timedelta(hours=5))

CATEGORY_SLUGS = [
    "startup", "hackathon", "olympiad", "mun", "debate", "robotics", "science",
    "research", "test-prep", "course", "bootcamp", "summer", "exchange", "volunteer",
    "social", "sport", "creative", "internship", "mentorship", "forum", "career",
]

ACTIVITY_TAG_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("SAT", ("digital sat", "sat preparation", "sat prep", "sat exam", "sat test", "подготовка к sat")),
    ("IELTS", ("ielts academic", "ielts preparation", "ielts prep", "ielts exam", "ielts test", "подготовка к ielts")),
    ("TOEFL", ("toefl ibt", "toefl preparation", "toefl prep", "toefl exam", "подготовка к toefl")),
    ("эссе и письмо", ("эссе", "сочинение", "литературный конкурс", "writing competition", "essay competition", "essay contest", "poetry contest", "эссе байқауы", "әдеби байқау")),
    ("вокал и музыка", ("вокал", "вокальный конкурс", "конкурс певцов", "музыкальный конкурс", "singing competition", "vocal competition", "music competition", "ән байқауы", "вокалдық байқау")),
    ("танец и сцена", ("танцевальный конкурс", "конкурс танцев", "хореография", "театральный конкурс", "актерский конкурс", "актёрский конкурс", "dance competition", "theatre festival", "performing arts", "би байқауы", "театр фестивалі")),
    ("моделинг и мода", ("моделинг", "модельный конкурс", "конкурс моделей", "кастинг моделей", "fashion competition", "fashion casting", "model casting", "модельдік байқау", "сән байқауы")),
    ("визуальное искусство", ("фотоконкурс", "видеоконкурс", "конкурс рисунков", "иллюстрация", "дизайн конкурс", "photo competition", "film competition", "art contest", "сурет байқауы", "фото байқауы")),
    ("фехтование", ("фехтован", "fencing", "fencing championship", "семсерлесу")),
    ("армрестлинг", ("армрестлинг", "армспорт", "борьба на руках", "armwrestling", "arm wrestling", "қол күресі")),
    ("стритлифтинг", ("стритлифтинг", "streetlifting", "street lifting", "подтягивания с отягощением", "отжимания на брусьях с весом")),
    ("воркаут", ("воркаут", "street workout", "калистеника", "calisthenics", "уличная гимнастика")),
    ("единоборства", ("единоборства", "боевые искусства", "бокс", "дзюдо", "карате", "таэквондо", "грэпплинг", "martial arts", "boxing tournament", "жекпе-жек")),
    ("силовой спорт", ("пауэрлифтинг", "гиревой спорт", "тяжёлая атлетика", "тяжелая атлетика", "силовой экстрим", "powerlifting", "weightlifting", "kettlebell sport", "ауыр атлетика")),
]


def extract_activity_tags(text: str) -> list[str]:
    low = text.casefold().replace("ё", "е")
    return [
        tag for tag, keywords in ACTIVITY_TAG_KEYWORDS
        if any(keyword.casefold().replace("ё", "е") in low for keyword in keywords)
    ]

MONTHS = {
    "января": 1, "январь": 1, "янв": 1,
    "февраля": 2, "февраль": 2, "фев": 2,
    "марта": 3, "март": 3, "мар": 3,
    "апреля": 4, "апрель": 4, "апр": 4,
    "мая": 5, "май": 5,
    "июня": 6, "июнь": 6, "июн": 6,
    "июля": 7, "июль": 7, "июл": 7,
    "августа": 8, "август": 8, "авг": 8,
    "сентября": 9, "сентябрь": 9, "сен": 9, "сент": 9,
    "октября": 10, "октябрь": 10, "окт": 10,
    "ноября": 11, "ноябрь": 11, "ноя": 11,
    "декабря": 12, "декабрь": 12, "дек": 12,
    "қаңтар": 1, "ақпан": 2, "наурыз": 3, "сәуір": 4,
    "мамыр": 5, "маусым": 6, "шілде": 7, "тамыз": 8,
    "қыркүйек": 9, "қазан": 10, "қараша": 11, "желтоқсан": 12,
    "january": 1, "jan": 1, "february": 2, "feb": 2,
    "march": 3, "mar": 3, "april": 4, "apr": 4,
    "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
    "august": 8, "aug": 8, "september": 9, "sept": 9, "sep": 9,
    "october": 10, "oct": 10, "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}
ENGLISH_MONTHS = {key: value for key, value in MONTHS.items() if key.isascii() and key.isalpha()}

DEADLINE_MARKERS = [
    "дедлайн", "deadline", "срок подачи", "приём заявок до", "прием заявок до",
    "заявки до", "заявки принимаются до", "регистрация до", "подать до", "успей до",
    "приём работ до", "прием работ до", "приём документов до", "прием документов до",
    "приём заявок", "прием заявок", "подача заявок", "заявки принимаются",
    "регистрация закрывается", "регистрация заканчивается", "последний день регистрации",
    "қабылдау мерзімі", "тіркеу мерзімі", "өтінім қабылдау", "өтінімдерді қабылдау", "өтінім",
    "өтінім беру мерзімі", "өтініштерді қабылдау", "құжаттарды қабылдау",
    "registration closes", "registration ends", "registration deadline", "apply by", "apply before",
    "application deadline", "applications close", "applications due", "applications accepted until",
    "submissions due", "submit by", "last day to apply", "closing date",
    "крайний срок регистрации", "заявки принимают до", "заявки принимаем до",
    "подать заявку можно до", "последний день подачи заявок",
]

URL_RE = re.compile(r"(?<![@\w])(?:https?://|www\.)[^\s<>()\[\]«»\"]+", re.I)
NUMERIC_DATE_RE = re.compile(r"\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b")
HYPHEN_DATE_RE = re.compile(r"\b(\d{1,2})-(\d{1,2})-(\d{4})\b")
ISO_DATE_RE = re.compile(r"\b(20\d{2})-(\d{2})-(\d{2})\b")
WORD_DATE_RE = re.compile(
    r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(" + "|".join(sorted(MONTHS, key=len, reverse=True)) + r")(?:ға|ге|да|де|та|те|ға дейін)?(?:\s+(\d{4}))?", re.I
)
MONTH_FIRST_DATE_RE = re.compile(
    r"\b(" + "|".join(sorted(ENGLISH_MONTHS, key=len, reverse=True))
    + r")\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b", re.I
)
COMPACT_ENGLISH_REGISTRATION_RANGE_RE = re.compile(
    r"\b(?:registration(?:\s+(?:period|dates?))?|application\s+period)"
    r"(?:\s+(?:runs?|from|is|open))?\s*[:—–-]?\s*"
    r"(?P<month>" + "|".join(sorted(ENGLISH_MONTHS, key=len, reverse=True)) + r")\s+"
    r"(?P<start>\d{1,2})(?:st|nd|rd|th)?\s*[-–—]\s*"
    r"(?P<end>\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(?P<year>\d{4}))?\b",
    re.I,
)
TIME_UTC_RE = re.compile(
    r"^\s*[,;]?\s*(?:at\s+)?(\d{1,2}):(\d{2})\s*\(?\s*UTC(?:([+-])(\d{1,2})(?::?(\d{2}))?)?\s*\)?(?=$|[\s.,;])",
    re.I,
)
GRADE_RE = re.compile(r"(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(?:класс|кл\.|сынып)", re.I)
SINGLE_GRADE_RE = re.compile(r"(?:с|from)?\s*(\d{1,2})\s*(?:класс|кл\.|сынып)", re.I)
AGE_RE = re.compile(r"(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(?:лет|года|жас)", re.I)
AGE_FROM_TO_RE = re.compile(r"\bот\s+(\d{1,2})\s+до\s+(\d{1,2})\s*(?:лет|года|жас)", re.I)
ENGLISH_GRADE_RE = re.compile(r"\bgrades?\s+(\d{1,2})\s*[-–—]\s*(\d{1,2})\b", re.I)
ENGLISH_SINGLE_GRADE_RE = re.compile(r"\bgrades?\s+(\d{1,2})\b", re.I)
ENGLISH_AGE_RE = re.compile(r"\b(?:ages?|aged)\s+(\d{1,2})\s*[-–—]\s*(\d{1,2})\b", re.I)
MINIMUM_AGE_RE = re.compile(r"\b(?:от\s+|с\s+)(\d{1,2})\s*(?:лет|года|жас)(?:\b|\+)", re.I)
ENGLISH_MINIMUM_AGE_RE = re.compile(r"\b(?:ages?|aged)\s+(\d{1,2})\s*\+", re.I)
AGE_PLUS_RE = re.compile(r"\b(\d{1,2})\s*\+\s*(?:лет|года|жас)\b", re.I)
PRICE_RE = re.compile(r"(\d(?:[\d\s.,\u00a0\u202f]*\d)?)\s*(?:₸|тг|тенге|kzt)", re.I)
FOREIGN_FEE_RE = re.compile(
    r"(?:\b(?:fee|cost|price|взнос|стоимость|оплата)\b[^\n.!?]{0,35}"
    r"(?:[$€£]\s*\d|\d[\d.,\s]*\s*(?:usd|eur|gbp))|"
    r"(?:[$€£]\s*\d|\d[\d.,\s]*\s*(?:usd|eur|gbp))[^\n.!?]{0,25}"
    r"\b(?:fee|cost|price|взнос|стоимость|оплата)\b)",
    re.I,
)
FREE_RE = re.compile(r"\b(бесплатн|free|тегін|без оплаты|0\s*₸)", re.I)
FREE_EXTRA_RE = re.compile(
    r"\b(?:бесплатн\w*|free|тегін)\s+(?:консультац\w*|материал\w*|гайд\w*|вебинар\w*|"
    r"доступ\w*|сертификат\w*|проезд\w*|питани\w*|проживани\w*)\b",
    re.I,
)
FREE_FEE_CONTEXT_RE = re.compile(
    r"(?:участи\w*|регистрац\w*|подач\w*|заявк\w*|взнос\w*|стоимост\w*|"
    r"participation|registration|application|entry|fee|cost|to\s+apply|to\s+enter)",
    re.I,
)
FREE_ACTIVITY_RE = re.compile(
    r"(?:бесплатн\w*|free|тегін)\s+(?:конкурс\w*|олимпиад\w*|курс\w*|"
    r"программ\w*|хакатон\w*|вебинар\w*|турнир\w*|competition|course|program\w*|hackathon|workshop)",
    re.I,
)
PRICE_MARKERS = ("стоимость", "цена", "взнос", "оплата", "участие", "fee", "cost", "от ")
PRIZE_MARKERS = ("приз", "фонд", "грант", "скидк", "награ", "prize", "award", "scholarship")
ONLINE_RE = re.compile(r"\b(онлайн|online|дистанционн|zoom)\b", re.I)
OFFLINE_RE = re.compile(r"\b(офлайн|offline|очно|очный)\b", re.I)

# Stem → canonical name: Russian declines city names ("в Астане", "из Караганды").
CITY_STEMS: list[tuple[str, str]] = [
    ("алмат", "Алматы"),
    ("астан", "Астана"),
    ("шымкент", "Шымкент"),
    ("караганд", "Караганда"),
    ("актоб", "Актобе"),
    ("тараз", "Тараз"),
    ("павлодар", "Павлодар"),
    ("усть-каменогорск", "Усть-Каменогорск"),
    ("семей", "Семей"),
    ("атырау", "Атырау"),
    ("костанай", "Костанай"),
    ("кызылорд", "Кызылорда"),
    ("уральск", "Уральск"),
    ("петропавловск", "Петропавловск"),
    ("актау", "Актау"),
]

APPLY_HOSTS = ("forms.gle", "tally.so", "typeform.com", "jotform.com")
SOCIAL_REFERENCE_HOSTS = ("instagram.com", "www.instagram.com", "t.me", "telegram.me", "vk.com", "vk.ru", "max.ru")
APPLY_PATH_RE = re.compile(r"/(?:apply|register|registration|application|form)(?:[/?#-]|$)", re.I)
APPLY_LABEL_RE = re.compile(
    r"(?:регистрац\w*|подать\s+заявк\w*(?:\s+на\s+участи\w*)?|"
    r"зарегистрир\w*(?:\s+команд\w*)?(?:\s+на\s+сайте)?|подача\s+заявок|заявк\w*|"
    r"заполнить\s+(?:форм\w*|анкет\w*)|apply|application|sign\s*up|"
    r"өтінім\w*|тіркел\w*)\s*(?:по\s+ссылке\s*)?(?:здесь|тут|here)?\s*[:—–-]?\s*$",
    re.I,
)
NON_APPLY_LABEL_RE = re.compile(
    r"(?:опрос\w*[^:\n]{0,50}|survey[^:\n]{0,50}|feedback|обратн\w*\s+связ\w*|"
    r"анкет\w*\s+обратн\w*\s+связ\w*|оцен(?:ить|ите)\s+(?:мероприяти\w*|курс\w*|вебинар\w*))"
    r"\s*[:—–-]?\s*$",
    re.I,
)
CLOSING_DATE_CONTEXT_RE = re.compile(
    r"(?:регистрац\w*|при[её]м\s+(?:заявок|работ|документов)|подач\w*\s+заявок|"
    r"өтінім\w*\s+қабылдау|тіркеу|registration|application\s+period)"
    r"[^\n.!?;,]{0,80}(?:[-–—]|\b(?:до|по|until|through|to)\b)\s*$",
    re.I,
)

# Leading decoration: emoji, bullets, hashtags.
_LEAD_JUNK = re.compile(r"^[^\wА-Яа-яЁё]+", re.U)
_HASHTAG = re.compile(r"#\S+")
_WS = re.compile(r"\s+")

TITLE_TYPE_LABELS = {
    "startup": "Стартап-программа",
    "hackathon": "Хакатон",
    "olympiad": "Олимпиада",
    "mun": "Модель ООН",
    "debate": "Дебатный турнир",
    "robotics": "Соревнование по робототехнике",
    "science": "Научный конкурс",
    "research": "Исследовательская программа",
    "course": "Образовательный курс",
    "bootcamp": "Буткемп",
    "summer": "Летняя школа",
    "exchange": "Программа обмена",
    "volunteer": "Волонтёрская программа",
    "social": "Социальный проект",
    "sport": "Спортивный турнир",
    "creative": "Творческий конкурс",
    "internship": "Стажировка",
    "mentorship": "Менторская программа",
    "forum": "Форум",
    "career": "Карьерная программа",
}

_TITLE_TYPE_RE = re.compile(
    r"\b(стажиров\w*|internship|олимпиад\w*|хакатон\w*|hackathon|идеатон\w*|ideathon|конкурс\w*|"
    r"программ\w*|курс\w*|буткемп\w*|bootcamp|летн\w+\s+(?:школ\w*|лагер\w*)|"
    r"summer\s+(?:school|program)|форум\w*|forum|турнир\w*|волонт[её]р\w*|"
    r"обмен\w*|exchange|ментор\w*|mentorship|акселератор\w*|акселерац\w*|"
    r"фотоконкурс\w*|видеоконкурс\w*|байқау\w*|арт[- ]резиденци\w*|резиденци\w*|art\s+residency|"
    r"интенсив\w*|intensive|competition|case\s+competition|стипенд\w*|scholarship|coding\s+contest|pitch)\b",
    re.I,
)
_TITLE_META_RE = re.compile(
    r"^(?:подробнее|регистрация|дедлайн|срок подачи|условия|требования|ссылка|"
    r"важно|внимание|новая возможность|возможность дня|открыт набор|при[её]м заявок|"
    r"открыта регистрация|началась регистрация|заявки открыты|"
    r"registration open|applications open|apply now|где\s*:|когда\s*:|"
    r"календарь\s+(?:турнира|конкурса|олимпиады)\s*:|"
    r"программа\s+предназначена\b|программа\s+рассчитана\b|"
    r"участие\s+(?:могут|доступно)\b)",
    re.I,
)
_TITLE_NAMED_PROGRAM_RE = re.compile(
    r"\b(?:[A-ZА-ЯЁ][\w.'’+-]*|[A-ZА-ЯЁ]{2,})(?:\s+(?:[A-ZА-ЯЁ][\w.'’+-]*|[&+]|\d{4})){1,6}\b"
)
_INLINE_UPPER_TITLE_RE = re.compile(
    r"\b([A-ZА-ЯЁ][A-ZА-ЯЁ0-9&+.'’_-]{1,}(?:\s+[A-ZА-ЯЁ][A-ZА-ЯЁ0-9&+.'’_-]{1,}){2,7})\b"
)
_INLINE_TITLE_META_RE = re.compile(
    r"^(?:ОТКРЫТ[АЫО]?|РЕГИСТРАЦИЯ|ПРИ[ЕЁ]М|ЗАЯВКИ|МЕЖДУНАРОДН\w*|ONLINE|ОНЛАЙН)\b",
    re.I,
)
_INLINE_TITLE_TRAILER_RE = re.compile(r"\s+(?:IS\s+HERE|УЖЕ\s+ЗДЕСЬ)$", re.I)
_BATCH_TITLE_RE = re.compile(r"\bBatch\s+\d+\b", re.I)
_TITLE_SECTION_RE = re.compile(
    r"^(?:где|когда|место|формат|даты|стоимость|календарь\s+(?:турнира|конкурса|олимпиады))\s*:\s*$",
    re.I,
)
_TITLE_ORG_VERB_RE = re.compile(
    r"^(?:компания\s+|банк\s+|университет\s+|фонд\s+|организация\s+)?"
    r"(?P<org>[A-ZА-ЯЁ][\w&.'’+-]*(?:\s+[A-ZА-ЯЁ][\w&.'’+-]*){0,4})\s+"
    r"(?:открывает|объявляет|запускает|проводит|приглашает|представляет)\b",
)
_TITLE_LAUNCH_NAMED_RE = re.compile(
    r"\b(?i:запускаем|запускает|запускают|представляем|представляет|открываем|открывает)\s+"
    r"(?P<title>(?:[A-ZА-ЯЁ][\w.'’&+-]*\s+){1,7}"
    r"(?:Bootcamp|Program|Programme|Challenge|Competition|Course|School|Lab|Camp|Academy|"
    r"Интенсив|Буткемп|Программа|Курс|Школа))(?=[:—–,.!?]|$)"
)
_ORGANIZER_LABEL_RE = re.compile(
    r"(?:^|[.!?]\s*)(?:организатор(?:ы)?|ұйымдастырушы(?:лар)?|organizer|organized by)\s*[:—–-]\s*([^\n.!?]{2,120})", re.I,
)
_TITLE_TYPE_ORG_RE = re.compile(
    r"\b(?:стажиров\w*|internship|олимпиад\w*|хакатон\w*|hackathon|конкурс\w*|"
    r"программ\w*|курс\w*|форум\w*|forum|турнир\w*)\s+(?:в|от|при|by|at)\s+"
    r"(?P<org>[A-ZА-ЯЁ][\w&.'’+-]*(?:\s+[A-ZА-ЯЁ][\w&.'’+-]*){0,4})",
    re.I,
)
_TITLE_STOP_WORDS = {
    "и", "в", "во", "на", "от", "при", "для", "по", "к", "с", "со", "из",
    "the", "a", "an", "in", "at", "by", "for", "of", "to", "program", "programme",
}


def _clean_line(line: str) -> str:
    line = _HASHTAG.sub(" ", line)
    line = _LEAD_JUNK.sub("", line)
    return _WS.sub(" ", line).strip(" *_~`•—-–")


def reference_date(published_iso: str | None) -> date | None:
    """Anchor for year inference.

    A post from February saying "20 марта" means March of *that* year. Using the
    run date instead would push every archived post a year into the future, so
    the publication date is what we anchor on and the run date is only a
    fallback for text with no known origin.
    """
    if not published_iso:
        return None
    raw = published_iso.strip().replace("Z", "+00:00")
    # Instagram's Graph API stamps offsets as "+0000"; Python 3.9's
    # fromisoformat only accepts "+00:00". Insert the colon when it's missing.
    tail = re.search(r"([+-]\d{4})$", raw)
    if tail:
        raw = raw[: tail.start()] + tail.group(1)[:3] + ":" + tail.group(1)[3:]
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(KZ_TZ).date()


def _year_for(month: int, day: int, today: date) -> int:
    """Infer next year only for a clear year-boundary announcement."""
    try:
        candidate = date(today.year, month, day)
    except ValueError:
        return today.year
    if candidate < today - timedelta(days=1) and today.month >= 10 and month <= 3:
        return today.year + 1
    return today.year


def _iso(d: date) -> str:
    """End of the day in Almaty — a deadline 'до 15 марта' includes the 15th."""
    return datetime(d.year, d.month, d.day, 23, 59, tzinfo=KZ_TZ).isoformat()


def find_dates(text: str, today: date | None = None) -> list[tuple[int, date]]:
    """All parseable dates as (position_in_text, date), in order of appearance."""
    today = today or datetime.now(KZ_TZ).date()
    found: list[tuple[int, date]] = []
    url_spans = [(match.start(), match.end()) for match in URL_RE.finditer(text)]

    def append_if_valid(match: re.Match[str], year: int, month: int, day: int) -> None:
        if any(start <= match.start() < end for start, end in url_spans):
            return
        try:
            found.append((match.start(), date(year, month, day)))
        except ValueError:
            pass

    for m in WORD_DATE_RE.finditer(text):
        day = int(m.group(1))
        month = MONTHS[m.group(2).lower()]
        year = int(m.group(3)) if m.group(3) else _year_for(month, min(day, 28), today)
        append_if_valid(m, year, month, day)

    for m in MONTH_FIRST_DATE_RE.finditer(text):
        month = ENGLISH_MONTHS[m.group(1).lower()]
        day = int(m.group(2))
        year = int(m.group(3)) if m.group(3) else _year_for(month, min(day, 28), today)
        append_if_valid(m, year, month, day)

    for m in NUMERIC_DATE_RE.finditer(text):
        day, month = int(m.group(1)), int(m.group(2))
        if not (1 <= month <= 12 and 1 <= day <= 31):
            continue
        raw_year = m.group(3)
        if raw_year:
            year = int(raw_year)
            if year < 100:
                year += 2000
        else:
            year = _year_for(month, min(day, 28), today)
        append_if_valid(m, year, month, day)

    for m in HYPHEN_DATE_RE.finditer(text):
        append_if_valid(m, int(m.group(3)), int(m.group(2)), int(m.group(1)))

    for m in ISO_DATE_RE.finditer(text):
        append_if_valid(m, int(m.group(1)), int(m.group(2)), int(m.group(3)))

    found.sort(key=lambda p: p[0])
    return found


def _find_deadline_match(text: str, today: date | None = None) -> tuple[int, date] | None:
    low = text.lower()
    dates = find_dates(text, today)
    anchor = today or datetime.now(KZ_TZ).date()
    compact_range_starts: set[int] = set()
    compact_range_ends: list[tuple[int, date]] = []
    for match in COMPACT_ENGLISH_REGISTRATION_RANGE_RE.finditer(text):
        month = ENGLISH_MONTHS[match.group("month").lower()]
        start_day = int(match.group("start"))
        day = int(match.group("end"))
        year = int(match.group("year")) if match.group("year") else _year_for(month, min(day, 28), anchor)
        try:
            date(year, month, start_day)
            closing_day = date(year, month, day)
        except ValueError:
            continue
        if start_day > day:
            continue
        compact_range_starts.add(match.start("month"))
        compact_range_ends.append((match.start("end"), closing_day))
    if compact_range_starts:
        dates = [item for item in dates if item[0] not in compact_range_starts]
        dates.extend(compact_range_ends)
        dates.sort(key=lambda item: item[0])
    if not dates:
        return None

    best: tuple[int, date] | None = None
    for pos, d in dates:
        window = low[max(low.rfind("\n", 0, pos) + 1, pos - 60):pos]
        marker_end = max((window.rfind(marker) + len(marker) for marker in DEADLINE_MARKERS if marker in window), default=-1)
        closing_context = CLOSING_DATE_CONTEXT_RE.search(window)
        if marker_end < 0 and not closing_context:
            continue
        if marker_end >= 0:
            after_marker = window[marker_end:]
            if re.search(r"[.!?;]\s", after_marker):
                continue
            if re.search(r"(?:^|\s)(?:с|from)\s*$", after_marker):
                continue
            if re.search(r"\b(?:стартовал[аи]?|стартует|начал(?:ся|ась|ось)|начинается|открыл(?:ся|ась|ось)|opens?|starts?|begins?)\b[^.!?;]{0,25}$", after_marker, re.I) and not re.search(r"\b(?:до|until|through|by)\b", after_marker):
                continue
            if window[:marker_end].endswith("өтінім") and "дейін" not in low[pos:pos + 50]:
                continue
        if best is None or d < best[1]:
            best = (pos, d)
    return best


def find_deadline(text: str, today: date | None = None) -> date | None:
    """A date is a deadline when a deadline word sits just before it."""
    match = _find_deadline_match(text, today)
    return match[1] if match else None


_EVENT_DATE_CONTEXT_RE = re.compile(
    r"(?:состоится|пройд[её]т|проводится|начн[её]тся|мероприятие|событие|вебинар|"
    r"конференц|хакатон|олимпиад|турнир|финал|лагер|форум|воркшоп|"
    r"takes?\s+place|will\s+be\s+held|starts?|begins?|event|webinar|conference|"
    r"hackathon|olympiad|tournament|final|camp|forum|workshop)",
    re.I,
)
_REGISTRATION_DATE_CONTEXT_RE = re.compile(
    r"(?:регистрац|заявк|подач|при[её]м|дедлайн|срок|application|registration|apply|submit|deadline|due)",
    re.I,
)
_STRUCTURED_EVENT_DATE_RE = re.compile(r"(?:📅|🗓|(?:^|\s)(?:date|дата|когда|күні)\s*:)", re.I)
_RELATIVE_EVENT_TODAY_RE = re.compile(r"(?:happening\s+today|(?:состоится|пройд[её]т|мероприятие)\s+сегодня|сегодня\s+(?:состоится|пройд[её]т))", re.I)


def find_event_start(text: str, today: date | None = None) -> date | None:
    """Find an explicit event date without mistaking application dates for it."""
    anchor = today or datetime.now(KZ_TZ).date()
    dates = find_dates(text, anchor)
    deadline_match = _find_deadline_match(text, today)
    candidates: list[date] = []
    for pos, event_day in dates:
        if deadline_match and pos == deadline_match[0]:
            continue
        context_start = max(0, pos - 90)
        context = text[context_start:min(len(text), pos + 90)]
        event_matches = list(_EVENT_DATE_CONTEXT_RE.finditer(context))
        line_start = text.rfind("\n", 0, pos) + 1
        line_end = text.find("\n", pos)
        line = text[line_start:line_end if line_end >= 0 else len(text)]
        structured_date = bool(_STRUCTURED_EVENT_DATE_RE.search(line)) and not bool(_REGISTRATION_DATE_CONTEXT_RE.search(line[:max(0, pos - line_start)]))
        if not event_matches and not structured_date:
            continue
        immediate_start = max(0, pos - 45)
        immediate = text[immediate_start:min(len(text), pos + 45)]
        registration_matches = list(_REGISTRATION_DATE_CONTEXT_RE.finditer(immediate))
        event_distance = min((abs((context_start + match.start()) - pos) for match in event_matches), default=0)
        registration_distance = min((abs((immediate_start + match.start()) - pos) for match in registration_matches), default=10_000)
        if not structured_date and registration_distance < event_distance:
            continue
        candidates.append(event_day)
    if candidates:
        return min(candidates)
    return anchor if _RELATIVE_EVENT_TODAY_RE.search(text) else None


def _deadline_iso(text: str, position: int, day: date) -> str:
    date_end = next((match.end() for pattern in (WORD_DATE_RE, MONTH_FIRST_DATE_RE, NUMERIC_DATE_RE, HYPHEN_DATE_RE, ISO_DATE_RE)
                     if (match := pattern.match(text, position))), position)
    line_end = text.find("\n", date_end)
    suffix = text[date_end:line_end if line_end >= 0 else len(text)][:50]
    clock = TIME_UTC_RE.match(suffix)
    if not clock:
        return _iso(day)
    hour, minute = int(clock.group(1)), int(clock.group(2))
    offset_hour = int(clock.group(4) or 0)
    offset_minute = int(clock.group(5) or 0)
    offset_total = offset_hour * 60 + offset_minute
    if hour > 23 or minute > 59 or offset_hour > 14 or offset_minute > 59 or offset_total > 14 * 60:
        return _iso(day)
    sign = -1 if clock.group(3) == "-" else 1
    source_tz = timezone(timedelta(minutes=sign * offset_total))
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=source_tz).astimezone(KZ_TZ).isoformat()


def guess_category(text: str, default: str = "forum") -> tuple[str, float]:
    return ranked_category(text, default, 0.35)


def find_price(text: str) -> int | None:
    foreign_fee = bool(FOREIGN_FEE_RE.search(text))
    low = text.lower()
    paid_values: list[int] = []
    for m in PRICE_RE.finditer(text):
        before = low[max(low.rfind("\n", 0, m.start()) + 1, m.start() - 70):m.start()]
        price_pos = max((before.rfind(marker) for marker in PRICE_MARKERS), default=-1)
        prize_pos = max((before.rfind(marker) for marker in PRIZE_MARKERS), default=-1)
        if price_pos < 0 or prize_pos > price_pos:
            continue
        digits = re.sub(r"\D", "", m.group(1))
        if digits:
            value = int(digits)
            if value < 10_000_000:
                paid_values.append(value)
    free_claims = []
    for match in FREE_RE.finditer(text):
        if FREE_EXTRA_RE.match(text, match.start()):
            continue
        prefix = text[max(0, match.start() - 50):match.start()]
        if re.search(r"\b(?:не|not|isn.t)\s*$", prefix, re.I):
            continue
        clause_start = max(text.rfind(separator, 0, match.start()) for separator in "\n.!?;") + 1
        clause_end = min(
            (position for separator in "\n.!?;" if (position := text.find(separator, match.end())) >= 0),
            default=len(text),
        )
        clause = text[clause_start:clause_end]
        if FREE_FEE_CONTEXT_RE.search(clause) or FREE_ACTIVITY_RE.search(clause):
            free_claims.append(match)
    if paid_values and free_claims:
        return None
    if len(set(paid_values)) > 1:
        return None
    if paid_values:
        return paid_values[0]
    if foreign_fee:
        return None
    return 0 if free_claims else None


def find_grades(text: str) -> tuple[int | None, int | None]:
    m = GRADE_RE.search(text) or ENGLISH_GRADE_RE.search(text)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        if 1 <= lo <= hi <= 12:
            return lo, hi
    m = SINGLE_GRADE_RE.search(text) or ENGLISH_SINGLE_GRADE_RE.search(text)
    if m:
        g = int(m.group(1))
        if 1 <= g <= 12:
            return g, None
    return None, None


def find_ages(text: str) -> tuple[int | None, int | None]:
    m = AGE_RE.search(text) or AGE_FROM_TO_RE.search(text) or ENGLISH_AGE_RE.search(text)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        if 5 <= lo <= hi <= 99:
            return lo, hi
    m = MINIMUM_AGE_RE.search(text) or ENGLISH_MINIMUM_AGE_RE.search(text) or AGE_PLUS_RE.search(text)
    if m:
        lo = int(m.group(1))
        if 5 <= lo <= 99:
            return lo, None
    return None, None


def find_links(text: str) -> tuple[str | None, list[str]]:
    """Returns an evidenced application URL and all URLs separately."""
    def normalize(raw: str) -> str:
        cleaned = raw.rstrip(".,;:!?)»”")
        return f"https://{cleaned}" if cleaned.lower().startswith("www.") else cleaned

    urls = [normalize(u) for u in URL_RE.findall(text)]
    if not urls:
        return None, []
    non_apply_urls: set[str] = set()
    for match in URL_RE.finditer(text):
        line_start = text.rfind("\n", 0, match.start()) + 1
        prefix = text[line_start:match.start()].strip()
        normalized = normalize(match.group(0))
        if NON_APPLY_LABEL_RE.search(prefix):
            non_apply_urls.add(normalized)
            continue
        host = (urlparse(normalized).hostname or "").lower()
        if APPLY_LABEL_RE.search(prefix) and host not in SOCIAL_REFERENCE_HOSTS:
            return normalized, urls
    for u in urls:
        if u in non_apply_urls:
            continue
        parsed = urlparse(u)
        host = (parsed.hostname or "").lower()
        if host in APPLY_HOSTS or host.endswith(".typeform.com") or host.endswith(".jotform.com"):
            return u, urls
        if host == "docs.google.com" and parsed.path.startswith("/forms/"):
            return u, urls
        if APPLY_PATH_RE.search(parsed.path):
            return u, urls
    return None, urls


def find_city(text: str) -> str | None:
    low = text.lower()
    for stem, canonical in CITY_STEMS:
        if re.search(rf"\b{re.escape(stem)}", low):
            return canonical
    return None


def guess_format(text: str, city: str | None) -> str | None:
    online = bool(ONLINE_RE.search(text))
    offline = bool(OFFLINE_RE.search(text))
    city_pattern = "|".join(re.escape(stem) for stem, _ in CITY_STEMS)
    venue = bool(city and re.search(
        rf"\b(?:финал|этап|тур|встреча|пройд[её]т|проводится|место|локация|адрес|площадка)\b"
        rf"[^\n.]{{0,60}}(?:{city_pattern})",
        text, re.I,
    ))
    city_location = bool(city and re.search(rf"\b(?:в|во|на)\s+(?:{city_pattern})", text, re.I))
    if online and (offline or venue):
        return "HYBRID"
    if online:
        return "ONLINE"
    if offline or venue or city_location:
        return "OFFLINE"
    return None


def _title_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.splitlines():
        cleaned = _clean_line(raw)
        if len(cleaned) < 8 or URL_RE.fullmatch(cleaned):
            continue
        if _TITLE_SECTION_RE.fullmatch(cleaned):
            continue
        sentence = re.split(r"(?<=[.!?])\s", cleaned, maxsplit=1)[0]
        if 8 <= len(sentence) <= 300:
            cleaned = sentence
        elif len(cleaned) > 300:
            cleaned = cleaned[:300].rsplit(" ", 1)[0]
        lines.append(cleaned[:300])
    return lines


def _specific_title_score(line: str, position: int) -> int:
    if _TITLE_META_RE.search(line):
        return -20
    score = max(0, 4 - position)
    if _TITLE_TYPE_RE.search(line):
        score += 8
    if re.search(r"[«\"“][^»\"”]{2,80}[»\"”]", line):
        score += 5
    if re.search(r"\b20\d{2}\b", line):
        score += 2
    if _TITLE_TYPE_ORG_RE.search(line) or _TITLE_ORG_VERB_RE.search(line):
        score += 6
    if re.search(r"\b[A-ZА-ЯЁ]{2,}(?:\s+[A-ZА-ЯЁ]{2,})*\b", line):
        score += 3
    if _TITLE_NAMED_PROGRAM_RE.search(line) and not _TITLE_ORG_VERB_RE.search(line):
        score += 8
    if line.endswith(";"):
        score -= 10
    if line and line[0].islower():
        score -= 4
    if line.endswith("!") and not _TITLE_TYPE_RE.search(line):
        score -= 5
    return score


def _explicit_organizer(text: str) -> str | None:
    for raw in text.splitlines():
        match = _ORGANIZER_LABEL_RE.search(_clean_line(raw))
        if match:
            name = match.group(1).strip(" .,:;—–-")
            if name and not URL_RE.search(name):
                return name[:100]
    for line in _title_lines(text)[:8]:
        match = _TITLE_TYPE_ORG_RE.search(line) or _TITLE_ORG_VERB_RE.search(line)
        if not match:
            continue
        organizer = match.group("org").strip(" ,.:;–—-")
        organizer = re.sub(r"^(?:компания|банк|университет|фонд|организация)\s+", "", organizer, flags=re.I)
        if organizer.lower() not in {"мы", "наш", "наша", "организатор"} and len(organizer) >= 2:
            return organizer[:100]
    return None


def make_title(text: str, category_slug: str | None = None) -> str:
    """Keep a clear source title; otherwise build a grounded type/organizer title."""
    launched = _TITLE_LAUNCH_NAMED_RE.search(text)
    if launched:
        return launched.group("title")[:300]

    inline_titles: list[str] = []
    for match in _INLINE_UPPER_TITLE_RE.finditer(text):
        candidate = _INLINE_TITLE_TRAILER_RE.sub("", match.group(1)).strip()
        if _INLINE_TITLE_META_RE.search(candidate) or not _TITLE_TYPE_RE.search(candidate):
            continue
        inline_titles.append(candidate)
    if inline_titles:
        return max(inline_titles, key=lambda value: (len(value.split()), len(value)))[:300]

    batch = _BATCH_TITLE_RE.search(text)
    if batch and re.search(r"\b(?:курс\w*|интенсив\w*|course|intensive)\b", text, re.I):
        return f"Интенсивные курсы — {batch.group(0)}"

    lines = _title_lines(text)
    if not lines:
        return _clean_line(text)[:300]

    ranked = sorted(enumerate(lines[:10]), key=lambda item: _specific_title_score(item[1], item[0]), reverse=True)
    best_position, best = ranked[0]
    best_score = _specific_title_score(best, best_position)
    if best_score >= 11:
        return best

    organizer = _explicit_organizer(text)
    if organizer:
        label = TITLE_TYPE_LABELS.get(category_slug or "")
        if not label:
            match = _TITLE_TYPE_RE.search(text)
            label = match.group(1).capitalize() if match else "Возможность"
        separator = " в " if category_slug == "internship" else " — "
        return f"{label}{separator}{organizer}"[:300]

    return best


def schema_safe_title(value: str, max_units: int = 280) -> str:
    """Cap text to JS UTF-16 length, leaving schema headroom."""
    units = 0
    chars: list[str] = []
    for char in value:
        width = 2 if ord(char) > 0xFFFF else 1
        if units + width > max_units:
            break
        chars.append(char)
        units += width
    return "".join(chars).rstrip()


def title_is_grounded(title: str, source_text: str) -> bool:
    """Accept a generated title only when its meaningful words occur in the source."""
    source_words = {word.lower() for word in re.findall(r"[\w&.'’+-]+", source_text, re.U)}
    title_words = [word.lower() for word in re.findall(r"[\w&.'’+-]+", title, re.U)]
    meaningful = [word for word in title_words if len(word) > 2 and word not in _TITLE_STOP_WORDS]

    def occurs(word: str) -> bool:
        if word in source_words:
            return True
        if re.fullmatch(r"[а-яё]+", word, re.I) and len(word) >= 7:
            return any(candidate.startswith(word[:7]) for candidate in source_words)
        return False

    return bool(meaningful) and all(occurs(word) for word in meaningful)


def content_hash(channel: str, post_id: int, text: str) -> str:
    basis = f"tg:{channel}:{post_id}:{text[:500]}"
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


SIGNAL_WORDS = (
    "заявк", "регистрац", "дедлайн", "deadline", "конкурс", "олимпиад",
    "хакатон", "стажировк", "грант", "программ", "набор", "участник",
    "подач", "подать", "apply", "стипенди", "отбор", "сертификат",
    "соревнован", "турнир", "летняя школа", "өтінім", "байқау",
    "тіркеу", "қабылдау", "жарыс", "олимпиада", "тағылымдама", "жазғы мектеп",
    "applications", "registration", "scholarship", "fellowship", "competition",
    "идеатон", "ideathon", "coding contest", "programming contest", "capture the flag",
    "фотоконкурс", "видеоконкурс", "поэтический конкурс", "service learning", "bursary",
)

ACTION_MARKERS = (
    "открыт набор", "открываем набор", "открыта регистрация", "прием заявок",
    "приём заявок", "заявки принима", "подать заявку", "подача заявок",
    "заполнить анкет", "заполняйте анкет", "заполняйте форм", "подавайте заявк",
    "apply now", "applications open",
    "applications are open", "now accepting applications", "open call", "apply here", "register here", "submissions open",
    "call for applications", "приглашаем к участию", "станьте участником",
    "успей подать", "подайте заявку", "принимаем заявки", "отбор открыт", "приём открыт", "прием открыт", "запись открыта",
    "өтінім қабылдау", "тіркеу ашылды", "тіркелу ашық",
    "өтінім қабылданады", "өтінімдер қабылданады", "өтінім беру", "өтініш қабылдау",
    "қатысуға шақырамыз", "құжат қабылдау", "қабылдау басталды", "тіркеліңіз",
    "register now", "registration open", "apply by", "submit your application",
    "объявлен конкурс", "объявляется конкурс", "стартовал конкурс", "стартует конкурс",
    "идет прием заявок", "идёт приём заявок", "начался прием заявок", "начался приём заявок",
    "работы принимаются", "принимаются работы", "присылайте работы", "отправляйте работы",
    "принять участие", "участвуйте", "регистрируйтесь", "запишитесь", "оставить заявку",
    "заявка по qr", "регистрация по qr",
    "байқау жарияланды", "қатысу үшін", "өтінім беріңіз", "жұмыстар қабылданады",
    "entries open", "entry is open", "enter now", "enrol now", "enroll now",
    "submit your work", "submit your project", "join the competition",
)

PARTICIPATION_MARKERS = (
    "условия участия", "для участия", "к участию", "участие открыто", "участие доступно",
    "форма заявки", "форма регистрации", "анкета участника", "положение конкурса",
    "как участвовать", "как подать", "регистрация по ссылке", "заявка по ссылке",
    "қатысу шарттары", "қатысуға болады", "өтінім нысаны", "тіркелу сілтемесі",
    "eligibility", "who can apply", "how to apply", "application form", "registration form",
    "entry form", "participation is open", "participation details", "details for participation",
)

RETROSPECTIVE_MARKERS = (
    "состоялся", "состоялась", "состоялось", "прошел ", "прошёл ",
    "прошла ", "прошло ", "завершился", "завершилась", "подвели итоги",
    "стал партнером", "стала партнером", "вышел в финал", "вышла в финал",
    "объявлены победители", "наградили победителей",
)

SCHOOL_AUDIENCE_RE = re.compile(
    r"(?:школьник\w*|учащи\w*\s+школ\w*|старшеклассник\w*|"
    r"оқуш\w*|мектеп\s+оқуш\w*|high[ -]school\s+students?|"
    r"secondary[ -]school\s+students?|school\s+students?)", re.I,
)
ADULT_ONLY_RE = re.compile(
    r"(?:только\s+(?:для\s+)?(?:студент\w*\s+вуз\w*|магистрант\w*|"
    r"выпускник\w*\s+вуз\w*|специалист\w*|профессионал\w*)|"
    r"(?:exclusively|only)\s+(?:for\s+)?(?:university\s+students?|"
    r"undergraduates?|graduates?|professionals?)|"
    r"магистратур\w*|doctoral\s+students?|phd\s+students?)", re.I,
)
CURRENT_UNIVERSITY_RE = re.compile(
    r"(?:теперь|сейчас|ныне|в\s+новом\s+сезоне|в\s+сезоне\s+20\d{2}(?:[–—-]\d{2,4})?|"
    r"с\s+20\d{2}\s*[-–—]\s*(?:20)?\d{2}\s+учебного\s+года|"
    r"this\s+year|this\s+season|now)\s*[^.!?\n]{0,130}?"
    r"(?:студент\w*\s+(?:\d\s*[-–—]\s*\d\s*курс\w*\s+)?(?:вуз\w*|университет\w*)|"
    r"universit\w*\s+students?|undergraduates?)",
    re.I,
)
SCHOOL_EXCLUDED_RE = re.compile(
    r"(?:школьник\w*|school\s+students?|high[ -]school\s+students?)\s+"
    r"(?:(?:are\s+)?not\s+eligible|не\s+допускают\w*|не\s+могут|исключен\w*|excluded)|"
    r"(?:не\s+для|not\s+for)\s+(?:школьник\w*|school\s+students?|high[ -]school\s+students?)",
    re.I,
)
SCHOOL_PROMO_RE = re.compile(
    r"(?:больше|другие|ещ[её])\s+(?:интересных\s+)?(?:возможност\w*|конкурс\w*|программ\w*)\s+"
    r"для\s+школьник\w*\s+(?:здесь|тут|в\s+канале)[^\n]*",
    re.I,
)

KZ_EXPLICITLY_EXCLUDED_RE = re.compile(
    r"(?:except|excluding|not\s+open\s+to|not\s+eligible\s+(?:for|if\s+(?:you\s+are\s+)?(?:a\s+)?(?:resident|citizen|national)\s+of))"
    r"[^.!?\n]{0,45}\b(?:kazakhstan|қазақстан|казахстан)\b|"
    r"\b(?:kazakhstan|қазақстан|казахстан)\b[^.!?\n]{0,45}"
    r"(?:is\s+excluded|are\s+not\s+eligible|не\s+допуска\w*|қатыса\s+алмай\w*)",
    re.I,
)
KZ_OR_GLOBAL_ELIGIBILITY_RE = re.compile(
    r"\b(?:worldwide|globally|any\s+country|all\s+countries|all\s+nationalities|"
    r"regardless\s+of\s+(?:nationality|citizenship)|international\s+(?:students?|applicants?|participants?)\s+(?:are\s+)?welcome|"
    r"(?:students?|applicants?|participants?)\s+from\s+(?:central\s+asia|kazakhstan)|"
    r"(?:open|available|eligible)\s+(?:to|for)\s+[^.!?\n]{0,45}(?:central\s+asia|kazakhstan))\b|"
    r"(?:из\s+любой\s+страны|со\s+всего\s+мира|для\s+всех\s+стран|независимо\s+от\s+гражданства|"
    r"(?:для|участни\w*\s+из|открыт\w*\s+для)[^.!?\n]{0,45}(?:центральн\w*\s+ази\w*|казахстан\w*))|"
    r"(?:барлық\s+елдерден|әлемнің\s+(?:түкпір-түкпірінен|кез\s+келген\s+елінен)|"
    r"азаматтығына\s+қарамастан|(?:қатысуш\w*|оқуш\w*)[^.!?\n]{0,45}(?:орталық\s+азия|қазақстан\w*))",
    re.I,
)
FOREIGN_ONLY_ELIGIBILITY_RE = re.compile(
    r"(?:\b(?:only|exclusively)\s+(?:open\s+)?(?:to|for)\s+"
    r"(?:(?:legal\s+)?(?:residents?|citizens?|nationals?)\s+(?:of|from|in)|"
    r"(?:students?|applicants?|participants?)\s+(?:from|in))\s+[^.!?\n]{2,80}|"
    r"\b(?:residents?|citizens?|nationals?)\s+(?:of|from|in)\s+[^.!?\n]{2,80}\s+only\b|"
    r"\bmust\s+(?:be\s+(?:a\s+)?(?:resident|citizen|national)\s+of|"
    r"(?:attend|be\s+enrolled\s+in)\s+(?:a\s+)?[^.!?\n]{2,50}\s+school)\b|"
    r"(?:только|исключительно)\s+для\s+(?:граждан|резидентов|подданных|"
    r"школьников|учащихся|студентов|участников)\s+(?:из|в|от)\s+[^.!?\n]{2,80}|"
    r"(?:тек|тек\s+қана)\s+[^.!?\n]{0,35}(?:азаматтарына|тұрғындарына|оқушыларына)\b)",
    re.I,
)
ADULT_AUDIENCE_LIST_RE = re.compile(
    r"\bдля\s+студент\w*\s*,\s*(?:аспирант\w*|магистрант\w*|"
    r"молод\w*\s+уч[её]н\w*|преподавател\w*)",
    re.I,
)
ADULT_EDUCATOR_AUDIENCE_RE = re.compile(
    r"(?:для\s+(?:учител\w*|педагог\w*|преподавател\w*|родител\w*)|"
    r"for\s+(?:teachers?|educators?|parents?))",
    re.I,
)
HISTORICAL_CONTEXT_RE = re.compile(
    r"\b(?:в\s+прошлом\s+(?:году|сезоне)|прошлого\s+сезона|ранее|тогда|архив|"
    r"last\s+(?:year|season)|previously|archive)\b|"
    r"\b(?:был[аио]?\s+открыт[аоы]?\s+регистрац\w*|принимал\w*\s+заявк\w*|"
    r"заявки\s+принимал\w*|можно\s+было\s+подать|registration\s+was\s+open)\b",
    re.I,
)
CURRENT_CALL_CONTEXT_RE = re.compile(
    r"\b(?:сейчас|теперь|в\s+этом\s+году|новый\s+(?:набор|сезон)|"
    r"(?<!была\s)открыта\s+регистрац\w*|заявки\s+принимаются|"
    r"регистрац\w*\s+на\s+[^.!?]{0,35}\s+открыта|applications\s+are\s+open|"
    r"now|this\s+year|new\s+(?:call|round|season))\b",
    re.I,
)


def classify_kazakhstan_availability(text: str) -> tuple[str, str | None]:
    """Reject geography only when the source explicitly excludes Kazakhstan.

    A foreign organizer, venue, currency, language, or country name is not an
    eligibility restriction. Unknown geography is retained for review.
    """
    excluded = KZ_EXPLICITLY_EXCLUDED_RE.search(text)
    if excluded:
        return "UNAVAILABLE", excluded.group(0)
    foreign_only = FOREIGN_ONLY_ELIGIBILITY_RE.search(text)
    if foreign_only:
        inclusive_restriction = KZ_OR_GLOBAL_ELIGIBILITY_RE.search(foreign_only.group(0))
        if inclusive_restriction:
            return "AVAILABLE", foreign_only.group(0)
        return "UNAVAILABLE", foreign_only.group(0)
    inclusive = KZ_OR_GLOBAL_ELIGIBILITY_RE.search(text)
    if inclusive:
        return "AVAILABLE", inclusive.group(0)
    return "UNKNOWN", None


def classify_school_audience(text: str) -> tuple[str, str | None]:
    """Evidence-based triage, not a guess from the channel or activity type."""
    eligibility_text = SCHOOL_PROMO_RE.sub("", text)
    adult = ADULT_ONLY_RE.search(eligibility_text)
    current_university = CURRENT_UNIVERSITY_RE.search(eligibility_text)
    excluded = SCHOOL_EXCLUDED_RE.search(eligibility_text)
    grades = GRADE_RE.search(eligibility_text) or ENGLISH_GRADE_RE.search(eligibility_text) or SINGLE_GRADE_RE.search(eligibility_text) or ENGLISH_SINGLE_GRADE_RE.search(eligibility_text)
    if current_university:
        return "NON_SCHOOL", current_university.group(0)
    if excluded and not grades:
        return "NON_SCHOOL", excluded.group(0)
    adult_list = ADULT_AUDIENCE_LIST_RE.search(eligibility_text)
    if adult_list:
        sentence_start = max(eligibility_text.rfind(char, 0, adult_list.start()) for char in ".!?\n") + 1
        same_sentence = eligibility_text[sentence_start:adult_list.end()]
        if not SCHOOL_AUDIENCE_RE.search(same_sentence):
            return "NON_SCHOOL", adult_list.group(0)
    educator = ADULT_EDUCATOR_AUDIENCE_RE.search(eligibility_text)
    if educator:
        sentence_start = max(eligibility_text.rfind(char, 0, educator.start()) for char in ".!?\n") + 1
        sentence_ends = [eligibility_text.find(char, educator.end()) for char in ".!?\n"]
        sentence_end = min((end for end in sentence_ends if end >= 0), default=len(eligibility_text))
        same_sentence = eligibility_text[sentence_start:sentence_end]
        if not SCHOOL_AUDIENCE_RE.search(same_sentence):
            return "NON_SCHOOL", educator.group(0)
    if grades:
        low = int(grades.group(1))
        high = int(grades.group(2)) if grades.lastindex and grades.lastindex >= 2 else low
        if 1 <= low <= high <= 12:
            return ("UNKNOWN", None) if adult or excluded else ("SCHOOL", grades.group(0))
    school = SCHOOL_AUDIENCE_RE.search(eligibility_text)
    if school:
        return ("UNKNOWN", None) if adult or excluded else ("SCHOOL", school.group(0))
    ages = AGE_RE.search(eligibility_text) or AGE_FROM_TO_RE.search(eligibility_text) or ENGLISH_AGE_RE.search(eligibility_text)
    if ages:
        low, high = int(ages.group(1)), int(ages.group(2))
        if 5 <= low <= high <= 17:
            return ("UNKNOWN", None) if adult or excluded else ("SCHOOL", ages.group(0))
        if low >= 18:
            return "NON_SCHOOL", ages.group(0)
    if adult:
        return "NON_SCHOOL", adult.group(0)
    minimum = MINIMUM_AGE_RE.search(eligibility_text) or ENGLISH_MINIMUM_AGE_RE.search(eligibility_text) or AGE_PLUS_RE.search(eligibility_text)
    if minimum and int(minimum.group(1)) >= 18:
        return "NON_SCHOOL", minimum.group(0)
    if excluded:
        return "NON_SCHOOL", excluded.group(0)
    return "UNKNOWN", None


OBVIOUS_NOISE_RE = re.compile(
    r"(?:^|\b)(?:подписывай(?:тесь|ся)|ставьте\s+лайк|жмите\s+(?:лайк|реакци)|"
    r"розыгрыш\s+среди\s+подписчик|рекламн(?:ый|ая)\s+пост|на\s+правах\s+рекламы|"
    r"advertisement|sponsored\s+post|follow\s+(?:our|the)\s+(?:channel|page)|"
    r"giveaway\s+for\s+followers)(?:\b|$)",
    re.I,
)
NON_OPPORTUNITY_CONTENT_RE = re.compile(
    r"(?:\b(?:гайд|подборка\s+материалов|опрос|фоторепортаж|survey|feedback)\b|"
    r"\bкалендарь\s+прошедш\w*)",
    re.I,
)


def looks_like_opportunity(text: str, *, has_source_media: bool = False) -> bool:
    """Cheap pre-filter: channels post a lot that is not a competition.

    Direct open-call language plus a recognised activity is sufficient because
    Telegram often keeps the application route in a button, poster or video.
    A terse media-first call is retained when it has an explicit action marker;
    obvious ads, guides, surveys and retrospective segments stay excluded.
    """
    text = text.strip()
    if len(text) < 8:
        return False

    active_segments = []
    for segment in re.split(r"(?<=[.!?])\s+|\n+", text):
        historical = HISTORICAL_CONTEXT_RE.search(segment) or any(marker in segment.lower() for marker in RETROSPECTIVE_MARKERS)
        if historical and not CURRENT_CALL_CONTEXT_RE.search(segment):
            continue
        active_segments.append(segment)
    active_text = " ".join(active_segments)
    low = active_text.lower()
    if any(marker in low for marker in ("бесплатные материалы", "подборка материалов", "скачать гайд")) and not any(marker in low for marker in DEADLINE_MARKERS):
        return False
    has_deadline = _find_deadline_match(active_text, date.today()) is not None
    has_action = any(marker in low for marker in ACTION_MARKERS) or has_deadline
    if any(marker in low for marker in RETROSPECTIVE_MARKERS) and not has_action:
        return False
    hits = sum(1 for s in SIGNAL_WORDS if s in low)
    has_link = bool(URL_RE.search(active_text))
    application_link = find_links(active_text)[0]
    has_participation = any(marker in low for marker in PARTICIPATION_MARKERS)
    has_type = bool(_TITLE_TYPE_RE.search(active_text)) or any(
        keyword in low
        for _, keywords in CATEGORY_KEYWORDS
        for keyword in keywords
    )
    obvious_noise = bool(OBVIOUS_NOISE_RE.search(active_text))
    if obvious_noise and not (has_action or has_participation or application_link or has_deadline):
        return False
    if NON_OPPORTUNITY_CONTENT_RE.search(active_text) and not (has_action or application_link or has_deadline):
        return False
    if has_action and has_link and has_type:
        return True
    # Telegram announcements commonly keep the URL in a button or QR image.
    # A direct open-call phrase plus a recognised activity type is enough to
    # retain the post for extraction and moderation even when the caption has
    # no visible link or parseable date.
    if has_action and has_type:
        return True
    # Some concise announcements avoid an imperative and expose only a named
    # activity with an evidenced application form/route.  This remains much
    # narrower than accepting an arbitrary event link.
    if has_type and application_link and (has_participation or bool(SCHOOL_AUDIENCE_RE.search(active_text))):
        return True
    # A recognised activity with a public reference is itself useful catalog
    # material.  Telegram posts often put the registration details in an
    # attached poster/video or on the linked organizer page rather than in the
    # caption, so a missing imperative must not erase the announcement.
    if has_type and has_link and has_participation:
        return True
    # Media-first announcements can be extremely terse ("Open call", "Набор
    # открыт") because the poster or video contains the conditions.  Preserve
    # those posts for downstream extraction/review, but still require a direct
    # action signal so ordinary photos and channel chatter stay out.
    if has_source_media and has_action:
        return True
    if len(text) >= 80 and hits >= 2 and has_action:
        return True

    return hits >= 1 and has_deadline and has_link and len(text) >= 120


def baseline(text: str, post_url: str, channel_title: str, default_category: str,
             today: date | None = None, as_of: date | datetime | None = None,
             has_source_media: bool = False) -> dict | None:
    """Deterministic candidate. Returns None when the post clearly isn't one."""
    text = text.strip()
    if not looks_like_opportunity(text, has_source_media=has_source_media):
        return None

    category, cat_conf = guess_category(text, default_category)
    title = schema_safe_title(make_title(text, category))
    if len(title) < 3:
        return None
    deadline_match = _find_deadline_match(text, today)
    deadline = deadline_match[1] if deadline_match else None
    event_start = find_event_start(text, today)
    apply_url, urls = find_links(text)
    price = find_price(text)
    min_grade, max_grade = find_grades(text)
    min_age, max_age = find_ages(text)
    audience_status, audience_evidence = classify_school_audience(text)
    explicit_organizer = _explicit_organizer(text)
    city = find_city(text)
    fmt = guess_format(text, city)

    body = schema_safe_title(_WS.sub(" ", text), 7800)
    candidate: dict = {
        "title": title,
        "shortDescription": schema_safe_title(body, 450),
        "fullDescription": body,
        "categorySlug": category,
        "tags": (["18+"] if audience_status == "NON_SCHOOL" else (["школьники"] if audience_status == "SCHOOL" else [])) + extract_activity_tags(text),
        "organizerName": schema_safe_title(explicit_organizer or channel_title, 180),
        "organizerEvidence": "SOURCE_TEXT" if explicit_organizer else "SOURCE_CHANNEL_UNVERIFIED",
        "audienceStatus": audience_status,
        "sourceUrl": post_url,
        "originalLanguage": "ru",
        "requiredDocuments": [],
        "requirements": [],
    }
    if fmt:
        candidate["format"] = fmt
    if audience_evidence:
        candidate["audienceEvidence"] = audience_evidence
        candidate["requirements"].append(f"Аудитория: {audience_evidence}")
    if apply_url and apply_url != post_url:
        candidate["applicationUrl"] = apply_url
    if deadline:
        deadline_iso = _deadline_iso(text, deadline_match[0], deadline)
        candidate["applicationDeadline"] = deadline_iso
        if as_of:
            deadline_at = datetime.fromisoformat(deadline_iso).astimezone(KZ_TZ)
            if isinstance(as_of, datetime):
                check_at = as_of if as_of.tzinfo else as_of.replace(tzinfo=KZ_TZ)
                if deadline_at <= check_at.astimezone(KZ_TZ):
                    candidate["_expired"] = True
            elif deadline_at.date() < as_of:
                candidate["_expired"] = True
    if event_start:
        candidate["eventStartDate"] = _iso(event_start)
    if price is not None:
        candidate["price"] = price
    if min_grade:
        candidate["minimumGrade"] = min_grade
    if max_grade:
        candidate["maximumGrade"] = max_grade
    if min_age:
        candidate["minimumAge"] = min_age
    elif audience_status == "NON_SCHOOL":
        candidate["minimumAge"] = 18
    if max_age:
        candidate["maximumAge"] = max_age
    if city and fmt != "ONLINE":
        candidate["city"] = city

    # Confidence drives the moderator's attention, not auto-publishing.
    conf = 0.35 + 0.25 * cat_conf
    if deadline:
        conf += 0.15
    if apply_url:
        conf += 0.1
    if min_grade or min_age:
        conf += 0.05
    candidate["confidence"] = round(min(0.9, conf), 2)
    return candidate

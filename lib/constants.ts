// Reference data used across onboarding, filters and seed.

export const CATEGORIES = [
  { slug: "startup", nameRu: "Стартап-конкурсы", nameKz: "Стартап байқаулары", name: "Startup competitions", icon: "Rocket" },
  { slug: "hackathon", nameRu: "Хакатоны", nameKz: "Хакатондар", name: "Hackathons", icon: "Code2" },
  { slug: "olympiad", nameRu: "Олимпиады", nameKz: "Олимпиадалар", name: "Olympiads", icon: "Medal" },
  { slug: "mun", nameRu: "MUN", nameKz: "MUN", name: "Model UN", icon: "Globe2" },
  { slug: "debate", nameRu: "Дебаты", nameKz: "Дебаттар", name: "Debates", icon: "MessagesSquare" },
  { slug: "robotics", nameRu: "Робототехника", nameKz: "Робототехника", name: "Robotics", icon: "Bot" },
  { slug: "science", nameRu: "Научные конкурсы", nameKz: "Ғылыми байқаулар", name: "Science competitions", icon: "FlaskConical" },
  { slug: "research", nameRu: "Исследовательские программы", nameKz: "Зерттеу бағдарламалары", name: "Research programs", icon: "Microscope" },
  { slug: "test-prep", nameRu: "SAT / IELTS", nameKz: "SAT / IELTS", name: "SAT / IELTS", icon: "BookOpenCheck" },
  { slug: "course", nameRu: "Курсы", nameKz: "Курстар", name: "Courses", icon: "GraduationCap" },
  { slug: "bootcamp", nameRu: "Буткемпы", nameKz: "Буткемптер", name: "Bootcamps", icon: "Zap" },
  { slug: "summer", nameRu: "Летние программы", nameKz: "Жазғы бағдарламалар", name: "Summer programs", icon: "Sun" },
  { slug: "exchange", nameRu: "Обменные программы", nameKz: "Алмасу бағдарламалары", name: "Exchange programs", icon: "Plane" },
  { slug: "volunteer", nameRu: "Волонтёрство", nameKz: "Волонтёрлік", name: "Volunteering", icon: "HeartHandshake" },
  { slug: "social", nameRu: "Социальные проекты", nameKz: "Әлеуметтік жобалар", name: "Social projects", icon: "Users" },
  { slug: "sport", nameRu: "Спорт", nameKz: "Спорт", name: "Sports", icon: "Trophy" },
  { slug: "creative", nameRu: "Творческие конкурсы", nameKz: "Шығармашылық байқаулар", name: "Creative contests", icon: "Palette" },
  { slug: "internship", nameRu: "Стажировки", nameKz: "Тағылымдамалар", name: "Internships", icon: "Briefcase" },
  { slug: "mentorship", nameRu: "Mentorship-программы", nameKz: "Mentorship бағдарламалары", name: "Mentorship", icon: "UserCheck" },
  { slug: "forum", nameRu: "Youth forums", nameKz: "Жастар форумдары", name: "Youth forums", icon: "Presentation" },
  { slug: "career", nameRu: "Карьерные программы", nameKz: "Мансап бағдарламалары", name: "Career programs", icon: "TrendingUp" },
] as const;

export const TAGS = [
  "AI", "программирование", "медицина", "экономика", "предпринимательство",
  "экология", "лидерство", "публичные выступления", "исследования", "математика",
  "физика", "химия", "биология", "дизайн", "спорт", "волонтёрство",
  "международные отношения", "робототехника", "финансы", "инженерия",
  "эссе и письмо", "вокал и музыка", "танец и сцена", "моделинг и мода",
  "визуальное искусство", "фехтование", "армрестлинг", "стритлифтинг",
  "воркаут", "единоборства", "силовой спорт",
  "SAT", "IELTS", "TOEFL",
];

export const INTERESTS = [
  { key: "technology", label: "Технологии" },
  { key: "entrepreneurship", label: "Предпринимательство" },
  { key: "science", label: "Наука" },
  { key: "medicine", label: "Медицина" },
  { key: "engineering", label: "Инженерия" },
  { key: "economics", label: "Экономика" },
  { key: "international", label: "Международные отношения" },
  { key: "debate", label: "Дебаты" },
  { key: "creative", label: "Творчество" },
  { key: "sport", label: "Спорт" },
  { key: "volunteer", label: "Волонтёрство" },
  { key: "other", label: "Другое" },
];

export const SKILLS = [
  { key: "languages", label: "Языки" },
  { key: "programming", label: "Программирование" },
  { key: "public_speaking", label: "Публичные выступления" },
  { key: "writing", label: "Письмо" },
  { key: "math", label: "Математика" },
  { key: "research", label: "Исследования" },
  { key: "design", label: "Дизайн" },
  { key: "leadership", label: "Лидерство" },
  { key: "teamwork", label: "Командная работа" },
  { key: "sport", label: "Спортивные навыки" },
];

export const GOALS = [
  { key: "study_abroad", label: "Поступление за рубеж" },
  { key: "study_kz", label: "Поступление в Казахстане" },
  { key: "portfolio", label: "Усиление портфолио" },
  { key: "competitions", label: "Поиск конкурсов" },
  { key: "grants", label: "Получение грантов" },
  { key: "skills", label: "Развитие навыков" },
  { key: "team", label: "Поиск команды" },
  { key: "volunteer_hours", label: "Волонтёрские часы" },
  { key: "sport", label: "Спортивное развитие" },
];

export const CITIES = [
  "Алматы", "Астана", "Шымкент", "Караганда", "Актобе", "Тараз",
  "Павлодар", "Усть-Каменогорск", "Семей", "Атырау", "Костанай",
  "Кызылорда", "Уральск", "Петропавловск", "Актау", "Онлайн",
];

export const REQUIRED_DOCUMENTS: Record<string, string> = {
  student_id: "Ученический билет",
  motivation_letter: "Мотивационное письмо",
  cv: "CV / резюме",
  passport: "Паспорт",
  photo: "Фотография",
  transcript: "Транскрипт оценок",
  recommendation: "Рекомендательное письмо",
  parental_consent: "Согласие родителя",
  project_presentation: "Презентация проекта",
  portfolio: "Портфолио",
  certificate: "Сертификат",
};

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  CONSIDERING: "Рассматриваю",
  SAVED: "Сохранено",
  PREPARING: "Подготовка",
  DOCUMENTS_MISSING: "Не хватает документов",
  READY_FOR_REVIEW: "Готово к проверке",
  READY_TO_SUBMIT: "Готово к отправке",
  SUBMITTED: "Отправлено",
  INTERVIEW: "Интервью",
  WAITLISTED: "Лист ожидания",
  ACCEPTED: "Принято",
  REJECTED: "Отклонено",
  WITHDRAWN: "Отозвано",
  COMPLETED: "Завершено",
};

export const REVIEW_OUTCOME_LABELS: Record<string, string> = {
  APPLIED: "Подал заявку",
  ACCEPTED: "Прошёл / поступил",
  REJECTED: "Не прошёл",
  WITHDREW: "Отозвал",
};

export const OPPORTUNITY_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  PENDING_REVIEW: "На модерации",
  PUBLISHED: "Опубликовано",
  REGISTRATION_OPEN: "Регистрация открыта",
  DEADLINE_SOON: "Скоро дедлайн",
  CLOSED: "Закрыто",
  COMPLETED: "Завершено",
  ARCHIVED: "В архиве",
  REJECTED: "Отклонено",
  SUSPICIOUS: "Подозрительно",
};

export const CONSENT_LABELS: Record<string, { title: string; description: string }> = {
  DATA_PROCESSING: {
    title: "Обработка персональных данных",
    description: "Базовое согласие на хранение и обработку данных школьника на платформе.",
  },
  DOCUMENT_STORAGE: {
    title: "Хранение документов",
    description: "Загрузка и хранение сканов документов для подачи заявок.",
  },
  DATA_SHARING: {
    title: "Передача данных организаторам",
    description: "Передача необходимых данных организатору при подаче заявки.",
  },
  APPLICATION_SUBMIT: {
    title: "Подача заявок",
    description: "Разрешение подавать заявки на участие в программах.",
  },
};

export const ORGANIZER_TYPES = [
  { key: "government", label: "Госорган" },
  { key: "university", label: "Вуз / колледж" },
  { key: "school", label: "Школа" },
  { key: "ngo", label: "НКО / фонд" },
  { key: "company", label: "Компания" },
  { key: "edtech", label: "EdTech" },
  { key: "other", label: "Другое" },
];

export const ACHIEVEMENT_TYPE_LABELS: Record<string, string> = {
  AWARD: "Награда",
  PARTICIPATION: "Участие",
  PROJECT: "Проект",
  VOLUNTEER: "Волонтёрство",
  SPORT: "Спорт",
  MUN: "MUN",
  DEBATE: "Дебаты",
  COURSE: "Курс",
  CERTIFICATE: "Сертификат",
  INTERNSHIP: "Стажировка",
  PUBLICATION: "Публикация",
  RESEARCH: "Исследование",
  LEADERSHIP: "Лидерская роль",
};

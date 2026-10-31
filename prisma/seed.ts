import { PrismaClient, type Format, type OpportunityStatus, type ParticipationType, type VerificationStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SUBSCRIPTION_PLAN_DEFINITIONS } from "../lib/subscription-plans";

const prisma = new PrismaClient();

const CATEGORIES = [
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
  { slug: "forum", nameRu: "Форумы", nameKz: "Жастар форумдары", name: "Youth forums", icon: "Presentation" },
  { slug: "career", nameRu: "Карьерные программы", nameKz: "Мансап бағдарламалары", name: "Career programs", icon: "TrendingUp" },
];

const PLANS = SUBSCRIPTION_PLAN_DEFINITIONS;

const FEATURE_FLAGS = [
  { key: "ai_recommendations", enabled: true, description: "AI-рекомендации" },
  { key: "ai_application_assistant", enabled: false, description: "AI-помощник для заявок" },
  { key: "telegram_alerts", enabled: true, description: "Telegram-уведомления" },
  { key: "direct_apply", enabled: false, description: "Прямая подача" },
  { key: "browser_extension", enabled: false, description: "Браузерное расширение" },
  { key: "organizer_self_publishing", enabled: true, description: "Самостоятельная публикация организаторами" },
  { key: "paid_plans", enabled: true, description: "Платные тарифы" },
  { key: "counselor_portal", enabled: false, description: "Портал counsellor" },
  { key: "portfolio_public_links", enabled: false, description: "Публичные ссылки портфолио" },
  { key: "auto_publish_trusted", enabled: false, description: "Авто-публикация из доверенных источников (высокий trust + дедлайн + ссылка + confidence≥0.8)" },
];

const d = (days: number, hour = 18) => {
  const dt = new Date();
  dt.setDate(dt.getDate() + days);
  dt.setHours(hour, 0, 0, 0);
  return dt;
};

type Seed = {
  slug: string; title: string; short: string; full: string; cat: string;
  tags: string[]; org: string; verified?: VerificationStatus; city?: string;
  format?: Format; price?: number; minGrade?: number; maxGrade?: number;
  minAge?: number; maxAge?: number; deadlineDays: number | null; startDays?: number;
  participation?: ParticipationType; minTeam?: number; maxTeam?: number;
  docs?: string[]; requirements?: string[]; prizes?: string; selection?: string;
  trust: number; prestige: number; difficulty?: number; competition?: number;
  status?: OpportunityStatus; featured?: boolean; sponsored?: boolean;
  scholarship?: boolean; aid?: boolean; certificates?: boolean; volunteerHours?: boolean;
  directApply?: boolean; applicationUrl?: string;
};

const OPPS: Seed[] = [
  { slug: "astana-hub-startup-weekend-2026", title: "Astana Hub Startup Weekend", short: "54 часа на запуск стартапа с менторами Astana Hub.", full: "Интенсив выходного дня: соберите команду, придумайте идею и создайте прототип за 54 часа. Менторы из ведущих IT-компаний Казахстана, питч перед инвесторами и призовой фонд для лучших команд.", cat: "startup", tags: ["предпринимательство", "AI", "программирование"], org: "Astana Hub", verified: "VERIFIED", city: "Астана", format: "OFFLINE", price: 0, minGrade: 9, maxGrade: 11, minAge: 14, maxAge: 18, deadlineDays: 1, startDays: 8, participation: "TEAM", minTeam: 3, maxTeam: 5, docs: ["student_id", "motivation_letter", "project_presentation"], requirements: ["Возраст 14–18", "Команда 3–5 человек", "Идея проекта"], prizes: "Призовой фонд 3 000 000 ₸, менторство и место в акселераторе.", selection: "Отбор по мотивационному письму и идее проекта.", trust: 92, prestige: 85, difficulty: 70, competition: 75, featured: true, certificates: true, directApply: true, applicationUrl: "https://astanahub.com" },
  { slug: "respublikanskaya-olimpiada-fizika-2026", title: "Республиканская олимпиада по физике", short: "Главная школьная олимпиада страны по физике.", full: "Республиканская предметная олимпиада по физике для учащихся 9–11 классов. Победители получают льготы при поступлении и путёвку на международные олимпиады.", cat: "olympiad", tags: ["физика", "математика", "исследования"], org: "МОН РК", verified: "VERIFIED", city: "Астана", format: "OFFLINE", price: 0, minGrade: 9, maxGrade: 11, minAge: 14, maxAge: 18, deadlineDays: 5, startDays: 30, participation: "INDIVIDUAL", docs: ["student_id", "transcript"], requirements: ["9–11 класс", "Победа на областном этапе"], prizes: "Дипломы, льготы при поступлении, отбор в сборную.", trust: 95, prestige: 95, difficulty: 90, competition: 85, featured: true, certificates: true },
  { slug: "nis-summer-research-2026", title: "NIS Summer Research Program", short: "Летняя исследовательская программа при поддержке университетов.", full: "Двухнедельная программа, где школьники проводят исследование под руководством учёных, готовят научную работу и презентуют результаты. Направления: биология, химия, экология, data science.", cat: "research", tags: ["исследования", "биология", "химия", "экология"], org: "NIS Research Center", verified: "VERIFIED", city: "Алматы", format: "OFFLINE", price: 0, minGrade: 10, maxGrade: 11, minAge: 15, maxAge: 18, deadlineDays: 14, startDays: 40, participation: "INDIVIDUAL", docs: ["cv", "motivation_letter", "recommendation", "transcript"], requirements: ["10–11 класс", "Интерес к науке", "Рекомендация учителя"], prizes: "Публикация исследования, сертификат, рекомендации для поступления.", selection: "Отбор по мотивации, рекомендации и оценкам.", trust: 90, prestige: 88, difficulty: 80, competition: 70, featured: true, scholarship: true, certificates: true },
  { slug: "almaty-ai-hackathon-2026", title: "Almaty AI Hackathon", short: "48 часов, чтобы построить AI-продукт.", full: "Хакатон для школьников и студентов: постройте работающий прототип с использованием AI за 48 часов. Треки: образование, здоровье, экология. Менторы, бесплатное питание, призы.", cat: "hackathon", tags: ["AI", "программирование", "предпринимательство"], org: "nFactorial", verified: "VERIFIED", city: "Алматы", format: "OFFLINE", price: 0, minGrade: 9, maxGrade: 11, minAge: 14, maxAge: 19, deadlineDays: 9, startDays: 20, participation: "TEAM", minTeam: 2, maxTeam: 4, docs: ["student_id", "project_presentation"], requirements: ["Базовые навыки программирования", "Команда 2–4 человека"], prizes: "Призы, стажировки, менторство.", trust: 88, prestige: 78, difficulty: 65, competition: 70, certificates: true, directApply: true },
  { slug: "mun-almaty-2026", title: "MUN Almaty 2026", short: "Модель ООН: дипломатия, дебаты, лидерство.", full: "Крупнейшая в регионе Модель ООН для школьников. Представляйте страну, участвуйте в комитетах, готовьте резолюции. Развивает публичные выступления и знание международных отношений.", cat: "mun", tags: ["международные отношения", "публичные выступления", "лидерство"], org: "MUN Kazakhstan", verified: "VERIFIED", city: "Алматы", format: "OFFLINE", price: 15000, minGrade: 8, maxGrade: 11, minAge: 13, maxAge: 18, deadlineDays: 12, startDays: 25, participation: "INDIVIDUAL", docs: ["student_id", "motivation_letter"], requirements: ["Уровень английского B1+", "8–11 класс"], prizes: "Best Delegate awards, сертификаты.", trust: 85, prestige: 80, difficulty: 60, competition: 55, aid: true, certificates: true },
  { slug: "debate-cup-kazakhstan-2026", title: "Debate Cup Kazakhstan", short: "Национальный дебатный турнир для школьников.", full: "Дебатный турнир по формату British Parliamentary. Тренировки, спикерские рейтинги, финал в прямом эфире. Развивает критическое мышление и аргументацию.", cat: "debate", tags: ["дебаты", "публичные выступления", "лидерство"], org: "Debate KZ", verified: "VERIFIED", city: "Астана", format: "HYBRID", price: 0, minGrade: 8, maxGrade: 11, minAge: 13, maxAge: 18, deadlineDays: 18, startDays: 35, participation: "TEAM", minTeam: 2, maxTeam: 2, docs: ["student_id"], requirements: ["Команда 2 человека", "Базовый опыт дебатов"], prizes: "Кубок, медали, сертификаты.", trust: 84, prestige: 72, difficulty: 55, competition: 50, certificates: true },
  { slug: "first-robotics-kazakhstan-2026", title: "FIRST Robotics Kazakhstan", short: "Соберите и запрограммируйте робота для соревнований.", full: "Международная программа робототехники FIRST. Команды проектируют, собирают и программируют роботов для выполнения задач на арене. Инженерия, программирование, командная работа.", cat: "robotics", tags: ["робототехника", "программирование", "инженерия"], org: "FIRST Kazakhstan", verified: "VERIFIED", city: "Караганда", format: "OFFLINE", price: 25000, minGrade: 8, maxGrade: 11, minAge: 13, maxAge: 18, deadlineDays: 22, startDays: 50, participation: "TEAM", minTeam: 4, maxTeam: 8, docs: ["student_id", "parental_consent"], requirements: ["Команда 4–8 человек", "Наставник"], prizes: "Награды, отбор на международный этап.", trust: 87, prestige: 82, difficulty: 75, competition: 60, aid: true, certificates: true },
  { slug: "young-scientists-competition-2026", title: "Конкурс молодых учёных", short: "Представьте своё научное исследование жюри.", full: "Республиканский конкурс исследовательских проектов школьников. Секции: математика, физика, биология, IT, экология. Защита проекта перед экспертным жюри.", cat: "science", tags: ["исследования", "математика", "биология", "физика"], org: "Академия наук РК", verified: "VERIFIED", city: "Астана", format: "OFFLINE", price: 0, minGrade: 9, maxGrade: 11, minAge: 14, maxAge: 18, deadlineDays: 20, startDays: 45, participation: "INDIVIDUAL", docs: ["motivation_letter", "project_presentation", "transcript"], requirements: ["Готовое исследование", "9–11 класс"], prizes: "Дипломы, гранты на обучение.", trust: 91, prestige: 86, difficulty: 78, competition: 65, scholarship: true, certificates: true },
  { slug: "python-for-teens-course-2026", title: "Python для школьников", short: "8-недельный онлайн-курс программирования с нуля.", full: "Онлайн-курс по Python для начинающих: основы, проекты, git. Каждую неделю — практика и разбор с наставником. По окончании — сертификат и портфолио проектов.", cat: "course", tags: ["программирование", "AI"], org: "Kolesa Academy", verified: "VERIFIED", format: "ONLINE", city: "Онлайн", price: 0, minGrade: 7, maxGrade: 11, minAge: 12, maxAge: 18, deadlineDays: 15, startDays: 20, participation: "INDIVIDUAL", docs: [], requirements: ["Компьютер и интернет"], prizes: "Сертификат, лучшие приглашаются на стажировку.", trust: 86, prestige: 65, difficulty: 40, competition: 30, certificates: true, directApply: true },
  { slug: "data-science-bootcamp-2026", title: "Data Science Bootcamp для школьников", short: "Интенсив по анализу данных и ML.", full: "Двухнедельный буткемп: Python, pandas, визуализация, основы машинного обучения. Финальный проект на реальных данных. Онлайн, с менторской поддержкой.", cat: "bootcamp", tags: ["AI", "программирование", "математика"], org: "DataCamp KZ", verified: "PENDING", format: "ONLINE", city: "Онлайн", price: 45000, minGrade: 9, maxGrade: 11, minAge: 14, maxAge: 18, deadlineDays: 25, startDays: 35, participation: "INDIVIDUAL", docs: ["motivation_letter"], requirements: ["Базовый Python", "9–11 класс"], prizes: "Сертификат, портфолио.", trust: 68, prestige: 60, difficulty: 60, competition: 35, aid: true, certificates: true },
  { slug: "harvard-summer-online-2026", title: "Летняя онлайн-программа зарубежного вуза", short: "Академические курсы уровня pre-college онлайн.", full: "Международная летняя программа: выберите курс по интересам (экономика, CS, биология), учитесь у преподавателей вуза, получите сертификат. Отличное усиление портфолио для поступления за рубеж.", cat: "summer", tags: ["экономика", "исследования", "международные отношения"], org: "Global Pre-College", verified: "VERIFIED", format: "ONLINE", city: "Онлайн", price: 350000, minGrade: 10, maxGrade: 11, minAge: 15, maxAge: 18, deadlineDays: 30, startDays: 60, participation: "INDIVIDUAL", docs: ["cv", "motivation_letter", "transcript", "recommendation"], requirements: ["Английский B2+", "10–11 класс"], prizes: "Сертификат об окончании, рекомендации.", trust: 82, prestige: 90, difficulty: 70, competition: 60, scholarship: true, aid: true, certificates: true },
  { slug: "youth-exchange-germany-2026", title: "Программа школьного обмена (Германия)", short: "Семестр в немецкой школе по программе обмена.", full: "Программа обмена: проживание в принимающей семье, обучение в немецкой школе, культурное погружение. Стипендии для сильных кандидатов.", cat: "exchange", tags: ["международные отношения", "лидерство"], org: "Deutsch-Kasachischer Austausch", verified: "VERIFIED", city: "Онлайн", format: "OFFLINE", price: 0, minGrade: 9, maxGrade: 10, minAge: 15, maxAge: 17, deadlineDays: 28, startDays: 90, participation: "INDIVIDUAL", docs: ["passport", "motivation_letter", "transcript", "parental_consent", "recommendation"], requirements: ["Немецкий A2+ или английский B1+", "Загранпаспорт", "Согласие родителей"], prizes: "Полная или частичная стипендия.", selection: "Собеседование и мотивационное письмо.", trust: 89, prestige: 84, difficulty: 65, competition: 70, scholarship: true },
  { slug: "clean-almaty-volunteer-2026", title: "Волонтёрская программа «Чистый Алматы»", short: "Экологическое волонтёрство с волонтёрскими часами.", full: "Присоединяйтесь к экоакциям: уборка парков, посадка деревьев, эколого-просветительские мероприятия. Начисляются волонтёрские часы, выдаётся сертификат.", cat: "volunteer", tags: ["экология", "волонтёрство", "лидерство"], org: "EcoNGO Kazakhstan", verified: "VERIFIED", city: "Алматы", format: "OFFLINE", price: 0, minGrade: 7, maxGrade: 11, minAge: 12, maxAge: 18, deadlineDays: 40, startDays: 10, participation: "BOTH", docs: ["parental_consent"], requirements: ["Согласие родителей для младше 16"], prizes: "Волонтёрские часы, сертификат, благодарности.", trust: 80, prestige: 55, difficulty: 20, competition: 15, volunteerHours: true, certificates: true },
  { slug: "social-impact-challenge-2026", title: "Social Impact Challenge", short: "Придумайте и запустите социальный проект.", full: "Соревнование социальных проектов: команды решают проблему местного сообщества, получают менторство и грант на реализацию. Развивает лидерство и предпринимательство.", cat: "social", tags: ["предпринимательство", "лидерство", "волонтёрство"], org: "MOST Foundation", verified: "VERIFIED", city: "Шымкент", format: "HYBRID", price: 0, minGrade: 9, maxGrade: 11, minAge: 14, maxAge: 18, deadlineDays: 16, startDays: 30, participation: "TEAM", minTeam: 3, maxTeam: 6, docs: ["motivation_letter", "project_presentation"], requirements: ["Идея социального проекта", "Команда 3–6 человек"], prizes: "Гранты до 1 000 000 ₸ на реализацию.", trust: 83, prestige: 74, difficulty: 55, competition: 50, scholarship: true, certificates: true },
  { slug: "national-chess-championship-2026", title: "Первенство по шахматам среди школьников", short: "Республиканский шахматный турнир.", full: "Официальное первенство Казахстана по шахматам среди школьников. Классика и рапид, рейтинговые партии, отбор в сборную.", cat: "sport", tags: ["спорт", "математика"], org: "Федерация шахмат РК", verified: "VERIFIED", city: "Астана", format: "OFFLINE", price: 5000, minGrade: 5, maxGrade: 11, minAge: 10, maxAge: 18, deadlineDays: 24, startDays: 44, participation: "INDIVIDUAL", docs: ["student_id"], requirements: ["Спортивный разряд приветствуется"], prizes: "Медали, разряды, отбор в сборную.", trust: 88, prestige: 70, difficulty: 60, competition: 65, aid: true, certificates: true },
  { slug: "national-film-contest-2026", title: "Конкурс короткометражных фильмов", short: "Снимите короткометражку и покажите на фестивале.", full: "Творческий конкурс для юных кинематографистов: сценарий, съёмка, монтаж короткометражного фильма на заданную тему. Показ финалистов на фестивале.", cat: "creative", tags: ["дизайн", "публичные выступления"], org: "Youth Film Festival", verified: "UNVERIFIED", city: "Алматы", format: "HYBRID", price: 0, minGrade: 8, maxGrade: 11, minAge: 13, maxAge: 18, deadlineDays: 33, startDays: 55, participation: "BOTH", docs: ["motivation_letter"], requirements: ["Короткометражка до 10 минут"], prizes: "Награды, показ на фестивале.", trust: 62, prestige: 58, difficulty: 50, competition: 40, certificates: true },
  { slug: "it-company-internship-2026", title: "Летняя стажировка в IT-компании", short: "Первый опыт работы в продуктовой команде.", full: "Оплачиваемая летняя стажировка для старшеклассников: работа с наставником, реальные задачи, знакомство с процессами разработки. Направления: frontend, QA, дизайн.", cat: "internship", tags: ["программирование", "дизайн", "предпринимательство"], org: "Kaspi.kz", verified: "VERIFIED", city: "Алматы", format: "OFFLINE", price: 0, minGrade: 11, maxGrade: 11, minAge: 16, maxAge: 18, deadlineDays: 11, startDays: 40, participation: "INDIVIDUAL", docs: ["cv", "motivation_letter"], requirements: ["11 класс", "Базовые технические навыки", "Возраст 16+"], prizes: "Оплата, оффер на будущее, опыт.", selection: "Резюме и техническое собеседование.", trust: 90, prestige: 88, difficulty: 70, competition: 80, featured: true },
  { slug: "women-in-tech-mentorship-2026", title: "Mentorship: девушки в технологиях", short: "Персональный ментор из IT на 3 месяца.", full: "Менторская программа для девушек 9–11 классов, интересующихся технологиями. Персональный ментор, карьерные консультации, помощь с проектами и портфолио.", cat: "mentorship", tags: ["программирование", "лидерство", "AI"], org: "Women in Tech KZ", verified: "VERIFIED", format: "ONLINE", city: "Онлайн", price: 0, minGrade: 9, maxGrade: 11, minAge: 14, maxAge: 18, deadlineDays: 19, startDays: 30, participation: "INDIVIDUAL", docs: ["motivation_letter"], requirements: ["Девушки 9–11 класс", "Интерес к IT"], prizes: "Менторство, нетворкинг, сертификат.", trust: 85, prestige: 68, difficulty: 30, competition: 45, certificates: true, directApply: true },
  { slug: "youth-forum-central-asia-2026", title: "Youth Forum Central Asia", short: "Форум лидеров: спикеры, воркшопы, нетворкинг.", full: "Международный молодёжный форум: выступления лидеров, воркшопы по лидерству и предпринимательству, нетворкинг с ровесниками из Центральной Азии.", cat: "forum", tags: ["лидерство", "международные отношения", "предпринимательство"], org: "Central Asia Youth", verified: "PENDING", city: "Астана", format: "OFFLINE", price: 20000, minGrade: 9, maxGrade: 11, minAge: 15, maxAge: 18, deadlineDays: 26, startDays: 48, participation: "INDIVIDUAL", docs: ["motivation_letter", "student_id"], requirements: ["Английский B1+", "Мотивационное письмо"], prizes: "Сертификат участника, нетворкинг.", trust: 70, prestige: 66, difficulty: 45, competition: 40, aid: true, certificates: true },
  { slug: "future-leaders-career-program-2026", title: "Future Leaders: карьерная программа", short: "Профориентация, тесты и встречи с профессионалами.", full: "Программа профориентации: карьерные тесты, встречи с профессионалами из разных сфер, помощь в выборе университета и специальности.", cat: "career", tags: ["лидерство", "экономика", "предпринимательство"], org: "Career Center KZ", verified: "UNVERIFIED", format: "ONLINE", city: "Онлайн", price: 0, minGrade: 10, maxGrade: 11, minAge: 15, maxAge: 18, deadlineDays: 35, startDays: 42, participation: "INDIVIDUAL", docs: [], requirements: ["10–11 класс"], prizes: "Индивидуальный карьерный план.", trust: 64, prestige: 52, difficulty: 25, competition: 20, certificates: true, directApply: true },
  { slug: "math-olympiad-online-2026", title: "Онлайн-олимпиада по математике", short: "Открытая онлайн-олимпиада с дипломами.", full: "Открытая онлайн-олимпиада по математике для 7–11 классов. Задачи разного уровня, автоматическая проверка, дипломы победителям и призёрам.", cat: "olympiad", tags: ["математика", "исследования"], org: "Matematika Online", verified: "VERIFIED", format: "ONLINE", city: "Онлайн", price: 0, minGrade: 7, maxGrade: 11, minAge: 12, maxAge: 18, deadlineDays: 6, startDays: 8, participation: "INDIVIDUAL", docs: [], requirements: ["7–11 класс"], prizes: "Дипломы I, II, III степени, сертификаты.", trust: 78, prestige: 62, difficulty: 55, competition: 45, certificates: true, directApply: true },
  { slug: "biology-research-camp-2026", title: "Биологический исследовательский лагерь", short: "Полевые исследования и лабораторная работа.", full: "Летний лагерь: полевые исследования экосистем, работа в лаборатории, знакомство с методами биологии. Проживание, питание, наставники-биологи.", cat: "summer", tags: ["биология", "экология", "исследования"], org: "BioCamp Kazakhstan", verified: "VERIFIED", city: "Алматы", format: "OFFLINE", price: 120000, minGrade: 9, maxGrade: 11, minAge: 14, maxAge: 18, deadlineDays: 21, startDays: 55, participation: "INDIVIDUAL", docs: ["parental_consent", "motivation_letter", "transcript"], requirements: ["Интерес к биологии", "Согласие родителей"], prizes: "Сертификат, исследовательский опыт.", trust: 81, prestige: 72, difficulty: 60, competition: 40, aid: true, scholarship: true, certificates: true },
  { slug: "guaranteed-admission-program-scam-2026", title: "Гарантированное поступление в топ-вуз за 3 месяца", short: "«Гарантия зачисления» и быстрый результат.", full: "Программа обещает 100% поступление в зарубежный университет всего за 3 месяца при предоплате. Условия неясны, юридическая информация отсутствует, контактов организатора нет.", cat: "course", tags: ["международные отношения"], org: "EduFast Group", verified: "UNVERIFIED", format: "ONLINE", city: "Онлайн", price: 500000, minGrade: 10, maxGrade: 11, minAge: 15, maxAge: 18, deadlineDays: 3, startDays: 7, participation: "INDIVIDUAL", docs: ["passport"], requirements: ["Предоплата 100%"], prizes: "«Гарантированное поступление».", trust: 18, prestige: 30, difficulty: 20, competition: 10, status: "SUSPICIOUS" },
  { slug: "expired-spring-hackathon-2026", title: "Весенний хакатон (архив)", short: "Прошедший хакатон — приём заявок закрыт.", full: "Весенний школьный хакатон завершён. Приём заявок закрыт. Сохранён в каталоге как пример прошедшей возможности и для истории.", cat: "hackathon", tags: ["программирование", "AI"], org: "TechSchool KZ", verified: "VERIFIED", city: "Астана", format: "OFFLINE", price: 0, minGrade: 8, maxGrade: 11, minAge: 13, maxAge: 18, deadlineDays: -20, startDays: -10, participation: "TEAM", minTeam: 2, maxTeam: 4, docs: ["student_id"], requirements: ["Команда 2–4 человека"], prizes: "Призы (завершено).", trust: 80, prestige: 60, difficulty: 55, competition: 50, status: "CLOSED", certificates: true },
  { slug: "economics-olympiad-2026", title: "Олимпиада по экономике и финансовой грамотности", short: "Задачи по экономике и личным финансам.", full: "Олимпиада проверяет знание основ экономики, финансовой грамотности и логическое мышление. Онлайн-отбор и офлайн-финал.", cat: "olympiad", tags: ["экономика", "финансы", "математика"], org: "Halyk Finance Education", verified: "VERIFIED", city: "Алматы", format: "HYBRID", price: 0, minGrade: 9, maxGrade: 11, minAge: 14, maxAge: 18, deadlineDays: 13, startDays: 27, participation: "INDIVIDUAL", docs: ["student_id"], requirements: ["9–11 класс"], prizes: "Дипломы, стажировки в финсекторе.", trust: 87, prestige: 76, difficulty: 65, competition: 60, certificates: true },
  { slug: "chemistry-challenge-2026", title: "Chemistry Challenge", short: "Командный конкурс по химии с экспериментами.", full: "Командный конкурс по химии: теоретический тур и экспериментальный тур в лаборатории. Развивает практические навыки и работу в команде.", cat: "science", tags: ["химия", "исследования"], org: "ChemClub KZ", verified: "PENDING", city: "Караганда", format: "OFFLINE", price: 8000, minGrade: 9, maxGrade: 11, minAge: 14, maxAge: 18, deadlineDays: 17, startDays: 38, participation: "TEAM", minTeam: 2, maxTeam: 3, docs: ["student_id", "parental_consent"], requirements: ["Команда 2–3 человека", "Знание химии"], prizes: "Медали, реактивы для школьной лаборатории.", trust: 66, prestige: 64, difficulty: 68, competition: 45, aid: true, certificates: true },
  { slug: "coding-mentorship-online-2026", title: "Менторство по программированию", short: "Наставник поможет собрать первый проект.", full: "Онлайн-менторство: наставник поможет выбрать направление, собрать первый проект и оформить его в портфолио. 6 недель, еженедельные созвоны.", cat: "mentorship", tags: ["программирование", "AI", "дизайн"], org: "CodeMentor KZ", verified: "UNVERIFIED", format: "ONLINE", city: "Онлайн", price: 0, minGrade: 8, maxGrade: 11, minAge: 13, maxAge: 18, deadlineDays: 23, startDays: 30, participation: "INDIVIDUAL", docs: [], requirements: ["Желание учиться"], prizes: "Готовый проект в портфолио.", trust: 60, prestige: 50, difficulty: 35, competition: 25, certificates: true, directApply: true },
  { slug: "national-volunteer-week-2026", title: "Неделя национального волонтёрства", short: "Волонтёрские активности по всей стране.", full: "Общенациональная неделя волонтёрства: выберите активность в своём городе — помощь приютам, экоакции, работа с пожилыми. Волонтёрские часы и сертификат.", cat: "volunteer", tags: ["волонтёрство", "лидерство", "экология"], org: "Volunteer Kazakhstan", verified: "VERIFIED", city: "Астана", format: "OFFLINE", price: 0, minGrade: 7, maxGrade: 11, minAge: 12, maxAge: 18, deadlineDays: 34, startDays: 44, participation: "BOTH", docs: ["parental_consent"], requirements: ["Согласие родителей для младше 16"], prizes: "Волонтёрские часы, сертификаты.", trust: 84, prestige: 56, difficulty: 15, competition: 10, volunteerHours: true, certificates: true },
  { slug: "robotics-summer-intensive-2026", title: "Летний интенсив по робототехнике", short: "Соберите робота с нуля за 3 недели.", full: "Практический интенсив: электроника, Arduino, программирование, сборка робота. Финальные соревнования между командами. Для начинающих и продолжающих.", cat: "robotics", tags: ["робототехника", "инженерия", "программирование"], org: "RoboLab Astana", verified: "VERIFIED", city: "Астана", format: "OFFLINE", price: 60000, minGrade: 7, maxGrade: 11, minAge: 12, maxAge: 18, deadlineDays: 27, startDays: 50, participation: "BOTH", docs: ["parental_consent"], requirements: ["Согласие родителей"], prizes: "Собранный робот, сертификат, награды.", trust: 83, prestige: 67, difficulty: 55, competition: 35, aid: true, scholarship: true, certificates: true },
  { slug: "english-debate-online-league-2026", title: "Онлайн-лига дебатов на английском", short: "Еженедельные дебаты и рост спикерского рейтинга.", full: "Онлайн-лига дебатов на английском: еженедельные раунды, судейство, спикерские рейтинги. Отличная практика английского и аргументации из любого города.", cat: "debate", tags: ["дебаты", "публичные выступления", "международные отношения"], org: "English Debate League", verified: "VERIFIED", format: "ONLINE", city: "Онлайн", price: 0, minGrade: 8, maxGrade: 11, minAge: 13, maxAge: 18, deadlineDays: 7, startDays: 12, participation: "TEAM", minTeam: 2, maxTeam: 2, docs: [], requirements: ["Английский B1+", "Команда 2 человека"], prizes: "Рейтинг, дипломы, отбор на офлайн-турниры.", trust: 82, prestige: 64, difficulty: 50, competition: 40, certificates: true, directApply: true },
];

// Categories, plans and feature flags are real reference data and always seed.
// Demo accounts (all `password123`) and demo content only seed outside production
// unless SEED_DEMO=true is set explicitly — otherwise a prod deploy would ship
// open credentials.
const SEED_DEMO = process.env.SEED_DEMO === "true" || process.env.NODE_ENV !== "production";

async function main() {
  console.log("Seeding…");

  // Categories
  const catMap: Record<string, string> = {};
  for (let i = 0; i < CATEGORIES.length; i++) {
    const c = CATEGORIES[i];
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, nameRu: c.nameRu, nameKz: c.nameKz, icon: c.icon, order: i },
      create: { slug: c.slug, name: c.name, nameRu: c.nameRu, nameKz: c.nameKz, icon: c.icon, order: i },
    });
    catMap[c.slug] = cat.id;
  }

  // Plans & flags
  for (const p of PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { slug: p.slug },
      update: { name: p.name, priceKzt: p.priceKzt, order: p.order, entitlements: p.entitlements },
      create: { slug: p.slug, name: p.name, priceKzt: p.priceKzt, order: p.order, entitlements: p.entitlements },
    });
  }
  for (const f of FEATURE_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: f.key },
      update: { description: f.description },
      create: { key: f.key, enabled: f.enabled, description: f.description },
    });
  }

  if (!SEED_DEMO) {
    console.log(`Seeded ${CATEGORIES.length} categories and ${PLANS.length} plans.`);
    console.log("SEED_DEMO not set — skipped demo opportunities and accounts (production-safe).");
    return;
  }

  // Demo opportunities are useful only for local development and screenshots.
  for (const o of OPPS) {
    const deadline = o.deadlineDays === null ? null : d(o.deadlineDays);
    const start = o.startDays != null ? d(o.startDays, 9) : null;
    let status: OpportunityStatus = o.status ?? "PUBLISHED";
    if (!o.status && deadline) {
      const days = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (days < 0) status = "CLOSED";
      else if (days <= 7) status = "DEADLINE_SOON";
      else status = "REGISTRATION_OPEN";
    }

    await prisma.opportunity.upsert({
      where: { slug: o.slug },
      update: {},
      create: {
        slug: o.slug,
        title: o.title,
        shortDescription: o.short,
        fullDescription: o.full,
        categoryId: catMap[o.cat],
        tags: o.tags,
        organizerName: o.org,
        organizerVerified: o.verified ?? "UNVERIFIED",
        sourceType: "manual",
        applicationUrl: o.applicationUrl,
        country: "Kazakhstan",
        city: o.city ?? null,
        format: o.format ?? "OFFLINE",
        minimumAge: o.minAge ?? null,
        maximumAge: o.maxAge ?? null,
        minimumGrade: o.minGrade ?? null,
        maximumGrade: o.maxGrade ?? null,
        requiredLanguages: [],
        participationType: o.participation ?? "INDIVIDUAL",
        minimumTeamSize: o.minTeam ?? null,
        maximumTeamSize: o.maxTeam ?? null,
        price: o.price ?? 0,
        currency: "KZT",
        financialAidAvailable: o.aid ?? false,
        scholarshipAvailable: o.scholarship ?? false,
        applicationDeadline: deadline,
        eventStartDate: start,
        requiredDocuments: o.docs ?? [],
        requirements: o.requirements ?? [],
        selectionProcess: o.selection ?? null,
        prizes: o.prizes ?? null,
        certificatesAvailable: o.certificates ?? false,
        volunteerHoursAvailable: o.volunteerHours ?? false,
        directApplySupported: o.directApply ?? false,
        applicationMethod: o.directApply ? "internal_form" : "external",
        prestigeScore: o.prestige,
        difficultyScore: o.difficulty ?? 50,
        competitionScore: o.competition ?? 50,
        trustScore: o.trust,
        confidenceScore: 85,
        verifiedAt: o.verified === "VERIFIED" ? new Date() : null,
        lastCheckedAt: new Date(),
        status,
        moderationStatus: "APPROVED",
        isFeatured: o.featured ?? false,
        isSponsored: o.sponsored ?? false,
      },
    });
  }

  // Admin user
  const adminHash = await bcrypt.hash("password123", 10);
  await prisma.user.upsert({
    where: { email: "admin@demo.kz" },
    update: {},
    create: { email: "admin@demo.kz", passwordHash: adminHash, role: "ADMIN", locale: "ru" },
  });

  // Demo student, onboarded
  const studentHash = await bcrypt.hash("password123", 10);
  const student = await prisma.user.upsert({
    where: { email: "student@demo.kz" },
    update: {},
    create: {
      email: "student@demo.kz",
      passwordHash: studentHash,
      role: "STUDENT",
      locale: "ru",
      studentProfile: {
        create: {
          firstName: "Асель",
          lastName: "Нурланова",
          birthDate: new Date("2009-03-14"),
          city: "Алматы",
          school: "НИШ Алматы",
          grade: 10,
          interests: ["technology", "entrepreneurship", "science"],
          skills: ["programming", "public_speaking", "math"],
          goals: ["study_abroad", "portfolio", "competitions"],
          maxBudget: 100000,
          willingToTravel: true,
          hasPassport: true,
          preferredLanguages: ["ru", "en"],
          onboardingCompleted: true,
          onboardingStep: 6,
        },
      },
    },
    include: { studentProfile: true },
  });

  // Demo data for the student
  const freePicks = await prisma.opportunity.findMany({
    where: { slug: { in: ["almaty-ai-hackathon-2026", "python-for-teens-course-2026", "mun-almaty-2026"] } },
  });
  for (const o of freePicks) {
    await prisma.savedOpportunity.upsert({
      where: { userId_opportunityId: { userId: student.id, opportunityId: o.id } },
      update: {},
      create: { userId: student.id, opportunityId: o.id },
    });
  }
  await prisma.opportunity.updateMany({
    where: { id: { in: freePicks.map((o) => o.id) } },
    data: { saveCount: { increment: 1 } },
  });

  const hack = freePicks.find((o) => o.slug === "almaty-ai-hackathon-2026");
  if (hack) {
    await prisma.application.upsert({
      where: { userId_opportunityId: { userId: student.id, opportunityId: hack.id } },
      update: {},
      create: {
        userId: student.id,
        opportunityId: hack.id,
        status: "PREPARING",
        progress: 40,
        checklist: [
          { id: "profile", label: "Проверить данные профиля", done: true },
          { id: "doc_student_id", label: "Документ: Ученический билет", done: true },
          { id: "doc_project_presentation", label: "Документ: Презентация проекта", done: false },
          { id: "review", label: "Финальная проверка заявки", done: false },
        ],
        notes: "Идея: AI-помощник для подготовки к олимпиадам. Собрать команду из 3 человек.",
        statusHistory: { create: { status: "PREPARING", note: "Workspace создан" } },
      },
    });
  }

  await prisma.achievement.createMany({
    data: [
      { userId: student.id, title: "2 место, городская олимпиада по информатике", organization: "Управление образования Алматы", type: "AWARD", date: new Date("2025-11-15"), result: "2 место", level: "city", skills: ["programming"] },
      { userId: student.id, title: "Участник MUN Almaty 2025", organization: "MUN Kazakhstan", type: "MUN", date: new Date("2025-10-05"), role: "Делегат", level: "city" },
      { userId: student.id, title: "Волонтёр экоакции «Чистый Алматы»", organization: "EcoNGO", type: "VOLUNTEER", date: new Date("2025-09-20"), hours: 24, level: "city" },
    ],
    skipDuplicates: true,
  });

  await prisma.document.createMany({
    data: [
      { userId: student.id, name: "CV_Асель_2026.pdf", type: "cv", isMock: true },
      { userId: student.id, name: "Ученический_билет.pdf", type: "student_id", isMock: true },
    ],
    skipDuplicates: true,
  });

  await prisma.notification.createMany({
    data: [
      { userId: student.id, type: "deadline_1", title: "Дедлайн завтра", body: "Astana Hub Startup Weekend — приём заявок закрывается завтра.", link: "/opportunities/astana-hub-startup-weekend-2026" },
      { userId: student.id, type: "new_match", title: "Новая подходящая возможность", body: "Almaty AI Hackathon — совпадение с вашим профилем.", link: "/opportunities/almaty-ai-hackathon-2026" },
      { userId: student.id, type: "welcome", title: "Добро пожаловать!", body: "Мы подобрали первые возможности под ваш профиль.", link: "/app", isRead: true },
    ],
  });

  // Demo organizer — owns a couple of the seeded opportunities so the
  // organizer portal has real numbers instead of zeros.
  const organizerUser = await prisma.user.upsert({
    where: { email: "organizer@demo.kz" },
    update: {},
    create: { email: "organizer@demo.kz", passwordHash: adminHash, role: "ORGANIZER", locale: "ru" },
  });
  const organizer = await prisma.organizer.upsert({
    where: { userId: organizerUser.id },
    update: {},
    create: {
      userId: organizerUser.id,
      name: "Astana Hub",
      type: "government",
      city: "Астана",
      website: "https://astanahub.com",
      email: "info@astanahub.com",
      description: "Международный технопарк IT-стартапов.",
      verificationStatus: "VERIFIED",
      verificationRequestedAt: new Date(),
    },
  });
  await prisma.opportunity.updateMany({
    where: { slug: { in: ["astana-hub-startup-weekend-2026", "almaty-ai-hackathon-2026"] } },
    data: { organizerId: organizer.id, organizerVerified: "VERIFIED", viewCount: 120 },
  });

  // Demo counsellor with the demo student already linked.
  const counselorUser = await prisma.user.upsert({
    where: { email: "counselor@demo.kz" },
    update: {},
    create: { email: "counselor@demo.kz", passwordHash: adminHash, role: "COUNSELOR", locale: "ru" },
  });
  const counselor = await prisma.counselorProfile.upsert({
    where: { userId: counselorUser.id },
    update: {},
    create: {
      userId: counselorUser.id,
      fullName: "Айгуль Сериковна",
      school: "НИШ Алматы",
      city: "Алматы",
      position: "Классный руководитель",
      verificationStatus: "VERIFIED",
    },
  });
  await prisma.counselorStudentLink.upsert({
    where: { counselorId_studentEmail: { counselorId: counselor.id, studentEmail: "student@demo.kz" } },
    update: {},
    create: {
      counselorId: counselor.id,
      studentEmail: "student@demo.kz",
      studentUserId: student.id,
      status: "active",
      inviteToken: "demo-counselor-invite-token",
      acceptedAt: new Date(),
    },
  });

  // Demo parent linked to the same student, with consents granted.
  const parentUser = await prisma.user.upsert({
    where: { email: "parent@demo.kz" },
    update: {},
    create: { email: "parent@demo.kz", passwordHash: adminHash, role: "PARENT", locale: "ru" },
  });
  const existingParentLink = await prisma.parentStudentLink.findFirst({
    where: { studentUserId: student.id, parentEmail: "parent@demo.kz" },
  });
  if (!existingParentLink) {
    await prisma.parentStudentLink.create({
      data: {
        studentUserId: student.id,
        parentEmail: "parent@demo.kz",
        parentName: "Нурлан Нурланов",
        parentUserId: parentUser.id,
        status: "active",
        inviteToken: "demo-parent-invite-token",
        acceptedAt: new Date(),
        consents: {
          create: (["DATA_PROCESSING", "DOCUMENT_STORAGE", "DATA_SHARING", "APPLICATION_SUBMIT"] as const).map(
            (type) => ({ type, studentUserId: student.id, granted: true, grantedAt: new Date() }),
          ),
        },
      },
    });
  }

  console.log(`Seeded ${OPPS.length} opportunities, ${CATEGORIES.length} categories, ${PLANS.length} plans.`);
  console.log(
    "Demo accounts (password123): admin@demo.kz, student@demo.kz, organizer@demo.kz, counselor@demo.kz, parent@demo.kz",
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

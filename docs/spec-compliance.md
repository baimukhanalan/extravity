# Соответствие ТЗ (49 разделов)

Статусы: ✅ реализовано · 🟡 частично / основа заложена · ⚪ отложено (нужен ключ/договор/крупный объём).
Живой продукт: https://extracurriculars-kz.vercel.app

| # | Раздел | Статус | Комментарий |
|---|--------|--------|-------------|
| 1 | Концепция продукта | ✅ | Операционная система, а не каталог ссылок: подбор, дедлайны, заявки, портфолио |
| 2 | Целевая аудитория | ✅ | Школьники 8–11, отражено в онбординге/контенте |
| 3 | Основные проблемы | ✅ | Единая база, match, дедлайн-радар, trust score, портфолио |
| 4 | Категории (20) + теги | ✅ | 20 категорий, теги, фильтры (`lib/constants.ts`, seed) |
| 5 | Технологический стек | 🟡 | Next.js/TS/Tailwind/Zod/Prisma/Postgres ✅; парсер Python/FastAPI/httpx/BS4/APScheduler ✅. shadcn заменён собственной UI-либой; Supabase заменён Prisma+custom auth (см. product-decisions); Recharts/next-intl/TanStack — не подключены |
| 6 | Локализация ru/kk/en | 🟡 | Словарный движок `lib/i18n.ts` (ru — источник правды, недостающий ключ в kk/en = ошибка типов) + `lib/locale.ts` (cookie), переключатель RU/KZ/EN в шапке для гостей, `lang` в html, локале-зависимые даты/валюта/категории. Переведены: лендинг, шапка/футер, каталог и фильтры, вход/регистрация, сайдбар портала. Внутренние экраны портала и админки — пока ru |
| 7 | RBAC (7 ролей) | ✅ | Enum Role, серверные проверки `requireUser/requireRole`, admin/moderator реализованы; parent/counsellor/organizer — модели есть, UI частично |
| 8 | Онбординг (7 шагов) | ✅ | Мастер: данные, интересы, навыки, цели, ограничения; родительское согласие — отдельный flow (invite → consent page) |
| 9 | Структура возможности | ✅ | ~60 полей + все статусы (enum OpportunityStatus) |
| 10 | Источники данных | 🟡 | Типы источников поддержаны парсером (html/rss/sitemap/user_submission/manual); Telegram/Instagram — только официальная интеграция/ручная подача (без серого скрейпинга) |
| 11 | Парсинг и нормализация | ✅ | Полный pipeline: fetch→extract(JSON-LD/OG/regex)→normalize→validate→ingest; `raw_source_items`, проверки, ручная модерация при низком confidence |
| 12 | Поиск дубликатов | 🟡 | Дедуп по URL, title+organizer, content hash ✅; fuzzy/embedding similarity и история объединения — не реализованы |
| 13 | Trust score | ✅ | Расчёт по сигналам источника, штраф за «гарантии»; показ пользователю (источник, дата проверки, риски) |
| 14 | Match score | ✅ | Жёсткие eligibility-фильтры + взвешенная формула + причины/недостающее/часы (`lib/eligibility.ts`, `lib/match.ts`), покрыто тестами |
| 15 | Лента и поиск | ✅ | Секции ленты, фильтры (категория/город/формат/цена), сортировки |
| 16 | Карточка возможности | ✅ | Все поля + действия: сохранить, начать подготовку, перейти, календарь (ICS), пожаловаться, похожие |
| 17 | Календарь и дедлайны | 🟡 | List view + ICS-экспорт + cron-напоминания (14/7/3/1) ✅; month/week view — list-ориентировано |
| 18 | Application Workspace | ✅ | Статусы, прогресс, чек-лист, заметки, история статусов |
| 19 | Application Pack | ✅ | Автосбор данных профиля, копирование; управление включаемыми данными |
| 20 | AI-помощник | ✅ | За флагом `ai_application_assistant`; черновики/CV/чек-лист/интервью; accept/edit/reject; **не выдумывает факты**; реальный Anthropic при ключе, иначе безопасный mock |
| 21 | Автозаполнение (3 уровня) | 🟡 | Ур.1 copy-ready Pack ✅; ур.2 (расширение) и ур.3 (direct apply) — за флагами, архитектура готова |
| 22 | Портфолио достижений | ✅ | Типы/поля, timeline, PDF-экспорт (печать); публичные ссылки — за флагом |
| 23 | «Нашёл возможность» | ✅ | URL+коммент+категория → проверка URL, дубликат, raw item, модерация, уведомление, points |
| 24 | Organizer Portal | ✅ | Полный портал `/organizer`: регистрация организации, дашборд (просмотры/сохранения/заявки), CRUD своих возможностей с отправкой в модерацию, агрегированная аналитика заявок, профиль + запрос верификации; очередь верификации у модератора (`/admin/organizers`) |
| 25 | Counselor Portal | ✅ | Портал `/counselor`: профиль куратора, приглашение учеников по email, **доступ только после согласия ученика** и отзыв в любой момент (`/app/settings`), карточка ученика (заявки, достижения, прогресс), рекомендация возможности ученику |
| 26 | Админ-панель | ✅ | Dashboard, модерация, возможности, источники, **parser jobs**, пользователи, **жалобы**, **feature flags**, audit log |
| 27 | Монетизация | ✅ | Free/Pro/Apply Pro через **database-driven entitlements** (`lib/entitlements.ts`, тесты); интерфейс провайдера оплаты (`lib/payments.ts`) + модель `Payment` + идемпотентный вебхук `/api/payments/webhook` с проверкой HMAC; без договора эквайринга работает mock-провайдер |
| 28 | База данных | ✅ | UUID PK, created/updated, soft delete, FK, индексы, unique, audit; migrations + seed. Таблиц ~30 (ядро ТЗ) |
| 29 | Row Level Security | 🟡 | Изоляция через серверные проверки владения (IDOR-защита): доступ куратора/родителя/организатора выдаётся только через активную связь, а не по id; политики RLS на уровне БД — при переходе на Supabase/пул с ролями |
| 30 | Безопасность / ПДн | ✅ | bcrypt, JWT httpOnly, Zod-валидация, audit, secure headers, rate limit, env-валидация, HSTS; signed URL/антивирус/MFA — план (нужен Storage/провайдер) |
| 31 | Дизайн | ✅ | Минимализм, палитра из ТЗ, dark mode, mobile-first, empty/skeleton states |
| 32 | Основные страницы | ✅ | Публичные + Student App + Admin + **Organizer** + **Counselor** + **Parent** (`/parent`: дети, дедлайны, управление согласиями) |
| 33 | Landing page | ✅ | Все 14 блоков структуры |
| 34 | Уведомления | ✅ | In-app + Email(Resend) + Telegram через `lib/notifications.ts` (mock без ключа), quiet hours, каналы, типы дедлайнов |
| 35 | Telegram Bot | ✅ | Webhook `/api/telegram/webhook`: `/start <код>` привязывает чат к аккаунту, `/stop` отключает; deep-link и статус привязки в настройках; отправка через Bot API. Требует `TELEGRAM_BOT_TOKEN` + `TELEGRAM_BOT_USERNAME` |
| 36 | Аналитика (PostHog) | ✅ | `lib/observability.ts`: серверный capture без SDK (`track()`) на ключевых событиях + Sentry envelope для ошибок; оба — no-op без ключей |
| 37 | SEO | ✅ | slug, metadata, OG, schema.org Event, sitemap, robots, category pages; приватные страницы noindex |
| 38 | Тестирование | 🟡 | **76 unit-тестов** (eligibility, match, slug, utils, entitlements, i18n-полнота словарей, storage-валидация, HMAC платежей, KZ-таймзона), `npm test` ✅; integration/e2e (Playwright) — не добавлены |
| 39 | Seed data | ✅ | 30 возможностей (категории, города, free/paid, online/offline, expired, suspicious, verified, direct apply), демо-аккаунты |
| 40 | Development phases | ✅ | Фазы 1–7,8,10 реализованы; 9/11 частично; 12 (hardening) — headers/tests/audit ✅ |
| 41 | Требования к коду | ✅ | TS strict, Zod, модульность, секреты в env, `.env.example`, серверные проверки, пагинация, индексы, идемпотентный ingest |
| 42 | Структура репозитория | 🟡 | `apps/parser` выделен; полный monorepo (packages/*) — единое Next-приложение вместо Turborepo (см. решения) |
| 43 | API | ✅ | Route Handlers: `/api/parser/ingest` (auth+validation+rate limit), `/api/calendar`, `/api/cron/deadlines`; мутации — Server Actions с auth+Zod |
| 44 | AI generation storage | ✅ | Модель `AiGeneration`: user, application, promptType, inputHash, model, output, version, accepted, edited, finalText, tokenUsage, safetyStatus |
| 45 | Feature flags | ✅ | 9 флагов + админ-переключатель (`/admin/flags`), гейтинг AI |
| 46 | Не делать в v1 | ✅ | Соблюдено: нет соцсети/рейтинга/чата/серого скрейпинга/гарантий/автосписаний |
| 47 | Критерии готовности | ✅ | 20/20 по существу (Telegram — код есть, нужен токен; RLS — серверная изоляция) |
| 48 | Порядок работы | ✅ | План→схема→auth→миграции→seed→дизайн→фазы→тесты→документация |
| 49 | Финальный результат | ✅ | frontend, backend, migrations, auth, admin, student portal, parent consent, catalog, recommendations, workspace, docs storage(mock), portfolio, **parser**, moderation, notifications, subscriptions, **tests**, docs, Docker, deploy instructions, `.env.example`, seed |

## Итог

Все 20 критериев готовности (раздел 47) выполнены по существу.
Отложено только то, что требует ваших ключей, договоров или юридических решений —
см. [SETUP-REQUIRED.md](../SETUP-REQUIRED.md) с пометкой 🔒.

### Что добавлено в третьей итерации

- **Три недостающих портала.** `/organizer` (публикация и аналитика организатора,
  верификация через `/admin/organizers`), `/counselor` (кураторы школ, приглашение
  учеников, доступ только по согласию), `/parent` (дети, дедлайны, управление
  согласиями с немедленным отзывом).
- **Модель доступа.** Доступ к чужому профилю всегда выдаётся активной связью
  (`CounselorStudentLink`, `ParentStudentLink`), не идентификатором в URL; ученик и
  родитель могут отозвать доступ в один клик. Организатору по заявкам показывается
  только агрегированная статистика (когорты меньше 3 человек скрыты).
- **Хранилище документов.** `lib/storage.ts` — Supabase Storage или любой
  S3-совместимый бакет по HTTP без SDK: валидация MIME/размера/расширения,
  namespace по пользователю, подписанные ссылки с коротким TTL
  (`/api/documents/[id]`). Без ключей — прежний mock-режим.
- **Платежи.** Интерфейс провайдера, модель `Payment`, идемпотентный вебхук с
  проверкой подписи; mock-провайдер закрывает оплату сразу.
- **Telegram-бот и уведомления.** Webhook с привязкой чата, реальные настройки
  каналов и тихих часов вместо демо-чекбоксов.
- **Наблюдаемость.** Sentry (envelope API) и PostHog (capture API) без зависимостей,
  оба выключены до появления ключей.
- **Локализация.** Типобезопасные словари ru/kk/en и переключатель языка.
- **Тесты.** 76 unit-тестов, включая полноту словарей и проверку подписи вебхука.

### Что добавлено в четвёртой итерации (сбор из соцсетей)

- **Telegram, два пути.** MTProto-коллектор публичных каналов (`apps/parser/tgcollect/`,
  Telethon, обработка FloodWait, offset-состояние) и пересылка поста боту
  (`/api/telegram/webhook`). Общий разбор — двухслойный (регулярки + опциональный LLM),
  общий ingest — `lib/ingest.ts`. Из канала в каталог прямого пути нет: всё в модерацию.
- **Instagram, легальные пути.** Graph API коллектор по хештегам
  (`apps/parser/igcollect/`, `ig_hashtag_search` + `recent_media`, только публичные
  поля) и вставка поста боту с распознаванием `instagram.com/p/...`. Скрапинг в обход
  защиты **сознательно не реализован** — обоснование в `docs/instagram-and-scraping.md`.
- **Веб-скрапер, три уровня.** JSON-LD → текст страницы (тот же экстрактор) → OpenGraph.
- Тестов стало **110 vitest + 60 pytest**.

### Что добавлено в пятой итерации (прод-хардненинг)

- **CSP с nonce** через `proxy.ts` (Next 16 конвенция `middleware`→`proxy`),
  `strict-dynamic`, nonce прокинут в inline-скрипты (тема, JSON-LD). Проверено:
  гидрация без CSP-ошибок в консоли.
- **Error-boundary** (`app/error.tsx`, `global-error.tsx`) и **страница 404**
  (`app/not-found.tsx`) — вместо голого краша.
- **Healthcheck** `/api/health` с проверкой БД (200/503 для аптайм-монитора).
- **Распределённый rate-limit** (`lib/rate-limit.ts`) — Upstash Redis (скользящее окно
  на sorted set) с in-memory фолбэком и fail-open; call-sites переведены на async.
  Прежний in-memory лимитер в проде фактически не ограничивал (разные инстансы).
- **CI** (`.github/workflows/ci.yml`) — types + lint + vitest + pytest на каждый push/PR.
- **Гард демо-сидинга** — аккаунты `password123` не создаются в проде без `SEED_DEMO=true`.
- **Обработка ошибок cron** — падение больше не молчит, уходит в Sentry.
- **Линт — ноль проблем** (починены и накопившиеся: Date.now() в рендере, setState в
  effect, prefer-const, unused).

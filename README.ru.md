# Extravity

Единая операционная система внеклассных возможностей для школьников Казахстана:
поиск и персональный подбор возможностей, контроль дедлайнов, подготовка заявок
и долгосрочное портфолио достижений.

**Живая демо-версия:** https://extracurriculars-kz.vercel.app

> Демо-доступ (пароль везде `password123`):
> - Ученик: `student@demo.kz`
> - Администратор: `admin@demo.kz`
> - Организатор: `organizer@demo.kz`
> - Куратор: `counselor@demo.kz`
> - Родитель: `parent@demo.kz`

---

## Что умеет продукт (реализовано)

- **Лендинг** с переходом в портал (регистрация / вход).
- **Аутентификация** email + пароль (bcrypt), сессии на JWT в httpOnly-cookie, RBAC (7 ролей).
- **Онбординг школьника** — пошаговый мастер (данные, интересы, навыки, цели, ограничения).
- **Каталог возможностей** — публичный, с поиском, фильтрами (категория, город, формат, цена) и пагинацией.
- **Персональная лента** — секции «Рекомендовано», «Дедлайн скоро», «Бесплатные», «В вашем городе» и др.
- **Eligibility + Match score** — жёсткие фильтры (возраст, класс, город, язык, бюджет) и мягкая оценка соответствия с объяснениями.
- **Trust score** — оценка надёжности возможности, пометка подозрительных.
- **Сохранённое, Календарь дедлайнов** (+ экспорт ICS), **Уведомления**.
- **Application Workspace** — статусы, чек-лист, заметки, Application Pack (данные профиля для копирования).
- **Документы** и **Портфолио / достижения** (+ экспорт в PDF через печать).
- **«Нашёл возможность»** — отправка ссылки на модерацию.
- **Админ-панель** — дашборд, модерация ссылок, CRUD возможностей, смена статусов, пользователи, верификация организаторов, источники, audit log.
- **Портал организатора** (`/organizer`) — регистрация организации, публикация возможностей через модерацию, просмотры/сохранения/конверсия, агрегированная статистика заявок (без персональных данных), запрос верификации.
- **Портал куратора** (`/counselor`) — приглашение учеников по email, доступ к профилю **только после согласия ученика** (и отзыв в один клик), прогресс по заявкам, рекомендация возможностей.
- **Портал родителя** (`/parent`) — дети, их дедлайны и плановые расходы, выдача и мгновенный отзыв согласий.
- **Локализация ru / kk / en** — переключатель в шапке, типобезопасные словари, локале-зависимые даты и валюта.
- **Тарифы / подписка** — database-driven entitlements, провайдер оплаты с вебхуком (mock без договора эквайринга).
- **SEO** — метаданные, Open Graph, schema.org Event, `sitemap.xml`, `robots.txt`, локализованные slug'и.
- **Тёмная тема**, mobile-first, доступность.

Интеграции, которые **написаны, но ждут ключей**: хранилище документов (Supabase Storage
или S3), email (Resend), Telegram-бот (webhook + привязка чата), Sentry, PostHog, эквайринг.
Без ключей каждая из них — явный mock, помеченный в интерфейсе. Что нужно от вас —
[SETUP-REQUIRED.md](SETUP-REQUIRED.md); почему так — [docs/product-decisions.md](docs/product-decisions.md).

---

## Стек

- **Next.js 16** (App Router, Server Actions, Route Handlers), **React 19**, **TypeScript** (strict).
- **Tailwind CSS v4**, собственная UI-библиотека, **lucide-react**.
- **Prisma 6** + **PostgreSQL** (локально — Postgres; прод — **Neon** serverless Postgres).
- **Zod** — валидация. **jose** — JWT. **bcryptjs** — пароли.
- **Vercel** — хостинг frontend + серверная логика.

---

## Локальный запуск

Требуется Node.js 20.9+ и PostgreSQL.

```bash
# 1. Зависимости
npm install

# 2. Настроить окружение
cp .env.example .env
#   и указать DATABASE_URL (локальный Postgres) и AUTH_SECRET (openssl rand -hex 32)

# 3. Применить схему БД и загрузить демо-данные
npx prisma migrate deploy
npm run db:seed

# 4. Запустить
npm run dev
```

Откройте http://localhost:3000. Демо-аккаунты — см. выше.

> Быстрый Postgres через Homebrew:
> ```bash
> brew install postgresql@16 && brew services start postgresql@16
> createdb extracurriculars
> # DATABASE_URL="postgresql://<user>@localhost:5432/extracurriculars?schema=public"
> ```

### Полезные команды

| Команда | Действие |
|---|---|
| `npm run dev` | Дев-сервер |
| `npm run build` | Прод-сборка (`prisma generate && next build`) |
| `npm run db:migrate` | Создать/применить миграцию (dev) |
| `npm run db:deploy` | Применить миграции (prod) |
| `npm run db:seed` | Загрузить демо-данные |
| `npm run db:reset` | Сбросить БД и пересеять |

---

## Деплой (Vercel + Neon)

1. Создайте БД: Vercel → **Storage → Create Database → Neon** (Free). Скопируйте `DATABASE_URL`.
2. Задайте переменные окружения проекта (`vercel env add ...` или в дашборде):
   - `DATABASE_URL` — пул-строка Neon с `?sslmode=require&pgbouncer=true`
   - `AUTH_SECRET` — `openssl rand -hex 32`
   - `NEXT_PUBLIC_APP_URL` — прод-URL (напр. `https://extracurriculars-kz.vercel.app`)
   - `NEXT_PUBLIC_APP_NAME` — `Extravity`
3. Примените миграции и сид к прод-БД (через **прямое** подключение — unpooled URL):
   ```bash
   DATABASE_URL="<neon-unpooled-url>" npm run db:deploy
   DATABASE_URL="<neon-unpooled-url>" npm run db:seed
   ```
4. Деплой: `vercel --prod`.

Подробнее — [docs/deployment.md](docs/deployment.md).

---

## Парсер (сбор данных)

Реальный сервис в [`apps/parser`](apps/parser/README.md): fetch → extract (schema.org/RSS) →
normalize → ingest в очередь модерации приложения. Соблюдает robots.txt и rate limits, ничего
не публикует автоматически. Быстрый прогон:

Если в извлечённой записи не подтверждены страна, формат или стоимость участия,
карточка остаётся в очереди: отсутствующие поля перечислены в
`provenance.adminOnlyJson.ingestUnknownTerms` и в описании для проверки.
Значения по умолчанию в обязательных полях БД не считаются подтверждением;
публикация такой карточки заблокирована. Повторный разбор того же источника
очищает отметку только после получения всех трёх полей явно. Если очередной
разбор снова не содержит поле, блокировка возвращается, даже если предыдущий
разбор его содержал. Интерфейса для ручного исправления этих полей и снятия
отметки пока нет: такие карточки должны ждать исправленного источника или
отдельного рабочего процесса проверки модератором.

```bash
cd apps/parser && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
APP_URL=<app-url> PARSER_INGEST_SECRET=<secret> python run.py   # или --dry-run
```

## Тесты

Unit-тесты (Vitest) на eligibility, match score, slug, date-утилиты, entitlements,
полноту словарей локализации, валидацию загрузок и проверку подписи платёжного вебхука:

```bash
npm test        # 76 тестов
```

## Документация

- [SETUP-REQUIRED.md](SETUP-REQUIRED.md) — **что требуется от вас** для полной функциональности
- [docs/setup-guide.md](docs/setup-guide.md) — **пошаговый гайд**: где взять каждый ключ и куда вставить
- [telegram-ingestion.md](docs/telegram-ingestion.md) — сбор возможностей из Telegram (MTProto/Telethon + ИИ-разбор)
- [instagram-and-scraping.md](docs/instagram-and-scraping.md) — Instagram, веб-скрапинг и границы автоматического сбора
- [spec-compliance.md](docs/spec-compliance.md) — соответствие ТЗ по всем 49 разделам
- [architecture.md](docs/architecture.md) — структура и слои приложения
- [database.md](docs/database.md) — модель данных
- [permissions.md](docs/permissions.md) — роли и доступы
- [security.md](docs/security.md) — безопасность и данные несовершеннолетних
- [parser.md](docs/parser.md) — сервис сбора данных
- [deployment.md](docs/deployment.md) — деплой
- [product-decisions.md](docs/product-decisions.md) — принятые решения и ограничения

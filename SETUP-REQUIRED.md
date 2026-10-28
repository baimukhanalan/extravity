# Что требуется от вас для полной функциональности

> 📘 **Пошаговый гайд «где взять → куда вставить» по каждому ключу — [docs/setup-guide.md](docs/setup-guide.md).**

Текущий статус: продукт **задеплоен и работает** — https://extracurriculars-kz.vercel.app
(каталог, аутентификация, портал школьника, заявки, портфолио, админка, модерация,
парсер, **порталы организатора / куратора / родителя**).

Ниже — всё, что нужно **от вас**. То, что я **не могу** сделать за вас, помечено 🔒
(создание аккаунтов, ввод паролей/платёжных данных, юридические решения).
Всё остальное уже написано в коде и включится в момент появления ключа.

---

## 0. Что уже готово (делать ничего не нужно)

- ✅ Приложение на Vercel + живая БД Neon (PostgreSQL).
- ✅ Аутентификация, RBAC, портал школьника, админка, модерация.
- ✅ Портал организатора (`/organizer`), куратора (`/counselor`), родителя (`/parent`).
- ✅ Реальный парсер (`apps/parser`): fetch → extract → normalize → ingest → модерация.
- ✅ Демо-аккаунты (пароль `password123`): `student@demo.kz`, `admin@demo.kz`,
  `organizer@demo.kz`, `counselor@demo.kz`, `parent@demo.kz`.

---

## 1. Обязательно для «боевого» запуска

### 1.1. 🔒 Сменить демо-секреты и удалить демо-аккаунты
- Новый `AUTH_SECRET` (`openssl rand -hex 32`) в Vercel.
- Удалить/сменить пароли всех `*@demo.kz`.
- Создать реальный аккаунт администратора (регистрация → выставить роль `ADMIN` в БД).

### 1.2. 🔒 Свой домен
- Купить домен (например, `extracurriculars.kz`), добавить в Vercel, обновить `NEXT_PUBLIC_APP_URL`.
- DNS по желанию через Cloudflare (WAF, rate limiting).

### 1.3. Хранилище документов — **код готов, нужны ключи** 🔒
Загрузка, подписанные ссылки, валидация MIME/размера/расширения уже реализованы
(`lib/storage.ts`, `/api/documents/upload`, `/api/documents/[id]`). Включается любым из двух наборов:

| Вариант | Переменные |
|---|---|
| Supabase Storage | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_BUCKET` |
| S3-совместимое | `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `STORAGE_BUCKET` |

Бакет должен быть **приватным** — файлы отдаются только по подписанной ссылке с TTL 5 минут.
Без ключей документы сохраняются как карточки без файлов (помечены «без файла»).

### 1.4. Юридические документы
- 🔒 Юрист проверяет `Privacy Policy` и `Terms of Service` (сейчас демо-заглушки).
- 🔒 Оформить обработку ПДн несовершеннолетних по законодательству РК.
- Родительский consent-flow уже работает (`/parent/consents`, отзыв — мгновенный).

---

## 2. Уведомления

### 2.1. Email — Resend 🔒
Аккаунт на resend.com + подтверждённый домен-отправитель.
Переменные: `RESEND_API_KEY`, `EMAIL_FROM`. Без ключа письма логируются как mock.

### 2.2. Telegram-бот 🔒 — **код готов**
1. Создать бота через @BotFather → токен и username.
2. Переменные: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` (любая случайная строка).
3. Зарегистрировать webhook:
   ```
   curl -F "url=https://<домен>/api/telegram/webhook" \
        -F "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
        https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook
   ```
Дальше пользователь жмёт «Открыть бота» в настройках — `/start <код>` привязывает чат,
`/stop` отключает.

---

## 3. Парсер (сбор возможностей)

- **Список источников** 🔒 — вы даёте разрешённые к чтению URL (официальные сайты, RSS,
  sitemap) по категориям → `apps/parser/sources.yaml`.
- **Хостинг парсера** 🔒 — отдельный процесс (Railway / Render / Fly.io / VPS; Vercel не
  подходит для воркеров). Env: `APP_URL`, `PARSER_INGEST_SECRET` (тот же, что в Vercel).

> Уже соблюдается в коде: robots.txt, rate limits и правила доступа источников
> и **без** массового серого скрейпинга Instagram/Telegram.

---

## 4. Платежи — **код готов, нужен договор** 🔒

Интерфейс провайдера, модель `Payment` и идемпотентный вебхук с проверкой HMAC уже есть
(`lib/payments.ts`, `/api/payments/webhook`).

- 🔒 Договор эквайринга: **Halyk**, **Kaspi** или **CloudPayments**.
- Переменные: `PAYMENT_PROVIDER` (`halyk` / `kaspi` / `cloudpayments`), `PAYMENT_API_URL`,
  `PAYMENT_PUBLIC_ID`, `PAYMENT_SECRET`.
- Указать вебхук у эквайера: `https://<домен>/api/payments/webhook`.
- 🔒 Финализировать цены (сейчас Free / Pro Search 2 990 ₸ / Apply Pro 6 990 ₸ — правятся
  в таблице `SubscriptionPlan`).

Без этих переменных активен mock-провайдер: подписка включается сразу, деньги не движутся.

---

## 5. Наблюдаемость и аналитика — **код готов**

- **Sentry** 🔒 — аккаунт, `SENTRY_DSN` (ошибки уходят через envelope API, без SDK).
- **PostHog** 🔒 — аккаунт, `NEXT_PUBLIC_POSTHOG_KEY` (+ `NEXT_PUBLIC_POSTHOG_HOST`,
  по умолчанию EU). События: просмотр, сохранение, старт заявки, онбординг, оплата.

Оба — полный no-op без ключей, ничего не отправляется.

---

## 6. Функциональные хвосты (по желанию)

- ✅ Перевод интерфейса на kk/en — выполнен для всех экранов веб-приложения (порталы,
  публичные страницы, auth, error/404, сообщения server actions). Намеренно не переведены:
  юр-черновики privacy/terms (ждут юриста) и ответы Telegram-бота.
- Браузерное расширение (assisted apply, уровень 2 автозаполнения).
- AI-помощник заявок — 🔒 `ANTHROPIC_API_KEY` (без него — безопасный mock).
- RLS на уровне БД (сейчас — серверная изоляция владения).
- E2E-тесты (Playwright); сейчас 76 unit-тестов, `npm test`.

---

## Сводка переменных окружения (production)

| Переменная | Обязательна | Где взять |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon (пул-URL, `pgbouncer=true`) |
| `AUTH_SECRET` | ✅ | `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | ✅ | ваш домен |
| `NEXT_PUBLIC_APP_NAME` | ✅ | название |
| `PARSER_INGEST_SECRET` | для парсера | `openssl rand -hex 32`, одинаковый в app и парсере |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `STORAGE_BUCKET` | для документов | Supabase 🔒 |
| `S3_ENDPOINT` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | альтернатива Supabase | ваш S3 🔒 |
| `RESEND_API_KEY`, `EMAIL_FROM` | для email | Resend 🔒 |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | для Telegram | BotFather 🔒 |
| `SENTRY_DSN` | для ошибок | Sentry 🔒 |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | для аналитики | PostHog 🔒 |
| `ANTHROPIC_API_KEY` | для AI-помощника | Anthropic 🔒 |
| `PAYMENT_PROVIDER`, `PAYMENT_API_URL`, `PAYMENT_PUBLIC_ID`, `PAYMENT_SECRET` | для оплаты | эквайер 🔒 |

**Легенда:** 🔒 — требует ваших действий (аккаунт/договор/пароль/юр. решение);
всё остальное уже реализовано в коде.

# Полный гайд: как получить всё, что требуется

Пошагово, по каждому ключу: **где взять → что скопировать → куда вставить**.
Все переменные добавляются в Vercel одинаково — см. раздел 0. После добавления
переменных **обязателен передеплой** (Vercel → Deployments → ⋯ → Redeploy, или
`vercel --prod`), иначе новые значения не подхватятся.

Порядок — по приоритету. Разделы 1–3 обязательны для боевого запуска; 4+ включают
конкретные фичи и все до этого работают в mock-режиме.

---

## 0. Как добавить переменную в Vercel (нужно уметь для всех разделов)

**Через сайт (проще):**
1. https://vercel.com → проект **extracurriculars-kz** → **Settings** → **Environment Variables**.
2. **Key** = имя (например `RESEND_API_KEY`), **Value** = значение.
3. Environment: отметьте **Production** (и Preview, если нужно). **Save**.
4. Повторите для всех ключей раздела, затем **Deployments → Redeploy**.

**Через терминал (если удобнее):**
```bash
cd extracurriculars-kz
vercel env add RESEND_API_KEY production   # вставите значение по запросу
vercel --prod                              # передеплой
```

`NEXT_PUBLIC_*` переменные попадают в браузер — это нормально, они не секретные.
Остальные — серверные, храните их только в Vercel, не коммитьте.

---

## 1. Базовое (обязательно для боевого запуска)

### 1.1. AUTH_SECRET (новый, для прода)
- **Где взять:** сгенерировать в терминале:
  ```bash
  openssl rand -hex 32
  ```
- **Куда вставить:** Vercel → `AUTH_SECRET` = полученная строка.
- Зачем: подпись сессий. Демо-значение менять обязательно.

### 1.2. Свой домен (по желанию, но для боевого — да)
- **Где взять:** купить домен (например `extracurriculars.kz`) у любого регистратора.
- **Что сделать:** Vercel → проект → **Settings → Domains → Add** → ввести домен →
  Vercel покажет DNS-записи (A / CNAME) → добавить их у регистратора.
- **Куда вставить:** после привязки обновить `NEXT_PUBLIC_APP_URL` = `https://ваш-домен`.

### 1.3. Юридические документы 🔒 (без кода)
- Дать юристу переписать `Privacy Policy` и `Terms` (сейчас — заглушки в
  `app/(marketing)/privacy` и `/terms`).
- Оформить обработку персональных данных несовершеннолетних по законодательству РК.

---

## 2. Хранилище документов (Supabase — рекомендую)

Чтобы школьники реально загружали сканы (сейчас без ключей — только карточки).

**Где взять:**
1. https://supabase.com → **New project** (бесплатный тариф).
2. **Project Settings → API**:
   - `Project URL` → это `SUPABASE_URL`.
   - `service_role` secret (раздел Project API keys) → это `SUPABASE_SERVICE_ROLE_KEY`.
     ⚠️ именно `service_role`, не `anon`. Он даёт полный доступ — только на сервере.
3. **Storage → Create bucket** → имя, например `documents`, **Private** (не public).

**Куда вставить (Vercel):**
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...   (длинный ключ)
STORAGE_BUCKET=documents
```
Файлы будут отдаваться только по подписанной ссылке с TTL 5 минут.

> Альтернатива — любой S3-совместимый бакет: `S3_ENDPOINT`, `S3_REGION`,
> `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `STORAGE_BUCKET`.

---

## 3. Наблюдаемость и лимиты (сильно желательно для прода)

### 3.1. Rate-limit (Upstash Redis)
- **Где взять:** https://upstash.com → **Create Database** (Redis, регион ближе к
  Европе/Азии) → на странице базы блок **REST API**:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
- **Куда вставить:** обе переменные в Vercel. Без них лимит работает только в
  памяти инстанса (на Vercel фактически не ограничивает).

### 3.2. Sentry (ошибки)
- **Где взять:** https://sentry.io → создать проект (платформа **Next.js**) →
  **Settings → Client Keys (DSN)** → скопировать **DSN**.
- **Куда вставить:** `SENTRY_DSN=https://...@....ingest.sentry.io/...`

### 3.3. PostHog (аналитика)
- **Где взять:** https://posthog.com → Project → **Settings** → **Project API Key**
  (начинается на `phc_`). Регион EU или US — запомнить хост.
- **Куда вставить:**
  ```
  NEXT_PUBLIC_POSTHOG_KEY=phc_xxxx
  NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com   (или us.i.posthog.com)
  ```

---

## 4. Уведомления

### 4.1. Email (Resend)
- **Где взять:** https://resend.com → **API Keys → Create** → скопировать ключ
  (`re_...`). Затем **Domains → Add Domain** → подтвердить домен-отправитель
  (добавить DNS-записи).
- **Куда вставить:**
  ```
  RESEND_API_KEY=re_xxxx
  EMAIL_FROM=Extravity <noreply@ваш-домен>
  ```

### 4.2. Telegram-бот (уведомления + приём пересланных постов)
1. **Где взять токен:** в Telegram написать [@BotFather](https://t.me/BotFather) →
   `/newbot` → задать имя и username → BotFather пришлёт **токен**
   (`123456:ABC...`). Username бота (без @) тоже понадобится.
2. **Придумать секрет вебхука:** `openssl rand -hex 16`.
3. **Куда вставить (Vercel):**
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC...
   TELEGRAM_BOT_USERNAME=имя_бота_без_@
   TELEGRAM_WEBHOOK_SECRET=<случайная строка из шага 2>
   ```
4. **Зарегистрировать вебхук** (один раз, после передеплоя):
   ```bash
   curl -F "url=https://ваш-домен/api/telegram/webhook" \
        -F "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
        https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
   ```
   Проверка: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo` — должно показать ваш URL.

### 4.3. Web Push (уведомления в браузер)
- **Где взять:** сгенерировать пару ключей в терминале:
  ```bash
  cd extracurriculars-kz
  npx web-push generate-vapid-keys
  ```
  Выведет `Public Key` и `Private Key`.
- **Куда вставить (Vercel):**
  ```
  VAPID_PUBLIC_KEY=<Public Key>
  VAPID_PRIVATE_KEY=<Private Key>
  NEXT_PUBLIC_VAPID_PUBLIC_KEY=<тот же Public Key>
  VAPID_SUBJECT=mailto:admin@ваш-домен
  ```
  После передеплоя в «Настройки → Уведомления» появится кнопка «Включить push».

---

## 5. AI-помощник (Anthropic)

Включает генерацию черновиков, **обратную связь по эссе**, подготовку к интервью,
и умный слой разбора постов в парсере.

- **Где взять:** https://console.anthropic.com → **API Keys → Create Key** →
  скопировать (`sk-ant-...`). Пополнить баланс (Billing).
- **Куда вставить:** `ANTHROPIC_API_KEY=sk-ant-...`
- **Плюс включить флаг:** после входа админом → `/admin/flags` → включить
  `ai_application_assistant`.

---

## 6. Сбор возможностей из соцсетей

### 6.1. Telegram-каналы (MTProto/Telethon) — на хостинге парсера
- **Где взять:** https://my.telegram.org → войти по номеру → **API development
  tools** → создать приложение → получить **api_id** и **api_hash**.
- **Куда вставить:** в `apps/parser/.env` (на сервере парсера, не в Vercel):
  ```
  TG_API_ID=...
  TG_API_HASH=...
  ```
- Затем разово авторизовать аккаунт: `python run_telegram.py --login` (код придёт
  вам в Telegram). Список каналов — в `apps/parser/channels.yaml`.

### 6.2. Instagram (Graph API) — легальный путь
- **Что нужно:** аккаунт **Business/Creator**, приложение в
  [Meta for Developers](https://developers.facebook.com), пройти ревью с
  обоснованием сценария. Затем получить **long-lived access token** и **business id**.
- **Куда вставить:** в `apps/parser/.env`:
  ```
  IG_ACCESS_TOKEN=...
  IG_BUSINESS_ID=...
  IG_BUSINESS_USERNAME=...
  IG_APP_ID=...
  IG_APP_SECRET=...
  ```
- Хештеги/профили — в `apps/parser/hashtags.yaml` либо `IG_HASHTAGS` /
  `IG_PROFILES`. Перед расписанием запустить `python run_instagram.py --preflight`:
  он проверяет Meta app, обязательные permissions, Business/Creator identity,
  срок токена и доступность каждого allowlisted источника.

### 6.3. Хостинг парсера 🔒
- Парсер (`apps/parser`) — отдельный процесс, Vercel для него не подходит. Поднять
  на Railway / Render / Fly.io / VPS. На нём задать `APP_URL` (прод-URL сайта) и
  `PARSER_INGEST_SECRET` (тот же, что в Vercel — сгенерировать `openssl rand -hex 32`).

---

## 7. Платежи (эквайринг) 🔒

- **Что нужно:** договор с эквайером — **Halyk**, **Kaspi** или **CloudPayments**.
  Они выдадут API-URL, public id и secret.
- **Куда вставить (Vercel):**
  ```
  PAYMENT_PROVIDER=cloudpayments        (или halyk / kaspi)
  PAYMENT_API_URL=...
  PAYMENT_PUBLIC_ID=...
  PAYMENT_SECRET=...
  ```
- В личном кабинете эквайера указать вебхук: `https://ваш-домен/api/payments/webhook`.
- Без этих ключей активен mock-провайдер (подписка включается сразу, деньги не движутся).

---

## 8. Бэкапы БД

### 8.1. Neon PITR (основной, без кода)
- https://console.neon.tech → проект → **Settings → Storage → History retention**
  → выставить окно (Free ≈ 24 ч; платные — до 30 дней).

### 8.2. Ночной дамп через GitHub Actions
- **Где взять:** Neon → **Connection Details** → скопировать **прямую (unpooled)**
  строку подключения.
- **Куда вставить:** GitHub → репозиторий → **Settings → Secrets and variables →
  Actions → New repository secret** → имя `DATABASE_URL_UNPOOLED`, значение — строка.
- Workflow `.github/workflows/backup.yml` подхватит секрет и начнёт делать дампы.

---

## 9. Включение фич-флагов и демо-данных

- Флаги (`auto_publish_trusted`, `portfolio_public_links`, `ai_application_assistant`
  и др.) появляются в `/admin/flags` после запуска seed на нужной БД:
  ```bash
  DATABASE_URL="<neon-unpooled-url>" npm run db:seed
  ```
  На проде демо-аккаунты **не создаются** (guard `SEED_DEMO`), сидятся только
  категории, тарифы и флаги. Чтобы явно засеять демо: `SEED_DEMO=true npm run db:seed`.
- Дальше флаги переключаются кнопкой в админке — код деплоить не нужно.

---

## Чек-лист (что за чем)

1. `AUTH_SECRET` заново → домен → юр. документы.
2. Supabase (документы).
3. Upstash + Sentry + PostHog.
4. Resend + Telegram-бот + Web Push.
5. Anthropic (+ флаг).
6. Парсер: my.telegram.org / Meta + хостинг парсера.
7. Эквайринг (когда будет договор).
8. Neon PITR + GitHub-секрет для бэкапов.
9. `db:seed` для флагов → включить нужные в `/admin/flags`.

После каждого раздела: **Redeploy** в Vercel. Сводная таблица переменных —
в конце `SETUP-REQUIRED.md`, шаблон — в `.env.example`.

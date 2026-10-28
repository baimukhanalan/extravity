# Деплой

Продакшн: **Vercel** (приложение) + **Neon** (serverless PostgreSQL).

Живой инстанс: https://extracurriculars-kz.vercel.app

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | Строка подключения к Postgres. В проде — **пул** Neon с `?sslmode=require&pgbouncer=true` |
| `AUTH_SECRET` | Секрет для подписи JWT (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_APP_URL` | Публичный URL (метаданные, OG, sitemap) |
| `NEXT_PUBLIC_APP_NAME` | Название приложения |

Опционально: `RESEND_API_KEY`, `EMAIL_FROM`, `TELEGRAM_BOT_TOKEN`, `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`.
`RESEND_API_KEY` и `EMAIL_FROM` должны быть заданы в Vercel для системных писем.

## Neon: два типа URL

- **Пул (pooler)** — для рантайма приложения. Обязательно `pgbouncer=true` (Prisma отключает prepared statements).
- **Прямой (unpooled)** — для миграций и seed (`prisma migrate deploy`, `prisma db seed`).

## Порядок деплоя

```bash
# 1. Создать БД в Vercel → Storage → Create Database → Neon (Free), скопировать оба URL.

# 2. Задать переменные окружения проекта
vercel env add DATABASE_URL production        # пул-URL с pgbouncer=true
vercel env add AUTH_SECRET production
vercel env add NEXT_PUBLIC_APP_URL production
vercel env add NEXT_PUBLIC_APP_NAME production
# (повторить для preview/development при необходимости)

# 3. Демо-данные (разово, через ПРЯМОЙ url)
DATABASE_URL="<neon-unpooled-url>" npm run db:seed

# 4. Перед деплоем явно применить миграции в Neon
vercel env run -e production -- npm run db:deploy

# 5. Деплой
vercel --prod
```

## Замечания по сборке

- `npm run build` = `prisma generate && next build`. Миграции не запускаются
  автоматически: перед production deploy обязательно выполнить `npm run db:deploy`
  с production-окружением и проверить результат.
- `postinstall` тоже вызывает `prisma generate`, поэтому клиент Prisma генерируется
  под Linux-рантайм автоматически.
- Страницы, читающие сессию/БД, рендерятся динамически — обращений к БД во время сборки нет,
  кроме `sitemap.ts` (обёрнут в try/catch, при недоступности БД отдаёт статические URL).
- Turbopack используется по умолчанию (Next 16). Кастомный webpack-конфиг отсутствует.

## Проверка после деплоя

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/           # 200
curl -s https://<domain>/api/health                                  # {"status":"ok","db":"up"}
curl -s https://<domain>/catalog | grep -c "Astana Hub"              # > 0 (данные из БД)
```
Затем — вход демо-аккаунтом `student@demo.kz` / `password123` и переход в портал.

## Бэкапы и восстановление

Две линии защиты:

1. **Neon PITR (основная).** Neon непрерывно пишет WAL и умеет восстановление на
   точку во времени. Включается в консоли Neon: **Project → Settings → Storage →
   History retention** — выставить окно (Free ≈ 24 ч, платные тарифы — до 30 дней).
   Восстановление: **Branches → Restore**, выбрать момент времени; Neon создаёт
   ветку на нужный момент, после проверки её можно сделать основной. Это отдельная
   от кода настройка — её нужно включить один раз в дашборде.

2. **Логический pg_dump (запасная, портируемая).** `scripts/backup.sh` снимает
   сжатый дамп через прямой (unpooled) URL и хранит последние 14:

   ```bash
   DATABASE_URL="<neon-unpooled-url>" ./scripts/backup.sh backups
   ```

   Ночью то же делает GitHub Actions (`.github/workflows/backup.yml`, 02:00 UTC) —
   нужен секрет репозитория `DATABASE_URL_UNPOOLED`; без него job пропускается.
   Дамп кладётся в артефакты (retention 30 дней).

   Восстановление в любую базу:

   ```bash
   pg_restore --clean --if-exists --no-owner -d "<target-url>" backups/eckz-<stamp>.dump
   ```

> Проверять восстановление стоит регулярно: бэкап, который ни разу не
> восстанавливали, — это гипотеза, а не бэкап. Минимум — раз развернуть дамп в
> отдельную Neon-ветку и убедиться, что `prisma migrate status` чист и данные на месте.

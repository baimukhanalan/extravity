# Архитектура

## Обзор

Приложение — единый Next.js 16 (App Router). Серверная бизнес-логика реализована через
Server Actions и Route Handlers; данные — в PostgreSQL через Prisma. Отдельного backend-сервиса
для основного приложения нет (по ТЗ — предпочтительный вариант).

```
Браузер ──▶ Next.js (App Router)
              ├─ Server Components   → чтение из БД (Prisma)
              ├─ Server Actions      → мутации (login, save, apply, moderation…)
              ├─ Route Handlers      → /api/calendar (ICS)
              └─ Prisma Client ──▶ PostgreSQL (Neon в проде)
```

## Слои

| Слой | Где | Ответственность |
|---|---|---|
| Данные | `prisma/schema.prisma` | Схема, миграции, seed |
| Доступ к данным | `lib/prisma.ts`, `lib/queries.ts` | Singleton клиента, построение запросов каталога |
| Домен | `lib/eligibility.ts`, `lib/match.ts`, `lib/recommendations.ts` | Eligibility-фильтры, match/trust score, лента |
| Аутентификация | `lib/auth.ts` | Хеширование, JWT-сессии, `requireUser/requireRole` |
| Действия | `app/actions/*.ts` | Мутации с Zod-валидацией и audit log |
| UI | `components/*`, `app/**` | Server/Client-компоненты, страницы |

## Маршруты

- `app/(marketing)/` — публичный сайт (лендинг, каталог, карточка, инфо-страницы). Общий layout с хедером/футером.
- `app/(auth)/` — вход/регистрация. Авторизованных редиректит в `/app`.
- `app/app/` — портал школьника. Layout вызывает `requireUser()`; неавторизованных — на `/login`.
- `app/admin/` — админ-панель. Layout вызывает `requireAdmin()` (роли MODERATOR/ADMIN/SUPER_ADMIN).
- `app/api/` — Route Handlers (ICS-календарь).
- `app/sitemap.ts`, `app/robots.ts` — SEO.

## Ключевые решения

- **Авторизация — на сервере, в layout'ах**, а не в middleware. В Next 16 `middleware` переименован в `proxy`;
  проверка в серверных компонентах надёжнее (ближе к данным, невозможно обойти скрытием кнопок).
- **Динамический рендер** страниц, читающих сессию/БД (cookie делает поддерево динамическим) — актуальные данные без stale-кэша.
- **UI отделён от бизнес-логики**: score/eligibility — чистые функции в `lib/`, тестируемые изолированно.
- **Все мутации** проходят через Server Actions с проверкой прав и записью в `audit_logs`.

## Расширение (следующие фазы)

Схема БД и структура допускают добавление без переписывания ядра:
`apps/parser-api` и `apps/worker` (Python-парсер, Celery/Redis), Telegram-бот,
реальные платежные провайдеры (интерфейс уже абстрактный — mock provider),
порталы организатора и counsellor (модели `organizer_*`, `school_*` заложены).

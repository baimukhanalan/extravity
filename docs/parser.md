# Парсер (сервис сбора данных)

Реальный сервис в `apps/parser` (Python 3.9+, FastAPI). Собирает возможности из
разрешённых источников и кладёт их в очередь модерации приложения. Полное руководство
по запуску — [`apps/parser/README.md`](../apps/parser/README.md).

## Пайплайн

```
sources.yaml (html | rss | sitemap)
  → fetch          httpx; robots.txt (urllib.robotparser); rate limit по хосту
  → extract        schema.org JSON-LD Event, OpenGraph, regex (даты/возраст/класс/цена)
  → normalize      категория по ключевым словам, формат, content hash, confidence
  → ingest         POST /api/parser/ingest (Bearer PARSER_INGEST_SECRET)
```

## Интеграция с приложением

Парсер **не пишет в БД напрямую** — он отправляет кандидатов в защищённый эндпоинт
[`app/api/parser/ingest/route.ts`](../app/api/parser/ingest/route.ts). Эндпоинт:

1. Проверяет `Authorization: Bearer <PARSER_INGEST_SECRET>`.
2. Валидирует каждый элемент (Zod).
3. Дедуплицирует по `sourceUrl` и по `title + organizer`.
4. Считает `trustScore` по типу источника и сигналам (гарантии поступления → штраф).
5. Создаёт `Opportunity` со статусом **PENDING_REVIEW** (или **SUSPICIOUS** при низком trust)
   и `moderationStatus = PENDING` — **ничего не публикуется автоматически**.
6. Пишет `RawSourceItem`, обновляет `SourceConnector`, создаёт `ParserJob` со счётчиками.

Результат виден в админке: `/admin/moderation` (одобрить), `/admin/parser` (задачи),
`/admin/sources` (коннекторы).

## Данные

Таблицы (Prisma): `SourceConnector`, `ParserJob`, `RawSourceItem`. Сырой элемент хранит
источник, URL, hash содержимого, извлечённый JSON, состояние обработки и ссылку на
созданную возможность.

## Политика

Соблюдаются `robots.txt`, rate limits и правила доступа источников;
**нет** массового серого скрейпинга закрытых платформ (Instagram/Telegram) — только
официальные сайты, RSS, sitemap, партнёрские и пользовательские ссылки.

## Проверено end-to-end

Демо-источник (`apps/parser/fixtures/sample-opportunities.html`, реальные schema.org Event)
прогнан против прод-приложения: `created=3`, повторный прогон `duplicate=3` (идемпотентность),
элементы появились в очереди модерации. См. `/admin/parser`.

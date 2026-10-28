# Extravity — production-ready execution plan

Дата фиксации: 23 октября 2026 года (Asia/Almaty). Обновлено 24 октября 2026 года.

Этот документ является исполнимым release-планом. Пункт считается закрытым только при наличии доказательства на соответствующем уровне: код/тесты, production runtime, production данные и реальный пользовательский сценарий проверяются отдельно.

## Текущее состояние

- Публичный адрес: `https://extravity.vercel.app`.
- Vercel health: HTTP 200, база данных доступна.
- Render parser health: HTTP 200; production deploy `f27b036`, hourly non-publishing canary и scheduled collector включены.
- Allowlist: 182 источника, 180 включены; 12 каналов за один запуск каждые 30 минут. SAT/IELTS-источники остаются `trusted: false`.
- Контролируемый publish-canary `myextrakz`: 8 кандидатов, 2 создано, 6 дублей, 0 failed, 0 quarantined, 0 blocked offsets.
- Публичный каталог: 3 карточки, прошедшие строгий Telegram media/provenance gate; все 3 исходных изображения отдаются HTTP 200.
- Последний web unit suite: 791/791; main parser: 592/592; Render mirror: 591/591 + 2 штатных skip.
- Последний полный Playwright E2E: 40/40; TypeScript, ESLint и production build зелёные.
- Категория `test-prep` (`SAT / IELTS`) создана в production и присутствует в каталожном фильтре.

## Gate 1 — зелёный релизный контур

### Метод

1. Исправить E2E fixtures так, чтобы они соответствовали production Telegram source/media/provenance gate; production gate не ослаблять.
2. Запустить TypeScript, ESLint, unit, parser, полный Playwright E2E и production build на одном неизменном snapshot.
3. Зафиксировать точные counts и exit codes.
4. Поместить основное приложение в отдельный Git-репозиторий Extravity, подключить CI и Vercel deployment provenance. JOBFINDER не трогать.

### Критерий готовности

- Все проверки зелёные на одном commit SHA.
- `/api/health` показывает этот SHA после production deploy.
- Красный CI не может попасть в production.

### Статус 24 октября

- Локальный release snapshot зелёный, Vercel deployment `dpl_iMtx3GhgP3U88Zv8M88yWdKQUbAz` READY.
- Gate остаётся открытым: основное приложение ещё не имеет отдельного Git provenance, а `/api/health` не показывает commit SHA.

## Gate 2 — Telegram ingestion и publication pipeline

### Метод

1. Сохранить одну Telegram-сессию и один collector process.
2. Добавить bounded retry, quarantine и `partial_failure`; один ядовитый пост не создаёт бесконечные failed-строки и не блокирует канал.
3. Для каждого scheduled shard фиксировать: posts, candidates, created, duplicate, expired, quarantined, failed, media-ready, pending и published.
4. Провести 24-часовой canary с минимум одним restart Render и восстановлением cursor/state.
5. Новые `PENDING` автоматически проверять по дедлайну, форме, аудитории, организатору и собственному исходному медиа. Не подставлять сгенерированные или чужие изображения.
6. Публиковать небольшими партиями и после каждой проверять карточку, галерею, дедлайн, мобильный вид и запрет подачи после закрытия.

### Критерий готовности

- 24 часа без необъяснённой остановки и без новых бесконечных повторов.
- Каждый источник имеет текущий статус и cursor.
- `candidate -> media archive -> DB -> public card` доказан новыми canary-карточками.
- Старые 10 643 failed изолированы как legacy incident; новые ошибки не размножаются.

### Статус 24 октября

- Bounded retry, stable quarantine и `partial_failure` выпущены; миграция production применена.
- Dry-run canary: 8 кандидатов, 0 blocked offsets. Publish-canary: 2 created, 6 duplicate, 0 failed/quarantined.
- Обе новые записи получили собственные Telegram media (`READY + SOURCE_POST`) и остались в `PENDING`, потому что не подтверждены дедлайн/форма; публичный каталог не загрязнён.
- Gate остаётся открытым до 24-часового наблюдения, restart/cursor recovery и первой новой карточки, прошедшей полный public gate.

## Gate 3 — наблюдаемость, rate limits и восстановление

### Метод

1. Подключить Sentry для web/parser/worker.
2. Подключить Upstash Redis для распределённого rate limit.
3. Добавить operational metrics: возраст последнего сообщения, задержка публикации, queue depth, quarantine, media failures, worker heartbeat.
4. Настроить алерты на health != 200, остановку collector, рост failed, недоступное медиа и отсутствие scheduled run.
5. Подтвердить Neon PITR и добавить nightly `pg_dump` через `DATABASE_URL_UNPOOLED`.
6. Провести restore drill на отдельной базе.

### Критерий готовности

- Тестовый сбой создаёт алерт без секретов.
- Backup создаётся по расписанию и реально восстанавливается.
- Rate limit работает между разными serverless instances.

## Gate 4 — пользовательский и юридический запуск бесплатного каталога

### Метод

1. Проверить на production и реальном телефоне: регистрация, onboarding, каталог, фильтры, карточка/галерея, ручная подача, кабинет, история истёкших заявок и удаление аккаунта.
2. Юрист РК утверждает Privacy, Terms, parental consent и обработку данных несовершеннолетних.
3. Удалить/заблокировать demo accounts, подтвердить реального ADMIN.
4. Ротировать `AUTH_SECRET`, Telegram session/API hash и ранее переданные ключи.
5. Подключить Resend и проверить доставку системного письма; Telegram bot остаётся дополнительным каналом, не заменяет email.

### Критерий готовности

- Нет черновых юридических предупреждений.
- Нет известных production demo credentials.
- Реальный пользователь проходит основной путь на мобильном устройстве.

## Gate 5 — дополнительные источники

- Instagram и WhatsApp включаются только после отдельного linked-session/official API canary, allowlist и проверки прав на медиа.
- Их отсутствие не блокирует Telegram-first запуск бесплатного каталога.
- Они не включаются в production автоматически только по наличию кода.

## Порядок выпуска

1. Gate 1: зелёный E2E и воспроизводимый commit.
2. Gate 2: 24-часовой Telegram canary и контролируемая публикация.
3. Gate 3: мониторинг, rate limit и backup restore.
4. Gate 4: legal + mobile user flow -> бесплатный public launch.
5. Gate 5: расширение Instagram/WhatsApp после отдельных canary.

Ни один пункт не закрывается словами «код готов»: требуется указанное production evidence.

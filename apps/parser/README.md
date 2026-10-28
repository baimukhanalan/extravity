# Extravity — Parser Service

Реальный сервис сбора данных. Пайплайн:

```
source (html/rss/sitemap)
  → fetch (httpx, robots.txt, rate limit)
  → extract (schema.org JSON-LD Event, OpenGraph, regex дат/возраста/класса/цены)
  → normalize (категория по ключевым словам, формат, content hash, confidence)
  → ingest (POST /api/parser/ingest в приложение)
  → очередь модерации в админке (PENDING_REVIEW, ничего не публикуется автоматически)
```

Сервис соблюдает `robots.txt`, rate limits и правила доступа источников. Добавляйте только те источники, которые разрешено читать
(официальные сайты, RSS, sitemap, партнёры).

Telegram, Instagram и WhatsApp используют тот же ingest-контракт и ту же
очередь модерации. Социальные источники никогда не публикуются автоматически.

`GET /health` — liveness процесса и безопасная сводка последних фоновых
прогонов. `GET /ready` — readiness автоматизации: возвращает HTTP 503, если
запрошенная задача не зарегистрирована, её последний прогон завершился ошибкой
или Telegram live не дошёл до `catching_up`/`connected`. Для внешнего аптайм-
монитора проверяйте оба адреса: `/health` не должен перезапускать процесс только
из-за временной недоступности внешнего источника, а `/ready` должен поднять алерт.

Новости собираются отдельно от каталога активностей: `news-sources.yaml` содержит
проверенные RSS-ленты, список допустимых доменов статей и тематические слова
для первичного отбора. Парсер сохраняет заголовок, ссылку на первоисточник,
дату и короткую выдержку из RSS-анонса с явным указанием источника либо
нейтральное описание по проверенным тематическим признакам, но не
копирует полный текст статьи или её изображение. Это предпросмотр источника,
а не авторский пересказ или подтверждение фактов. Отбираются записи не старше
30 дней; дубль определяется по нормализованной ссылке на статью. Новость
поступает в отдельную очередь модерации, а не публикуется напрямую.

Для веб-страниц парсер извлекает до 10 изображений или небольших MP4 из
`Event.image`, `Event.video`, метаданных или основного `<article>`.
Ссылки на медиа видны в dry-run,
но загрузка в хранилище выключена, пока для конкретного источника в
`sources.yaml` не указаны `media_rights_basis` (`ORGANIZER_OWNED`,
`EXPLICIT_LICENSE` или `OPEN_LICENSE`) и HTTPS-ссылка
`media_rights_evidence_url`. По умолчанию разрешён только хост самой страницы;
для отдельного CDN добавьте точное имя хоста в `media_hosts`. Загрузка
соблюдает robots.txt, ограничена 4 МБ на файл и не следует редиректам на
другой хост. Без подтверждённых прав фото не копируется и карточка не
публикуется автоматически.

## Установка

```bash
cd apps/parser
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
(cd whatsapp-bridge && npm ci --ignore-scripts)
cp .env.example .env
# укажите APP_URL и PARSER_INGEST_SECRET (тот же, что в проекте Vercel)
```

## Запуск

### CLI (разовый прогон)

```bash
# извлечь и показать кандидатов, без записи
python run.py --dry-run

# полный прогон всех включённых источников с ingest в приложение
python run.py

# только один источник
python run.py --source "Astana Hub — events"

# новости: только предпросмотр, ничего не сохраняет
python run_news.py --dry-run

# новости: отправка в отдельную очередь модерации
python run_news.py
```

### Сервер (непрерывный Telegram + расписание других источников)

```bash
uvicorn server:app --reload --port 8000
# GET  /health
# POST /run             — сайты/RSS
# POST /run/telegram    — Telegram, по умолчанию dry-run
# POST /run/instagram   — Instagram, по умолчанию dry-run без LLM
# POST /run/whatsapp    — linked-device allowlist, по умолчанию dry-run
# POST /run/news        — RSS-новости, по умолчанию dry-run
# GET  /preflight/ingest — проверка приёма и медиа без записи данных
# GET/POST /webhooks/whatsapp — официальный WhatsApp Cloud API webhook
# Для всех POST обязателен X-Admin-Token: <PARSER_ADMIN_TOKEN>
# GET  /fixtures/sample-opportunities.html   (демо-источник)
```

Веб-сбор запускается каждые 6 часов. Telegram и Instagram безопасно выключены
по умолчанию и включаются независимо:

```dotenv
WEB_SCHEDULE_ENABLED=true
WEB_SCHEDULE_INTERVAL_MINUTES=360

# Включать отдельно, только после проверки POST /api/parser/news на сайте:
NEWS_SCHEDULE_ENABLED=false
NEWS_SCHEDULE_INTERVAL_MINUTES=60

# Только после авторизации аккаунта и подключения persistent volume:
TELEGRAM_LIVE_ENABLED=true
TG_SESSION_PATH=/data/telegram/eckz
TG_STATE_PATH=/data/telegram/state.json
TG_LOCK_PATH=/data/telegram/run.lock
TG_MEDIA_SPOOL_PATH=/data/telegram/media-spool

# Только после Meta app review и настройки разрешённых хештегов:
INSTAGRAM_SCHEDULE_ENABLED=true
INSTAGRAM_SCHEDULE_INTERVAL_MINUTES=180
INSTAGRAM_USE_LLM=false

# После локальной привязки номера, allowlist и persistent volume:
WHATSAPP_SCHEDULE_ENABLED=true
WHATSAPP_SCHEDULE_INTERVAL_MINUTES=60
WA_SESSION_PATH=/data/whatsapp/session
WA_STATE_PATH=/data/whatsapp/state.json
WA_LOCK_PATH=/data/whatsapp/run.lock
WA_BRIDGE_LOCK_PATH=/data/whatsapp/bridge.lock
```

Каждый job имеет `max_instances=1` и coalescing. Telegram дополнительно берёт
межпроцессный lock, поэтому одна сессия не используется двумя worker'ами.

### Docker

```bash
docker build -t eckz-parser .
docker run --env-file .env -p 8000:8000 eckz-parser
```

Для получения новых Telegram-постов без минутного ожидания можно включить
`TELEGRAM_LIVE_ENABLED=true`. Этот режим держит одно подключение Telethon,
обрабатывает события из подписанных публичных и закрытых каналов и каждые 10 минут
сверяет пропущенные записи. Telegram job по расписанию больше нет; режим использует
те же постоянные пути сессии, состояния и блокировки. Пока он активен,
ручной `/run/telegram` возвращает 409, чтобы не открыть ту же сессию второй раз.
После каждого прохода live-сборщик также берёт до восьми старых ожидающих
публичных публикаций без срока из защищённой очереди сайта, перечитывает
оригинальный пост той же сессией и добавляет только подтверждённый будущий
дедлайн. Проверенные без срока записи отодвигаются в очереди; опубликованные,
удалённые и непубличные карточки не изменяются. Это ограниченный повторный
проход, а не обещание мгновенно разобрать всю историческую очередь.
Авторизация аккаунта также берёт эту блокировку. Если Telegram отзывает сессию,
сервис показывает `auth_required` и ждёт изменения файла сессии, не повторяя
неудачный вход в цикле. После успешного повторного входа сбор возобновляется без
отдельного scheduled task. Не копируйте один файл `.session` между локальным
компьютером и Railway: для разных устройств нужны независимые авторизации.
`--login-qr` создаёт новый ключ сессии на том сервере, где запущена команда,
показывает QR в интерактивном терминале и сохраняет обновляемое приватное изображение
в `.state/telegram-pairing-qr.png` (или в `TG_QR_PATH`). После успешного входа
изображение удаляется, а новая сессия заменяет старую с закрытой резервной копией. Сканировать нужно в Telegram
на телефоне через Settings → Devices → Link Desktop Device; пароль двухэтапной
проверки вводится только в терминале. Не запускайте старый `--login` и
`--login-qr` одновременно для одного пути сессии.

## Telegram (MTProto / Telethon)

Отдельный сборщик читает публичные Telegram-каналы своим аккаунтом и разбирает
свободный текст постов в те же кандидаты, что и HTML/RSS-парсер.

```bash
python run_telegram.py --demo            # шесть встроенных постов, без сети и ключей
python run_telegram.py --login           # разовая авторизация аккаунта (запускаете вы)
python run_telegram.py --login-qr        # альтернативный вход по QR в вашем терминале
python run_telegram.py --dry-run         # разбор реальных каналов без отправки
python run_telegram.py --subscribed --dry-run  # все подписанные публичные каналы, без отправки
python run_telegram.py --subscribed       # все подписанные публичные каналы в очередь модерации
python run_telegram.py                   # в очередь модерации
python run_telegram_join.py              # офлайн-план публичных каналов из реестра, без входа в аккаунт
python -m pytest tests -q                # 66 тестов разбора, transport и коллекторов
```

Команда использует упакованный `telegram-registry-public.yaml` (109 кандидатов,
сверяется тестом с `docs/SOURCE-REGISTRY-2026-09-27.md`); бот- и групповые
ссылки окончательно классифицируются при проверке Telegram.
Для вступления в дополнительные каналы сначала остановите live-сбор на Railway
и дождитесь освобождения единственной Telegram-сессии. Затем на том же Railway
сервисе выполните `python run_telegram_join.py --join --max-joins 5`.
Команда вступает последовательно не более чем в пять новых публичных
broadcast-каналов за запуск; группы, боты и закрытые приглашения она пропускает.
При FloodWait останавливается и сообщает время ожидания, не обходит лимит.
Пока не добавлен отдельный allowlist в `channels.yaml` и не перезапущен
live-сбор, новые подписки не участвуют в импорте.

Первый запуск Telegram берёт **новейший** ограниченный batch. Непрерывный сборщик
затем отдельным курсором дочитывает более старые посты в пределах
`TG_MAX_POST_AGE_DAYS`, не задерживая приём новых сообщений. Он сохраняет обе
позиции после каждой успешной пачки и возвращается к каналу, если за один проход
накопилось больше постов.
Разовый запуск `--subscribed` также догоняет историю пачками: по умолчанию до 30
пачек на канал за один запуск (`--max-batches` задаёт лимит от 1 до 100).
Если лимит достигнут, следующий запуск продолжит с сохранённого курсора.
Старые и пустые сообщения не становятся карточками, но их номера учитываются,
чтобы после долгого простоя сбор не застревал перед свежими публикациями.
Короткие MP4 до лимита загрузки сохраняются как видео; для крупных роликов
используется доступная обложка. При частичной ошибке ingest offset не двигается;
безопасный повтор создаст дубликаты, которые отсеет приложение, но не потеряет
кандидата. Короткий FloodWait сборщик соблюдает внутри job, длинный откладывает
до следующего запуска.

Каналы задаются в `channels.yaml`, ключи приложения — `TG_API_ID` / `TG_API_HASH`
с my.telegram.org. Архитектура, границы (только публичные каналы, обработка
FloodWait, минимум хранимых данных) и роль ИИ — в
[docs/telegram-ingestion.md](../../docs/telegram-ingestion.md).

Telegram-контент разбирается только локальными правилами и не отправляется в
LLM: это ограничение закреплено в коде в соответствии с условиями Telegram API.

### Восстановление медиа уже созданных Telegram-кандидатов

После подключения нового тома Railway экспортируйте из БД только проверяемые
строки с исходной ссылкой, `position`, обязательной контрольной суммой
`checksum` из текущей строки БД и `platformMediaId` (если он есть):

```json
{"version":1,"jobs":[{"opportunityId":"<existing UUID>","sourceUrl":"https://t.me/example/42","media":[{"id":"<existing media UUID>","platformMediaId":"<original Telegram media ID>","position":0,"checksum":"<SHA-256 if known>"}]}]}
```

Экспорт и отчёт храните приватно. Не подставляйте похожее фото из другого поста:
если отсутствует контрольная сумма, изменился состав альбома или не совпала
контрольная сумма, запись получает причину отказа.
Сначала остановите live-сбор,
чтобы освободить Telegram-сессию, затем на том же Railway-сервисе выполните:

```bash
python run_telegram_media_repair.py --input /data/telegram/repair-input.json --output /data/telegram/repair-preview.json
python run_telegram_media_repair.py --input /data/telegram/repair-input.json --output /data/telegram/repair-upload.json --upload
```

Для второго запуска обязательны `MEDIA_STORAGE_BACKEND=railway_volume`,
`SOURCE_MEDIA_ROOT` на постоянном томе и исправная авторизованная Telegram-сессия.
Первый запуск только сверяет исходники; второй сохраняет файлы по SHA-256 и
формирует подписанный HMAC-SHA256 отчёт с адресами, контрольными суммами и ID
существующих строк. Полный Telegram spool читается первым и не удаляется.
Команда не обновляет БД: отдельное адресное согласование должно сверить этот
отчёт с текущими строками и оставить все права/статусы модерации без изменений.
Статусы `unavailable` и `failed` требуют ручной проверки, а повторный запуск
безопасен благодаря неизменяемым ID файлов.

Для восстановления без остановки live-сборщика предусмотрена отдельная
опциональная очередь внутри того же процесса и той же заблокированной
Telegram-сессии. Она выключена по умолчанию. Сформируйте приватный JSON
`{version:1, mode:"verify", jobs:[...]}` по схеме выше, подпишите весь объект
через `tgcollect.media_repair.sign_manifest(payload, PARSER_INGEST_SECRET)` и
атомарно положите его в `TG_MEDIA_REPAIR_REQUEST_PATH`. Установите также
`TG_MEDIA_REPAIR_RESULT_PATH` в другой файл приватного каталога (0700). Сам
запрос должен иметь права 0600; обе переменные — абсолютные пути на постоянном
томе. Live-сборщик сверяет подпись, текущую подписку на канал и исходные ID и
SHA-256, после чего обрабатывает максимум одну задачу в 60 секунд между
пакетами сбора, даже при непрерывном историческом catch-up, без второго
Telethon-клиента. При Telegram FloodWait общий сбор уважает указанную
платформой паузу. Прогресс записывается в подписанный приватный отчёт; повторный
проход уже завершённые задачи не запускает. Для `mode:"upload"` дополнительно
нужны `TG_MEDIA_REPAIR_UPLOAD_ENABLED=true` и готовый Railway media volume.
Это сохраняет только проверенные оригинальные байты; БД и статусы публикации
очередь не изменяет. Для нового пакета используйте новый файл результата.
Приватное задание можно установить из уже проверенного JSON без вывода секрета:

```bash
python run_telegram_media_repair_queue.py --output /data/telegram/repair-request.json < reviewed-repair-input.json
```

Команда берёт `PARSER_INGEST_SECRET` только из окружения, требует каталог
`/data/telegram` с правами 0700, атомарно создаёт файл 0600 и отказывает в
перезаписи существующего задания. Путь `--output` должен совпадать с
`TG_MEDIA_REPAIR_REQUEST_PATH`; ввод и отчёт не публикуйте.

## WhatsApp (связанное устройство по номеру)

Bridge подключает аккаунт как связанное устройство через код по номеру
телефона. Это неофициальная автоматизация WhatsApp Web: она может перестать
работать после обновления WhatsApp и несёт риск ограничения номера. Используйте
отдельный номер, только разрешённые чаты и не включайте отправку сообщений.

```bash
python run_whatsapp.py --pair             # номер вводится локально, затем код на телефоне
python run_whatsapp.py --probe            # проверить существующую сессию без QR и списка чатов
python run_whatsapp.py --list-chats       # получить точные chat_id
python run_whatsapp.py --dry-run          # синхронизировать и показать preview
python run_whatsapp.py --chat school_club # один источник из allowlist
python run_whatsapp.py                    # в очередь модерации
```

1. Запустите `--pair`, введите номер в международном формате без `+`.
2. На телефоне: **WhatsApp → Связанные устройства → Привязка по номеру**.
3. Введите показанный восьмизначный код.
4. Запустите `--list-chats` и скопируйте нужный `chat_id` в allowlist.
5. Включите только согласованные чаты. `source_url` должен вести на публичную
   страницу организатора, не на приватный invite.
6. Выполните `--dry-run` и вручную проверьте preview.

При обычном сборе bridge только читает последние сообщения: он не отправляет сообщения и не ставит
реакции. Разрешённые изображения и MP4 до заданного лимита загружаются вместе с
карточкой; неподдерживаемые или слишком большие файлы не считаются успешно
обработанными и повторяются на следующем запуске. Для каждого чата хранится набор отпечатков уже
обработанных сообщений. При частичном сбое позиция не сдвигается. Текст
разбирается локально и не отправляется в LLM. Экспорт `.txt` сохранён как
резервный transport. Подробности — в
[docs/whatsapp-ingestion.md](../../docs/whatsapp-ingestion.md).

Отдельная команда для явно выбранного группового приглашения показывает только
название, размер и режим одобрения группы. В файле должна быть ровно одна ссылка
`https://chat.whatsapp.com/<код>` или один код. По умолчанию это только preview:

```bash
cd whatsapp-bridge
node bridge.mjs invite --file /absolute/path/to/invite.txt
node bridge.mjs invite --file /absolute/path/to/invite.txt --join --confirm-join
```

Вторая команда действительно вступает в группу, поэтому запускайте её отдельно
только после проверки preview. Она не читает сообщения и не добавляет группу в
allowlist автоматически. Если вступление не подтвердилось, проверьте WhatsApp
вручную до повторной попытки. Invite-код и идентификаторы группы не выводятся.

`--probe` — безопасная проверка уже существующего профиля: команда не показывает и
не сохраняет новый QR, не перечисляет названия чатов и не читает содержимое в вывод.
Scheduler считает linked-device готовым только после свежего успешного pairing/probe
(по умолчанию не старше 24 часов). Если конкретный allowlisted snapshot не обновился,
весь прогон завершается ошибкой и старый snapshot не отправляется повторно как свежий.

## Instagram (Graph API)

Сборщик читает публичные посты по хештегу через официальный Graph API (легальный
путь, не скрапинг) и разбирает caption тем же экстрактором, что и посты Telegram.

```bash
python run_instagram.py --demo           # встроенный пример ответа Graph API, без сети и токена
python run_instagram.py --demo --no-llm  # только регулярки
python run_instagram.py --preflight      # ключ, аккаунт и каждый источник; без ingest
python run_instagram.py --dry-run        # с токеном: запрос хештегов без отправки
python run_instagram.py --source account # один хештег или профиль
python run_instagram.py --source tagged  # публикации с тегом аккаунта Extravity
python run_instagram.py                  # в очередь модерации
```

Хештеги — в `hashtags.yaml`, ключи — `IG_ACCESS_TOKEN` / `IG_BUSINESS_ID` из
приложения Meta for Developers. Для production также обязательны
`IG_APP_ID` / `IG_APP_SECRET`: сервис проверяет токен через официальный
`/debug_token`, сверяет Meta app, scopes и срок действия, а к обычным Graph
запросам добавляет `appsecret_proof`. Токен и App Secret не возвращаются в
health/preflight. Профили партнёров в том же файле читаются через
официальный Business Discovery. `IG_INCLUDE_TAGGED_MEDIA=true` включает
официальный `/tags`-канал для публикаций, где профессиональный аккаунт Extravity
отмечен. Карусели сохраняются целиком (до десяти элементов), а временный сбой
медиа не сдвигает курсор: пост будет автоматически повторён. Graph pagination
догружает до `IG_MAX_MEDIA_PER_SOURCE` записей за запуск. Временные Graph errors
(включая Meta rate-limit codes, которые иногда приходят с HTTP 400) повторяются
с backoff; безопасные `retryable`, `retry_after_s` и Graph error code видны в
preflight без выдачи токена. Повреждённый state теперь останавливает сбор, а не
проигрывает заново уже обработанную историю.

Для Railway источники также можно задать без пересборки образа: `IG_HASHTAGS`
и `IG_PROFILES` принимают списки через запятую. Они объединяются с
`hashtags.yaml`, дубликаты удаляются. Публичный `/health` показывает только
количество источников, но не токен и не полный allowlist.

Для круглосуточного запуска задайте абсолютные `IG_STATE_PATH` и `IG_LOCK_PATH`
на постоянном Railway volume. `/health` показывает конфигурационную готовность,
число активных источников и результат последнего запуска. Scheduler не включится,
если нет токена или активного источника. Даже при заполненных переменных он
сначала принудительно проверяет принадлежность токена ожидаемому Meta app и
Business ID, Business/Creator identity, `instagram_basic` +
`pages_read_engagement`, запас срока действия и доступность каждого источника
через Graph API. Любая ошибка оставляет scheduler
выключенным; результат виден в `instagram_graph.last_run.preflight`.

Внешние условия: профессиональный Instagram-аккаунт, связанная Facebook Page,
Meta app в Live mode, Advanced Access после App Review для `instagram_basic` и
`pages_read_engagement`, одобренная feature `Instagram Public Content Access`
для hashtag search, выданные приложению разрешения чтения Instagram/Pages и
действующий долгоживущий токен. App Review и доступ к аккаунтам организаторов
делаются в Meta; код не может выдать эти разрешения сам. Caption-mentions, которые
не являются media tags, требуют отдельной одобренной webhook/mentions capability
Meta и поэтому не имитируются скрапингом. Если включён
`IG_INCLUDE_TAGGED_MEDIA=true`, preflight также требует
`instagram_manage_comments`, как требует официальный `/tags` edge.

Операторский порядок включения:

1. Заполнить `IG_ACCESS_TOKEN`, `IG_BUSINESS_ID`, `IG_BUSINESS_USERNAME`,
   `IG_APP_ID`, `IG_APP_SECRET` и абсолютные state/lock paths на persistent volume.
2. Включить несколько проверенных источников в `hashtags.yaml` или через
   `IG_HASHTAGS` / `IG_PROFILES`.
3. Выполнить `python run_instagram.py --preflight`; код выхода `0` означает, что
   токен относится к ожидаемому приложению и Business/Creator account, имеет
   необходимые permissions, не истекает в ближайшие 7 дней и каждый источник доступен.
   Health/preflight также показывают оставшийся срок токена и data access в днях;
   обновление/перевыдача токена остаётся действием владельца в Meta, код не пытается
   продлевать его неофициально или хранить дополнительные refresh credentials.
4. Выполнить `/run/instagram?dry_run=true` и проверить кандидатов.
5. Только после этого включить `INSTAGRAM_SCHEDULE_ENABLED=true`. Health должен
   показывать `credentials.status=valid`, `preflight.status=valid`, активный
   `collect-instagram` и `automation.ready=true`.
   Hashtag API даёт ограниченное окно recent media, поэтому догрузка
   надёжно покрывает пропуски внутри доступного Meta окна, но не обещает полный
   исторический архив аккаунта.

Почему Graph API, а не скрапинг, и как устроено детектирование ботов — в
[docs/instagram-and-scraping.md](../../docs/instagram-and-scraping.md).

## Демо end-to-end (offline-safe)

`sources.yaml` содержит демо-источник, указывающий на встроенную фикстуру
(`/fixtures/sample-opportunities.html`) с реальными schema.org Event. Так пайплайн
парсинга проверяется целиком без внешних сайтов:

```bash
# 1) поднять приложение (в корне репозитория): npm run dev   → http://localhost:3000
# 2) поднять парсер:  uvicorn server:app --port 8000
# 3) прогнать:        python run.py
# 4) открыть /admin/moderation — найденные возможности ждут одобрения
```

## Добавление реальных источников

Отредактируйте `sources.yaml`:

```yaml
sources:
  - name: "Astana Hub — events"
    type: html            # html | rss | sitemap
    url: "https://astanahub.com/en/event/"
    organizer: "Astana Hub"
    category: "startup"   # дефолт, если не удалось определить по тексту
    enabled: true
```

Лучше всего работают страницы с разметкой schema.org `Event` (JSON-LD) и RSS-ленты.

## Деплой

Отдельный процесс (не на Vercel — там нет долгоживущих воркеров): Railway / Render /
Fly.io / VPS. Задайте `APP_URL` (прод-URL приложения) и `PARSER_INGEST_SECRET`
(тот же, что в переменных окружения проекта Vercel).

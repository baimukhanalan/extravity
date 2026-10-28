# WhatsApp ingestion

## Режим связанного устройства

Extravity может подключить принадлежащий владельцу аккаунт WhatsApp как
связанное устройство по восьмизначному коду. Bridge работает read-only: получает
последние сообщения только из точного allowlist, не отправляет сообщения, не
ставит реакции и не удаляет сообщения. Из allowlisted-чатов он скачивает только
поддерживаемые изображения и MP4 в пределах заданного лимита; медиа затем
загружается в закрытый ingest вместе с кандидатом. Кандидаты проходят
тот же локальный экстрактор, дедупликацию и ручную модерацию, что Telegram.

Это не официальный WhatsApp Business API. `whatsapp-web.js` автоматизирует
WhatsApp Web, поэтому совместимость может нарушиться после обновления сервиса,
а номер может получить ограничение. Для пилота используйте отдельный номер и
только чаты, которыми вы управляете или на обработку которых получили согласие.

## Первичная привязка

```bash
cd apps/parser
(cd whatsapp-bridge && npm ci --ignore-scripts)
.venv/bin/python run_whatsapp.py --pair
```

Номер вводится только в локальном терминале: международный формат без `+`,
пробелов и скобок. Затем на телефоне откройте **WhatsApp → Связанные устройства →
Привязка по номеру телефона** и введите показанный код. Сессия сохраняется в
`WA_SESSION_PATH`; её файлы эквивалентны полномочному ключу аккаунта.

После привязки получите идентификаторы:

```bash
.venv/bin/python run_whatsapp.py --list-chats
```

Команда показывает только ID, название и тип чата. Содержимое сообщений не
печатается. До вывода списка можно проверить уже существующий профиль без QR,
названий чатов и содержимого сообщений:

```bash
.venv/bin/python run_whatsapp.py --probe
```

Успешный probe обновляет приватный marker готовности. Если профиль отвязан,
команда завершится ошибкой и не создаст QR; pairing запускается только отдельной
явной командой `--pair` или `--pair-qr`.

Скопируйте точный ID согласованной группы или канала в `whatsapp-chats.yaml`:

```yaml
chats:
  - key: "school_club"
    title: "School Club Opportunities"
    transport: "linked_device"
    chat_id: "120000000000000000@g.us"
    path: "/data/whatsapp/school-club.jsonl"
    source_url: "https://school.example/opportunities"
    category: "olympiad"
    enabled: true
    trusted: false
    max_messages: 200
```

`source_url` должен быть публичной страницей источника и не должен раскрывать
приватную ссылку-приглашение. Личные `@c.us` диалоги отклоняются: linked-device
transport принимает только точечно разрешённые группы (`@g.us`) и каналы
(`@newsletter`).

## Проверка и запуск

```bash
.venv/bin/python run_whatsapp.py --dry-run
.venv/bin/python run_whatsapp.py
```

Первый запуск берёт ограниченный новый batch, последующие используют устойчивые
message ID и локальный набор обработанных отпечатков. Частично не принятый batch
не отмечается обработанным. Новые возможности всегда попадают в
`/admin/moderation`; автопубликации нет.

Snapshot каждого allowlisted-чата заменяется атомарно. Если хотя бы один
разрешённый чат недоступен или не обновился, bridge возвращает ошибку, а Python
пайплайн не использует старый snapshot как будто он свежий.

## Расписание и хранение

```dotenv
WHATSAPP_SCHEDULE_ENABLED=true
WHATSAPP_SCHEDULE_INTERVAL_MINUTES=60
WA_SESSION_PATH=/data/whatsapp/session
WA_STATE_PATH=/data/whatsapp/state.json
WA_LOCK_PATH=/data/whatsapp/run.lock
WA_BRIDGE_LOCK_PATH=/data/whatsapp/bridge.lock
WA_BRIDGE_TIMEOUT_S=420
WA_RECONNECT_TIMEOUT_S=300
WA_PAIR_TIMEOUT_S=600
WA_CLEANUP_TIMEOUT_S=30
WA_PERSIST_SETTLE_MS=5000
WA_SESSION_MAX_VERIFICATION_AGE_HOURS=24
WA_CHROME_PATH=/usr/bin/chromium
```

Все пути должны находиться на зашифрованном persistent volume с доступом только
worker-процесса. Никогда не коммитьте session, snapshot или state. При отвязке
устройства на телефоне сессия перестанет работать и потребуется новая привязка.
Scheduler запускается только при свежем успешном pairing/probe и при наличии
явного allowlist; просроченная или ошибочная проверка fail-closed отключает job.

## Альтернативы

- `transport: "export"` читает штатный `.txt`-экспорт без постоянной сессии.
- Cloud API webhook принимает сообщения, которые пользователи добровольно
  отправляют на бизнес-номер Extravity.

Официальный Cloud API не заменяет linked-device режим для чтения истории
произвольных групп.

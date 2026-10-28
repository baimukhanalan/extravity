# Аудит безопасности

Дата: 2026-08-08. Область: всё приложение (Next.js + Prisma/Neon) и парсер.
Метод: ручной обход по классам уязвимостей + автотесты + проверка кода.

## Сводка

| Класс | Статус | Комментарий |
|---|:-:|---|
| Аутентификация | ✅ | bcrypt(10), JWT HS256 c TTL, httpOnly+secure+sameSite cookie |
| Авторизация (RBAC) | ✅ | requireUser/Admin/Organizer/Counselor/Parent; каждое action — отдельно |
| IDOR | ✅ | все id-действия скоупятся по владельцу/активной связи |
| Инъекции SQL | ✅ | только Prisma; 2 raw — параметризованные tagged-templates |
| XSS | ✅ | 2 `dangerouslySetInnerHTML`: статический скрипт + `JSON.stringify`, оба под nonce |
| CSP | ✅ | nonce + strict-dynamic (`proxy.ts`), проверено без ошибок гидрации |
| CSRF | ✅ | Server Actions — встроенная origin-проверка Next; вебхуки — подпись |
| Секреты | ✅ | нет захардкоженных; всё из `process.env`; валидация `lib/env.ts` |
| Сравнение секретов | ✅ | constant-time `safeEqual` (ingest/telegram/cron) |
| Вебхуки | ✅ | платежи — HMAC + timingSafeEqual; Telegram — secret token |
| Загрузки файлов | 🟡 | size/MIME/расширения ✅; **антивирус нужен** (medium, нужен сервис) |
| Rate limiting | ✅ | login/upload/ingest/track; распределённый (Upstash) с фолбэком |
| Заголовки | ✅ | HSTS, X-Frame DENY, nosniff, Referrer-Policy, Permissions-Policy, no X-Powered-By |
| Утечки данных клиенту | ✅ | `NEXT_PUBLIC_*` — только APP_URL и публичный PostHog-ключ |
| RLS на уровне БД | 🟡 | подготовлен (`prisma/rls/`), активация — ops-шаг (нужна отдельная роль) |

## Детали

### Аутентификация и сессии (`lib/auth.ts`)
- Пароли — `bcrypt.hash(pw, 10)`. Cost 10 приемлем; при желании поднять до 12.
- Сессия — JWT (jose), `HS256`, `setExpirationTime` = 30 дней, подпись `AUTH_SECRET`.
- Cookie: `httpOnly:true`, `secure` в проде, `sameSite:"lax"`, `path:"/"`. ✅
- `getSession` валидирует подпись; при ошибке — `null` (fail-closed).

### Авторизация
- Layout защищает страницы; **server-actions защищаются каждое отдельно** —
  проверено: admin (6/6 requireAdmin), organizer/counselor/parent — все с гардом.
  Это важно: layout НЕ покрывает actions (они самостоятельные POST).
- IDOR: документы/заявки — `where { id, userId }`; организатор —
  `organizerId !== organizer.id`; куратор/родитель — через активную связь, не по
  id из URL. Дыр не найдено.

### Инъекции и XSS
- Все запросы через Prisma (параметризация). Два `$queryRaw/$executeRaw` —
  tagged-templates (`SELECT 1`, `set_config('app.user_id', ${userId}, true)`),
  Prisma параметризует `${}`. Unsafe-вариантов нет.
- `dangerouslySetInnerHTML`: (1) статический анти-FOUC скрипт темы,
  (2) `JSON.stringify(jsonLd)` из известного объекта — экранируется. Оба под
  nonce. Пользовательский ввод в HTML не вставляется.

### CSP / заголовки (`proxy.ts`, `next.config.ts`)
- Per-request nonce, `strict-dynamic`, `object-src 'none'`, `frame-ancestors
  'none'`, `base-uri/form-action 'self'`, `upgrade-insecure-requests`.
- `style-src 'unsafe-inline'` — осознанно (Tailwind inline-стили не исполняемы).
- Полный набор security-headers + `poweredByHeader:false`.

### Вебхуки и секреты
- Платёжный вебхук: проверка HMAC-подписи до чтения тела, `timingSafeEqual`,
  идемпотентность по `providerRef`, статус уже применён → no-op.
- Telegram webhook: `x-telegram-bot-api-secret-token`, constant-time сравнение.
- Ingest/cron: `Bearer <secret>`, constant-time `safeEqual`.
- Секреты только в env; `lib/env.ts` валидирует форму на старте.

### Что закрыто в этом аудите
- **Не-constant-time сравнение** секретов (ingest/telegram/cron) → `safeEqual`
  (`lib/timing-safe.ts`). Было low (секреты высокоэнтропийные), теперь корректно.
- **`/api/track/view` без лимита** → rate-limit 120/мин на IP. Раньше можно было
  накрутить просмотры/конверсию организатору.

## Открытые пункты (требуют внешних решений)

| Пункт | Severity | Что нужно |
|---|:-:|---|
| Антивирус загрузок | Medium | Подключить сканер (ClamAV/провайдер) в `/api/documents/upload`; размер/MIME/расширения уже валидируются |
| Активация RLS | Low (defense-in-depth) | Отдельная не-owner роль БД + переключить `DATABASE_URL`; SQL и runbook готовы в `prisma/rls/` |
| Распределённый rate-limit | Low | `UPSTASH_REDIS_REST_URL/TOKEN` (без них — per-instance in-memory) |
| Ротация `AUTH_SECRET` и смена демо-кредов | — | При боевом запуске; демо-аккаунты на прод не засеиваются (`SEED_DEMO`) |
| WAF / anti-bot | Low | Опционально Cloudflare перед Vercel |

## Новые поверхности (рычаги удержания/конверсии/доверия/портфолио)

Проверены отдельно, так как это свежий код с новыми точками ввода:

| Поверхность | Проверка | Статус |
|---|---|---|
| Сохранённые поиски (`saved-search.ts`) | все действия `requireUser` + `deleteMany where userId`; лимит 20/юзер; фильтры валидируются Zod | ✅ |
| Отзывы/исходы (`reviews.ts`) | `requireUser`; upsert по `userId_opportunityId` (нельзя переписать чужой); счётчики пересчитываются из источника | ✅ |
| Публичные отзывы на карточке | отдаются только `outcome/rating/comment/createdAt` — **без личности автора**, только `isPublic` | ✅ |
| Комментарии к заявке (`application-comments.ts`) | `resolveAccess`: только владелец заявки, активная связь куратора или родителя; удаление — только свой комментарий | ✅ |
| Web Push (`/api/push/subscribe`) | `pushConfigured` → 503; `requireUser`; Zod-валидация endpoint/keys; endpoint уникален (upsert) | ✅ |
| Публичное портфолио (`/p/[slug]`) | за флагом `portfolio_public_links` **и** тумблером ученика; отдаются только имя/город/школа/интересы/навыки/достижения — **без email, телефона, документов, заявок**; `noindex` | ✅ |
| Дайджест/алерты cron | шлют только владельцу поиска/своему ученику; идемпотентность по типу уведомления | ✅ |

Замечание (не уязвимость, продуктовое): отзыв можно оставить без проверки, что
пользователь реально подавал заявку — сделано намеренно (соц-доказательство), а
злоупотребления гасятся жалобами и trust score. При необходимости легко
ограничить наличием `Application`.

## Вывод

Приложение имеет крепкую базовую безопасность: единая модель авторизации,
закрытый IDOR, отсутствие инъекций/XSS, строгая CSP, подписанные вебхуки,
rate-limiting. Найденные в ходе аудита две low-проблемы устранены сразу.
Открытые пункты — либо требуют внешнего сервиса/ключа (антивирус, Upstash),
либо являются ops-решением (активация RLS), и все они задокументированы.

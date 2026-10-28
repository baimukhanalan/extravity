# Модель данных

PostgreSQL + Prisma. Полная схема — [`prisma/schema.prisma`](../prisma/schema.prisma).
Все таблицы имеют UUID PK, `createdAt`/`updatedAt`; там, где нужно, — `deletedAt` (soft delete),
внешние ключи, индексы и unique-ограничения.

## Основные сущности

### Пользователи и профили
- `User` — email, `passwordHash`, `role` (enum `Role`), `locale`, `isActive`.
- `StudentProfile` — данные онбординга: имя, дата рождения, город, школа, класс,
  `interests[]`, `skills[]`, `goals[]`, ограничения (бюджет, поездки, онлайн, паспорт), `onboardingCompleted`.
- `Organizer` — организация, статус верификации.
- `Subscription` / `SubscriptionPlan` — тариф и entitlements (JSON).

### Каталог
- `Category` — 20 категорий (slug + ru/kz/en + иконка).
- `Opportunity` — центральная сущность (~60 полей из ТЗ, раздел 9): описание, категория, теги,
  организатор, гео, формат, возраст/классы, участие/команда, цена/финпомощь, даты и дедлайны,
  документы, требования, призы, скоры (`prestige/difficulty/competition/trust/confidence`),
  `status` (enum `OpportunityStatus`), `moderationStatus`, флаги featured/sponsored.
- `SavedOpportunity` — сохранения (unique по user+opportunity).

### Заявки, документы, портфолио
- `Application` — workspace: `status` (enum `ApplicationStatus`), `progress`, `checklist` (JSON),
  `answers` (JSON), заметки. `ApplicationStatusHistory` — история статусов.
- `Document` — документы пользователя (в демо `isMock=true`; в проде — Storage + signed URL).
- `Achievement` — достижения (enum `AchievementType`), формируют портфолио.

### Модерация, уведомления, платформа
- `UserSubmission` — присланные пользователями ссылки (enum `SubmissionStatus`).
- `Notification` / `NotificationPreference` (в схеме) — уведомления по каналам.
- `FeatureFlag`, `AuditLog` — флаги и аудит действий.

## Enums

`Role`, `VerificationStatus`, `OpportunityStatus`, `ModerationStatus`, `Format`,
`ParticipationType`, `ApplicationStatus`, `SubmissionStatus`, `AchievementType`.

## Индексы (примеры)

`Opportunity`: по `status`, `categoryId`, `city`, `applicationDeadline`, `format`.
`Application`/`SavedOpportunity`/`Notification`: по `userId` (+ `isRead`). `AuditLog`: по `action`, `createdAt`.

## Миграции и seed

- Миграции — `prisma/migrations/` (`prisma migrate deploy`).
- Seed — [`prisma/seed.ts`](../prisma/seed.ts): 20 категорий, 3 тарифа, 9 feature-флагов,
  **30 возможностей** (разные категории/города, онлайн/офлайн, платные/бесплатные,
  verified/suspicious/closed, direct-apply), демо-администратор и демо-ученик с сохранёнными
  возможностями, заявкой, достижениями, документами и уведомлениями.

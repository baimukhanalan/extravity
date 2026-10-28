# News and web ingestion status — 2026-09-29

## Verified production state

- Vercel production: `https://extracurriculars-kz.vercel.app/news` returns HTTP 200 and shows three manually checked, original Russian summaries linked to MIT News.
- News migration `20260929090000_news_articles` applied to the Neon production database.
- Railway parser deployment `d0078653-91d2-4764-bb72-d99d37b7d466` succeeded. `/health` reports `collect-news` and `collect-web` scheduled; Telegram live has returned to `connected` with 66 channels and no reported error. Instagram and WhatsApp schedules remain disabled.
- Manual initial run: MIT AI 15 created, MIT Education 3 created/2 duplicate, NASA Technology 1 created, Google Blog 2 created. New items enter `PENDING_REVIEW`, not the public news page.
- Astana Hub event index: повторный ручной проход 29.09 дал 39 кандидатов, из них 2 новые записи и 37 дублей; ошибок и автопубликаций нет. До него были собраны 38 кандидатов (30 первоначально, 8 позже). Карточки поступают в очередь модерации без одобренного медиа.
- Повторный ручной проход новостных источников 29.09: Google Blog 2 дубля, MIT AI 15, MIT Education 5, NASA Technology 1; новых материалов и ошибок нет.
- Telegram live на повторной проверке `connected`: 66 каналов, последняя ошибка отсутствует, зарегистрировано новое событие после догрузки. Отдельную сессию тем же аккаунтом не запускали.
- The public opportunity catalog had zero published records before the run. The latest moderation snapshot had 227 Telegram `PENDING_REVIEW`, 234 Telegram `SUSPICIOUS`, and 38 Astana Hub `PENDING_REVIEW` opportunities; none had ready, rights-approved media. A bulk publish would violate the existing publication gate.
- The deadline cron now archives `CLOSED` records more than 30 days after their application deadline. `CRON_SECRET` was added to Vercel production; unauthenticated requests return 401. There were zero eligible records at the time of the dry count.

## Verification

- Web unit tests: 650 passed.
- Parser unit tests: 338 passed after the disabled UNESCO prototype was added; two Astana Hub connector tests are included in the parser suite.
- Browser E2E on a dedicated local PostgreSQL database: 31 passed.
- Vercel `/api/health` and `/news`: HTTP 200; `/api/cron/deadlines` without authorization: HTTP 401.

## Remaining gates

1. Moderate the current opportunity queue one record at a time: verify real organizer, audience, open deadline, application route and media rights. The site deliberately requires approved, ready media for public cards.
2. Expand news beyond the initial MIT/NASA/Google feeds only with verified primary sources and topical filtering. The current automated summaries are short attributed RSS previews, not original reported articles; keep editorial review before publication.
3. Confirm the first scheduled run via Railway logs. Telegram has returned to `connected`, but a successful manual run and registered schedule do not yet prove a full unattended cycle.
4. WhatsApp has no allowlisted readable groups; Instagram has no enabled verified source. Do not enable their schedules until connector preflight and rights checks pass.
5. Monitor Vercel daily cron on its next scheduled execution; manual unauthorized 401 confirms protection, not that the scheduler fired.

## Newly researched candidates (not connected yet)

- School opportunities: [FLEX Kazakhstan](https://kazakhstan.americancouncils.org/flex-en), [EducationUSA Astana](https://educationusa.state.gov/centers/educationusa-astana-american-councils), [Technovation Girls](https://www.technovation.org/blog), [WorldSkills Kazakhstan](https://worldskills.kz/), [Youth4Climate](https://www.undp.org/romecentre/our-programmes/youth4climate). Check current application window, Kazakhstani eligibility and age before creating opportunity cards.
- Youth news: [UNICEF Kazakhstan](https://www.unicef.org/kazakhstan/en/press-centre), [UNDP Kazakhstan](https://www.undp.org/kazakhstan/press-releases), [UNESCO education](https://www.unesco.org/en/education/news-stories). Official Google Blog RSS is already connected with topical filtering.
- No additional Telegram account membership was changed during this work. Candidate public channels require separate verification and should not race the active Railway Telegram session.
- UNESCO Education HTML index was explored and an adapter was prototyped. Повторный dry-run 29.09 снова не прошёл проверку `robots.txt` из-за тайм-аута; источник остаётся выключенным, обход и запись в production не выполнялись.

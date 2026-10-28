# Публикация каталога — 29 сентября 2026

## Проверенное состояние

- На production `https://extracurriculars-kz.vercel.app/catalog` опубликованы 10 карточек (после истечения срока возможность помечается закрытой). Они показывают медиа исходных Telegram-публикаций, а не сгенерированные иллюстрации. Для World Sports отображаются два снимка. У BU поверх исходного изображения есть предупреждение: сумма $25 000 в посте расходится с официальным условием о покрытии 50% стоимости обучения.
- 29.09 Vercel Blob вернул 403 для всех проверенных исходных медиа: оба хранилища приостановлены из-за лимита. Восемь изображений семи прежних карточек восстановлены из публичных исходных Telegram-постов в `public/source-media/`, развёрнуты в production и адресно привязаны к тем же media rows; Jefferson опубликована сразу со статической копией исходного фото. Три изображения совпадают побайтово со старыми файлами, остальные — сжатые веб-копии тех же изображений. Публичные статические URL и оптимизированные изображения на страницах Pearson и Jefferson проверены с HTTP 200. Пока Blob заблокирован, новые динамические загрузки фото/видео не будут работать; временные статические файлы требуют отдельного деплоя для каждой партии.
- В локальном `apps/parser/channels.yaml` включены 66 из 67 Telegram-источников.
- Ранее после публикации в production-базе было 1 374 Telegram-кандидата и 98 ожидающих проверки кандидатов с будущей датой; эти числа являются снимком, а не текущим счётчиком. Это очередь сбора, а не подтверждённые школьные заявки; расширенная годовая догрузка Telegram продолжается. В 66 источниках Telegram сохранены курсоры истории; на той проверке 36 догрузок завершились, 33 оставались активными.
- Опубликованные карточки имеют проверенную страницу организатора и медиа из исходного поста с сохранённой внутренней ссылкой на публикацию. Состояние `SOURCE_POST` означает происхождение изображения, а не независимо подтверждённую лицензию. Если организатор не указал точное время закрытия, в описании раскрыта консервативная техническая граница и совет подать заранее.
- Старые Telegram-медиа в очереди приведены к состоянию `SOURCE_POST`: проверены пути к исходным публичным постам, 1 734 записи обновлены пакетами и одна обновлена при публикации Pearson. После операции Telegram-медиа в состоянии `PENDING` среди уже обработанных файлов не осталось. Это не публикует кандидатов автоматически и не доказывает лицензию на изображения.
- 29.09 в Railway развёрнута отказоустойчивая очередь Telegram-медиа на постоянном томе `/data/telegram/media-spool`: при ошибке загрузки в Blob карточка с обязательным медиа и курсор канала удерживаются до повтора. Деплой Railway завершился `SUCCESS`, `/health` вернул 200; на диске проверены 9 удержанных записей (около 2,1 МБ) и 4,5 ГБ свободного места. Это не снимает блокировку самого Blob и пока не доказывает успешный replay после его восстановления.
- Следующий Railway-деплой добавил постоянную паузу после 403/429/5xx от media endpoint (60–3600 секунд) и убрал повторные HTTP-попытки внутри одного запроса загрузки; 382 теста парсера прошли, деплой `SUCCESS`, `/health` вернул 200. На томе после перезапуска сохранились 50 ожидающих записей; состояние паузы зафиксировало HTTP 500. Успешный replay возможен только после восстановления доступности хранилища.
- Дополнительный аудит подтвердил все 10 публичных карточек и страниц с адресами `/source-media/`, без сгенерированных обложек; 10 файлов каталога повторно ответили HTTP 200 `image/jpeg`. В Vercel развёрнут общий фильтр, исключающий известные старые сгенерированные медиа даже при ошибочном статусе прав, а семь прежних скриптов их публикации больше не допускают `--apply`. Сохранённые карточки используют тот же публичный фильтр; видео показывается без неподтверждённого постера. Проверки: 668 тестов сайта и TypeScript прошли.
- В Railway развёрнуты fail-closed исправления для Instagram и WhatsApp: миниатюра Instagram не заменяет исходное изображение; неполные карусели/наборы вложений удерживаются без публикации и продвижения курсора. Деплой завершился `SUCCESS`, `/health` вернул 200, после смены контейнера на постоянном томе проверены 64 полные ожидающие записи. Полный набор тестов парсера: 388. Сами Instagram/WhatsApp-сборщики пока не активны из-за отсутствия проверенного подключения/allowlist; деплой исправления не является подтверждением их автоматического сбора.
- Повторная проверка 29.09: в Telegram-очереди 98 ожидающих записей с будущим распознанным сроком и исходным медиа, но среди них не нашлось новой карточки с одновременно подтверждёнными возрастом, допуском школьников Казахстана, ценой и сроком. Nexus Youth Exchange удержан из-за обязательного невозвратного взноса, не раскрытого в карточке; KEBO, ML School Kazakhstan, Space-π и сочинский конкурс требуют отдельной проверки условий. Пустое поле срока также не доказывает актуальность: обнаружены уже завершившиеся объявления. Новые карточки по этому аудиту не опубликованы.
- Приостановка Vercel Blob повторно подтверждена HTTP 403 для исходного файла. Обновлённый `/api/parser/media` теперь возвращает явный HTTP 503 при `BlobStoreSuspendedError`, не выдавая внутреннюю ошибку за успешную загрузку. Деплой `dpl_2wRATg4LM3byHTgo27yCPTvJWLgc` имеет статус `READY`; каталог, `/api/health` и Railway `/health` ответили HTTP 200. Это диагностическое изменение не восстанавливает Blob и не разблокирует накопившиеся медиа.
- Подготовлен альтернативный поток исходных медиа на существующем постоянном диске Railway: отдельное хранилище с неизменяемым SHA-256 ID, проверкой целостности/квоты и подписанной выдачей с Range для видео. Сайт проверяет статус конкретного файла и карточки, выдаёт короткую ссылку только после публикации; у модератора отдельный авторизованный предпросмотр. Сборщик не отдаёт сырой Telegram spool. Добавлены защищённый список ссылок БД и только ручная dry-run очистка неиспользуемых файлов. Локально прошли 678 тестов сайта и 400 тестов парсера.
- Сторона сайта развернута как `dpl_6XpvN9b2xyuq5zEnxabqbyKiZYmt` (`READY`), но новый backend остаётся выключен. Публичный каталог и `/api/health` ответили HTTP 200; тестовый несуществующий файл дал 404, защищённый список ссылок без авторизации — 401. Два прохода `railway up` получили «Deploys have been paused temporarily»; последняя рабочая версия парсера осталась прежней, на томе всё ещё 64 полных ожидающих набора (36 МБ). Не ставить `MEDIA_STORAGE_BACKEND=railway_volume` до успешного деплоя парсера и проверки связки.
- После этого локальный парсер дополнительно усилен: исходные Telegram-фото до 32 МБ поддерживаются новым backend; неполные альбомы Telegram/web/RSS удерживаются вместо обрезания; статья с галереей не подменяется OG-обложкой; WhatsApp требует явного подтверждения публичного канала и исходного медиа, иначе не продвигает offset. Всего 409 тестов парсера и 678 тестов сайта прошли; эти последние parser-изменения ещё не развернуты. Три попытки нового Railway-деплоя отклонены текущей платформенной паузой. [Статус Railway](https://status.railway.com/) сообщает о расследуемом сбое API/deployments с 15:29 UTC 29.09.
- Импорт перестал считать отсутствующие данные о стране, формате и стоимости подтверждёнными: такие Telegram/web-кандидаты остаются в закрытой очереди, а автопубликация и ручное одобрение через обычную административную кнопку блокируются до сверки. Парсеры больше не называют неизвестный формат онлайн по умолчанию. Восстановление старых Telegram-медиа подготовлено как двухступенчатый dry-run/upload с проверкой исходного поста, полного альбома и SHA-256, затем подписанный отчёт может адресно обновить только медиа-поля БД. В production эти ремонтные команды не запускались; перед этим нужны успешный Railway-деплой и проверка нового хранилища. Локально прошли 690 тестов сайта и 418 тестов парсера, TypeScript; lint без ошибок (одно прежнее предупреждение). Сайт с новым блокирующим правилом развёрнут как `dpl_EHRii1DJ59xgYVQu6ZX9L7Ythd7n` (`READY`): `/catalog` и `/api/health` ответили 200, несуществующий медиафайл — 404. Railway backend по-прежнему выключен, и новых карточек эта работа не опубликовала.
- 30.09 Railway возобновил деплои. Парсер с новым кодом развёрнут (`8f07fd31-6bf8-485d-9833-5d1a643c6997`, `SUCCESS`), затем включён `MEDIA_STORAGE_BACKEND=railway_volume` на существующем томе `/data` с отдельным корнем `/data/source-media` и квотой 2 ГиБ (`dfec3480-18d4-4f5a-a3b8-aa8465e98da1`, `SUCCESS`). Проверка тома и подписи оригинального Telegram-файла дала `ready=true` и HTTP 200 `image/jpeg`; через сайт неопубликованный файл дал ожидаемый 404. На Vercel добавлены только origin парсера и флаг нового медиа backend, деплой `dpl_Fy8RqtkA5qrgmV4Vi6o1GALkaYgJ` готов; `/catalog` и `/api/health` вернули 200, авторизованный preflight парсера подтвердил `ready=true`. Старая пауза загрузки от отказа Blob (13 неудач, HTTP 503) сохранена как резервная копия на томе, активный таймер снят после проверки нового backend. Живой Telegram-сбор возобновил обработку: число полных удержанных наборов уменьшилось с 65 до 62, без новых ошибок media circuit; в БД на проверке уже было 5 медиа с ключом `railway-volume:`. Это подтверждает начавшуюся загрузку, но не завершение всей очереди и не публикацию всех кандидатов. На сайте на этой проверке оставались 10 опубликованных карточек, 103 Telegram-кандидата с будущим сроком и исходным медиа ждали модерации. Отдельный ремонт старых DB media rows ещё не запускался.
- Последующая проверка 30.09: удержанная Telegram-очередь сократилась до 60 полных наборов, на новом backend в БД уже 23 исходных медиа, media circuit остаётся без ошибок. Каталог по-прежнему содержит 10 одобренных карточек; наличие файла само по себе не подтверждает право на публикацию и условия программы. `/health` показывает live Telegram (`catching_up`, 66 каналов) и запланированные web/news jobs, но Instagram Graph и WhatsApp collector/linked session пока `ready=false`: полный многоканальный сбор не следует считать включённым.
- Утренняя проверка 30.09 после непрерывного сбора: в БД 2 974 Telegram-кандидата и 1 201 медиа с ключом `railway-volume:`, публичных одобренных карточек 10. На постоянном томе осталось два неполных Telegram-набора (по одному ожидаемому вложению, ноль скачанных); их курсоры не должны продвигаться и карточки нельзя публиковать без оригинала. У 66 включённых каналов 50 исторических курсоров дошли до границы, 14 ещё догружаются, у двух история не начата/нет курсора. Один канал истории останавливался на некорректной дате с нулевым днём; `_year_for` теперь не выбрасывает исключение, а пропускает недопустимую дату. 419 тестов парсера прошли, Railway-деплой `b2e44d75-75d0-4b2f-9f37-cd2ebd8e7f76` имеет `SUCCESS`, `/health` — 200, `last_error` после рестарта — `null`. Квота нового медиахранилища увеличена с 2 до 3 ГиБ внутри существующего тома; на проверке оставалось около 1,9 ГиБ квоты и 3,5 ГБ физически свободного места. Это не означает, что все 66 историй завершены или все 2 974 записи являются актуальными школьными возможностями.
- Следующая проверка 30.09: историческая догрузка продвинулась до 52 завершённых каналов, 12 ещё активны, у двух источников пока нет курсора и нет обработанных постов. В БД уже 2 994 Telegram-кандидата и 1 218 оригинальных медиа на Railway. Два неполных набора удерживаются без публикации; их исходные вложения требуется отдельно диагностировать. Подтверждение владельца собирать публичные каналы не заменяет технически недоступный оригинал, корректный срок или данные о допуске школьников, поэтому все собранные посты нельзя автоматически считать актуальными карточками.
- Два оставшихся неполных набора относятся к публикациям с видео (публичный предпросмотр Telegram показывает видеоплеер), но точный размер оригиналов ещё не установлен. На Railway предел загрузки MP4 повышен с 64 до 100 МБ, что совпадает с лимитом хранилища; для Blob прежний предел остаётся. 420 тестов парсера прошли. Деплой `0ca85206-09ef-41a4-b7e7-fde57b5828b8` завершился `SUCCESS`; после повторного деплоя той же логики с исходной конфигурацией каналов `8b0c5821-50e1-4b37-b8ab-e5336d8de03b` тоже `SUCCESS`, `/health` — 200, `last_error=null`. Полный оригинал видео обязателен: миниатюру не подставляли вместо него. `ouvrelife` остаётся выключенным, так как аккаунт не подписан; временное включение строки конфигурации не увеличило число реально собираемых каналов (66) и было откатано.
- Исправление аудита курсоров 30.09: в ранних строках выше «два канала без истории» — ошибка счётчика, который сравнивал регистр имени буквально. Сопоставление имён без учёта регистра обнаружило курсоры у всех 66 действующих каналов: 54 завершили годовую историческую догрузку, 12 продолжали её на последней проверке, нулевых курсоров нет. Публичная страница `AlmatyITCommunity` показывает последний пост 2023 года, поэтому он не добавляет актуальных карточек в окне 365 дней; `BigTechDream` обрабатывался под именем в нижнем регистре. Не использовать прежнее число «два не начаты» как текущее состояние.

## Публикации

| Карточка | Срок | Официальные условия | Исходный пост с медиа |
| --- | --- | --- | --- |
| [SSR Global Research Challenge 2026](https://extracurriculars-kz.vercel.app/opportunities/ssr-global-research-challenge-2026) | 30.09.2026, время не указано | [Страница конкурса](https://ssruk.org/research-competition/), [форма](https://ssruk.org/competition-entry/) | [univerguide/1232](https://t.me/univerguide/1232) |
| [Hinksey Labs Business Essay Competition 2026](https://extracurriculars-kz.vercel.app/opportunities/hinksey-business-essay-competition-2026) | 14.10.2026, время не указано | [Страница и форма](https://www.hinkseylabs.com/competition) | [univerguide/1239](https://t.me/univerguide/1239) |
| [Harvard Student Agencies Case Competition 2026](https://extracurriculars-kz.vercel.app/opportunities/harvard-student-agencies-case-competition-2026) | 17.10.2026, 23:59 ET | [Страница](https://highschoolcasecomp.org/), [FAQ](https://highschoolcasecomp.org/faq), [форма](https://highschoolcasecomp.org/register) | [univerguide/1238](https://t.me/univerguide/1238) |
| [World Sports Photography Awards 2027](https://extracurriculars-kz.vercel.app/opportunities/world-sports-photography-awards-2027) | 23.11.2026, время не указано | [FAQ](https://www.worldsportsphotographyawards.com/footer/faqs), [правила](https://www.worldsportsphotographyawards.com/footer/rules), [форма](https://worldsportsphotographyawards.awardmgt.com/) | [bluescreenkz/17691](https://t.me/bluescreenkz/17691), два фото |
| [Boston University Presidential Scholarship 2026](https://extracurriculars-kz.vercel.app/opportunities/boston-university-presidential-scholarship-2026) | 01.12.2026, время не указано | [Стипендия](https://www.bu.edu/admissions/tuition-aid/scholarships-financial-aid/first-year-merit/presidential/), [международные кандидаты](https://www.bu.edu/admissions/tuition-aid/scholarships-financial-aid/first-year-merit/), [поступление](https://www.bu.edu/admissions/apply/first-year/) | [grants_scholarships/7270](https://t.me/grants_scholarships/7270), ошибка суммы отмечена |
| [Open Doors 2026 — Bachelor's Track](https://extracurriculars-kz.vercel.app/opportunities/open-doors-2026-bachelors-track) | 01.11.2026, время не указано | [Официальные правила](https://od.globaluni.ru/rules), [сайт конкурса](https://od.globaluni.ru/) | [studygrants/7304](https://t.me/studygrants/7304) |
| [Lester B. Pearson Scholarship 2027 — University of Toronto](https://extracurriculars-kz.vercel.app/opportunities/lester-b-pearson-scholarship-2027-university-of-toronto) | 09.10.2026, осторожная граница первого этапа 21:59 Алматы | [Официальная стипендия и три срока](https://future.utoronto.ca/pearson-scholarships), [способы подачи и стоимость](https://future.utoronto.ca/applications) | [studyqa/15411](https://t.me/studyqa/15411) |
| [Jefferson Scholarship 2027 — University of Virginia](https://extracurriculars-kz.vercel.app/opportunities/jefferson-scholarship-2027-university-of-virginia) | 01.12.2026, осторожная граница 21:59 Алматы | [Номинация школой](https://www.jeffersonscholars.org/scholarships/selection), [международные участники и срок](https://www.jeffersonscholars.org/scholarships/walentas-faqs), [стоимость заявки UVA](https://uvafinance.virginia.edu/resources/2026-27-tuition-and-fee-rates) | [studyqa/15577](https://t.me/studyqa/15577) |
| [LaunchZone Startup Competition 2026](https://extracurriculars-kz.vercel.app/opportunities/launchzone-startup-competition-2026) | 02.10.2026, 23:59 по сообщению организатора; часовой пояс не указан | [Анонс](https://t.me/launchzonehub/177), [положение](https://t.me/launchzonehub/178), [форма](https://forms.gle/wPPk8kzXeeDECojC6) | [myextrakz/3351](https://t.me/myextrakz/3351) |
| [TAMOS CASE HACKATHON 2026](https://extracurriculars-kz.vercel.app/opportunities/tamos-case-hackathon-2026) | 01.10.2026, осторожная граница 21:59 Алматы | [Положение](https://docs.google.com/document/d/11joQGDthVSS1TvZUtnAJGgjY3Sflw7OsrJDk1ae0TYw/edit?usp=sharing), [форма](https://forms.gle/8NSi6ZfspXRCVYPfA) | [myextrakz/3354](https://t.me/myextrakz/3354) |

## Не опубликовано массово

Оставшиеся кандидаты с будущими датами требуют сопоставления с официальной страницей и отбора по школьной аудитории, доступности из Казахстана, действующей форме, цене и происхождению медиа. В очереди есть магистратура/PhD, взрослые стажировки, зарубежные мероприятия с ограничением по стране, репосты и неверно распознанные сроки. Astana Hub: 40 кандидатов, но поле срока подачи у них пустое; даты мероприятий не использованы как сроки заявок. У World Sports официальные правила говорят «open to anyone», но отдельные требования к несовершеннолетним не раскрывают; в карточке есть предупреждение проверить их перед регистрацией.

Не опубликована KEBO 2026: действующая форма открыта, но на доступной без заполнения странице нет надёжного подтверждения цены и точного организатора, а исходное изображение поста показывает прежнее название формы. LaunchZone опубликована после проверки действующей Google-формы с авторизованным аккаунтом: нужен Google-вход, материалы команды, ручная оплата 4 000 ₸ за команду и загрузка чека; форму не отправляли. TAMOS опубликована после сверки положения и живой формы: 8–11 классы, команда 3–5 человек, взнос 3 000 ₸ с команды, чек оплаты, скриншот репоста в Instagram Stories и очный финал 4 октября; ученикам других школ рекомендовано уточнить допуск до оплаты. Форму не отправляли. Для Jefferson Scholarship необходима номинация школой, поэтому опубликованная карточка не предлагает прямую самостоятельную заявку. У Open Doors обязательные этапы с личной идентификацией и самостоятельными заданиями. У BU стипендия покрывает половину tuition; отдельной заявки на стипендию нет, но есть платная заявка на поступление с возможностью освобождения от взноса.

Кандидат MEXT Undergraduate 2027 был удержан в очереди: общий распознанный срок 30.10.2026 относился к смешанным маршрутам. [Посольство Японии в РК](https://www.kz.emb-japan.go.jp/itpr_ru/11_000001_00640.html) закрыло свой бакалаврский маршрут 29.05.2026 в 17:00 Астана, а университетский маршрут требует отдельного вуза и своего официального срока. Неподтверждённый общий срок удалён из production-кандидата, статус оставлен `PENDING_REVIEW`.

UNESCO Science Club Challenge 2026 оставлена в очереди: обновлённые [официальная страница](https://www.unesco.org/en/articles/call-applications-science-club-challenge-2026-asia-pacific-edition) и [форма](https://surveys.unesco.org/175377?lang=en) подтверждают продление до 7 октября, но исходный Telegram-пост не содержит фото или видео. Премия [QazVolunteer](https://award.qazvolunteer.kz/ru/apply) также удержана: форма и фото есть, но допуск участников младше 18 лет в проверенных условиях не подтверждён.

Для Pearson первый этап — номинация школой, затем отдельные сроки поступления и заявки на стипендию. Стоимость CAD 196 относится к International Application при подаче только в U of T; тариф OUAC при подаче в другие университеты отличается. Университет запрещает генеративный ИИ в текстах заявки на стипендию.

## Архив иллюстраций (сняты с показа)

Ранее эти иллюстрации были ошибочно использованы вместо медиа публикаций. В production они помечены `REJECTED` и не отображаются. Исходные файлы оставлены в проекте как исторический артефакт; для новых карточек не использовать.

Промпт SSR:

```text
Use case: scientific-educational
Asset type: landscape cover illustration for Extravity opportunity catalog, SSR Global Research Challenge 2026
Primary request: an original conceptual illustration of a diverse group of secondary-school students collaboratively developing a social science research proposal.
Scene/backdrop: bright contemporary study room, abstract world map and subtle charts behind them.
Subject: students ages roughly 14-17 discussing research notes and presenting an idea.
Style/medium: polished editorial digital illustration, clearly not a documentary photograph.
Composition/framing: wide landscape 16:10-ish, full-bleed with clear focal group, works as a card and large gallery image.
Lighting/mood: inspiring, warm, thoughtful.
Color palette: deep blue, teal, warm coral accents.
Constraints: no text, no logos, no trademarks, no flags, no watermarks. Do not depict an actual event or imply this image came from the organizer. Original visual only.
```

Промпт Hinksey:

```text
Use case: illustration-story
Asset type: landscape cover illustration for Extravity opportunity catalog, Hinksey Labs Business Essay Competition 2026
Primary request: an original editorial illustration of a high-school student independently writing and researching a business case-study essay about how AI changes a company.
Scene/backdrop: bright study desk with notebook, laptop showing abstract non-readable charts, books and sticky notes.
Subject: one teenager age approximately 16 thoughtfully comparing notes and business diagrams.
Style/medium: polished contemporary digital illustration, obviously illustrative rather than documentary photography.
Composition/framing: wide landscape 16:10-ish, full-bleed; subject clear at both thumbnail and detail scale.
Lighting/mood: focused, optimistic, intellectually curious.
Color palette: blue, indigo, warm orange and soft cream.
Constraints: no text, no logos, no trademarks, no watermarks. Do not imply this depicts an actual Hinksey Labs student or event. Original visual only.
```

Промпт Harvard Student Agencies Case Competition (встроенный генератор):

```text
Use case: illustration-story
Asset type: wide landscape cover image for an Extravity opportunity catalog card
Primary request: an original editorial illustration of one high-school student developing a business case competition strategy, studying an abstract market chart and sketching a presentation deck.
Scene/backdrop: contemporary home study desk, laptop with abstract unreadable graphs, notebook and sticky notes.
Subject: a teenager focused on independent analysis; clearly a conceptual scene, not a documented participant or event.
Style/medium: polished contemporary digital illustration, visibly illustrative.
Composition/framing: full-bleed horizontal landscape about 16:10, subject and desk prominent, legible at thumbnail and large gallery scale.
Lighting/mood: warm, energetic, thoughtful.
Color palette: navy, cyan, warm amber.
Constraints: no text, no logos, no trademarks, no flags, no watermarks; do not imply any endorsement by Harvard or event organizers.
```

Промпт World Sports Photography Awards (встроенный генератор):

```text
Use case: illustration-story
Asset type: wide landscape cover illustration for an Extravity catalog card about a sports photography competition
Primary request: an original editorial illustration of a young amateur photographer at the sideline of a local school athletics track, carefully photographing runners with a camera.
Scene/backdrop: generic outdoor athletics track, runners in motion, no recognizable real event or athletes.
Subject: photographer with camera in foreground and athletes in distance.
Style/medium: polished painterly digital illustration, unmistakably illustrative rather than a submitted competition photograph.
Composition/framing: horizontal full-bleed landscape approximately 16:10, main subject visible in both small card and large gallery view.
Lighting/mood: energetic golden-hour light, thoughtful creative focus.
Color palette: cobalt, teal, warm orange.
Constraints: no text, logos, trademarks, flags, watermarks, identifiable real athletes, or implication of organizer endorsement; the image is only Extravity editorial art and not an example eligible competition entry.
```

Промпт Boston University Presidential Scholarship (встроенный генератор):

```text
Use case: illustration-story
Asset type: wide landscape catalog cover illustration for Extravity, a student opportunity listing about a half-tuition merit scholarship at a university
Primary request: an original editorial illustration of a high-school senior planning a university application and scholarship, reviewing a checklist and academic notes at a desk.
Scene/backdrop: bright generic study room, books, open laptop with abstract unreadable application interface, window showing a non-identifiable campus silhouette.
Subject: one student age about 17–18 concentrating on their own application.
Style/medium: polished contemporary digital illustration, clearly not a documentary photograph.
Composition/framing: horizontal 16:10 full-bleed, clear focal point at small card size and large gallery view.
Lighting/mood: hopeful, focused, warm daylight.
Color palette: deep blue, cream, muted red accents.
Constraints: no text, no logos, no trademarks, no recognizable Boston University buildings or seal, no watermarks; do not imply university endorsement or depict an actual scholarship recipient.
```

Промпт Open Doors Bachelor's Track (встроенный генератор):

```text
Use case: illustration-story
Asset type: wide landscape editorial cover illustration for an Extravity listing of an international university entrance scholarship competition
Primary request: an original conceptual illustration of a 17-year-old student preparing a multilingual academic portfolio and motivation letter on a laptop for overseas university study.
Scene/backdrop: quiet modern study desk with books, passport-shaped closed travel document without insignia, abstract globe and campus map motifs in the background.
Subject: one high-school student independently organizing their documents, focused and hopeful.
Style/medium: polished digital illustration, clearly illustrative rather than a documentary photograph.
Composition/framing: horizontal full-bleed 16:10, readable at card and detail size.
Lighting/mood: bright, aspirational, studious.
Color palette: deep cobalt, teal, gold accents.
Constraints: no text, no logos, no flags, no recognizable university buildings, no watermarks; do not imply organizer endorsement or that an AI-generated image is an eligible submission.
```

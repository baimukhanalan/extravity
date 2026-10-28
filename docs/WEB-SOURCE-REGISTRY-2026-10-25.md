# Extravity — публичные web-источники возможностей

Дата проверки: **25 октября 2026**. Реестр подготовлен для discovery и проектирования ingest; он ничего не включает в production автоматически.

## Обозначения и правила

- Категории — точные slug из `prisma/seed.ts`. Первые десять (`startup`…`course`) разобраны первыми и глубже.
- `A` — публичная страница ответила и `robots.txt` не запрещает весь сайт; это не лицензия на копирование.
- `R` — root `Disallow: /`, HTTP 403/405 или выраженная anti-bot защита: только ручной discovery/официальная интеграция.
- `M` — robots отсутствует/неоднозначен: до автоматизации обязательны ручная проверка Terms и консервативный rate limit.
- Для всех источников: сохранять только фактические поля и ссылку/provenance; не копировать медиа и полный текст без отдельного разрешения; не обходить login, CAPTCHA, WAF или закрытый API; соблюдать возрастные и географические ограничения.
- Частота — рекомендуемая частота проверки, а не обещание издателя. `P0` — первичный feed, `P1` — важное дополнение, `P2` — нишевый источник, `D` — только discovery.

## Приоритетные десять категорий

| № | Источник | Категории | География / возраст | Тип и пригодность | Проверка | Частота | Ограничения | Приоритет |
|---:|---|---|---|---|---|---|---|---|
| 1 | [Astana Hub Events](https://astanahub.com/en/event/) | startup, hackathon, bootcamp, forum | Казахстан; обычно 14+/студенты, проверять карточку | официальный календарь; HTML + sitemap | 200, A | 6 ч | metadata-only, условия в карточке | P0 |
| 2 | [hackathon.kz](https://hackathon.kz/) | hackathon, startup, bootcamp | Казахстан/онлайн; школьники и студенты | агрегатор; структурированный HTML + sitemap, ведёт к организаторам | 200, A | 3 ч | подтверждать на первоисточнике | P0 discovery |
| 3 | [Devpost Hackathons](https://devpost.com/hackathons) | hackathon, startup | глобально; возраст зависит от события | агрегатор; HTML, но robots блокирует | 200, R | ручная | не парсить; искать официальный сайт | D |
| 4 | [Major League Hacking](https://mlh.io/seasons/2026/events) | hackathon, bootcamp | международно; в основном 13+/студенты | официальный сезон; HTML + sitemap | 200, A | 12 ч | eligibility каждого события | P1 |
| 5 | [F6S Programs](https://www.f6s.com/programs) | startup, bootcamp, mentorship | глобально; чаще 18+, отдельный youth-фильтр | агрегатор; robots root-block, ответ 405 | 405, R | ручная | login/Terms; только discovery | D |
| 6 | [Challenge.gov](https://www.challenge.gov/) | startup, hackathon, science, social | США/глобально; возраст по challenge | официальный госреестр; HTML, возможны открытые данные | 200, M | 12 ч | проверять eligibility/non-US | P1 |
| 7 | [Blue Ocean Competition](https://blueoceancompetition.org/compete/) | startup | глобально; high school, примерно 14–18 | официальный конкурс; HTML + sitemap | 200, A | ежедневно в сезон | ежегодный цикл | P0 |
| 8 | [Diamond Challenge](https://diamondchallenge.org/) | startup, social | глобально; high school | официальный конкурс; HTML + sitemap | 200, A | ежедневно в сезон | командные/возрастные правила | P0 |
| 9 | [School Enterprise Challenge](https://www.schoolenterprisechallenge.org/faqs) | startup, social | глобально; школы, дошкольные–secondary | официальный конкурс; HTML, но robots root-block | 200, R | ручная | обращаться за feed/разрешением | D |
| 10 | [International AI Startup Challenge](https://www.joiniasc.org/competition) | startup, hackathon | глобально; 13–18 | официальный конкурс; HTML + sitemap | 200, A | ежедневно в сезон | новый организатор — доп. trust review | P1 |
| 11 | [Daryn calendar](https://daryn.kz/darynkz/darynkz-kalendar/darynkz.php) | olympiad, science, creative, robotics | Казахстан; 1–12 классы | официальный календарь; HTML + sitemap | 200, A | 3 ч | основной государственный первоисточник | P0 |
| 12 | [myolympiad.kz](https://myolympiad.kz/olympiad/) | olympiad, science | Казахстан/международно; школьники | организатор/каталог; HTML | 200, A | 6 ч | отличать свои и внешние олимпиады | P1 |
| 13 | [IMO](https://www.imo-official.org/) | olympiad | международно; secondary, через сборную | официальный международный организатор; HTML | 200, A | еженедельно | не обещать прямую подачу | P1 |
| 14 | [IPhO](https://www.ipho-new.org/) | olympiad, science | международно; secondary, нац. отбор | официальный сайт; HTML | 200, A | еженедельно | участие через национальную команду | P1 |
| 15 | [IChO](https://www.icho-official.org/) | olympiad, science | международно; secondary, нац. отбор | официальный сайт; HTML | 200, M | еженедельно | robots отсутствует; metadata-only | P1 |
| 16 | [IOI](https://ioinformatics.org/) | olympiad, hackathon | международно; secondary, нац. отбор | официальный сайт; HTML | 200, M | еженедельно | robots отсутствует | P1 |
| 17 | [International Economics Olympiad](https://ieo-official.org/) | olympiad, startup | международно; high school | официальный сайт; HTML | 200, A | еженедельно | участие часто через нац. отбор | P1 |
| 18 | [SOF exam schedule](https://sofworld.org/exam-schedule) | olympiad | преимущественно Индия/школы; 1–12 классы | официальный календарь; HTML + sitemap | 200, A | ежедневно в сезон | география и school registration | P2 |
| 19 | [Bebras events](https://www.bebras.org/events.html) | olympiad, hackathon | глобально; school-age | международная сеть; HTML + sitemap | 200, A | еженедельно | подаваться через local partner | P1 |
| 20 | [AoPS Contests](https://artofproblemsolving.com/community/c13_contests) | olympiad | глобально; школьники | community-агрегатор; anti-bot/root-block | 403, R | ручная | discovery, не ingest | D |
| 21 | [myMUN conferences](https://mymun.com/conferences) | mun | глобально; HS/university | агрегатор; динамический HTML + sitemap | 200, A | 12 ч | перепроверять у конференции | P1 discovery |
| 22 | [MUN.events](https://www.mun.events/conferenceList) | mun | глобально; фильтр High School | агрегатор; HTML + sitemap | 200, A | 12 ч | organizer verification обязателен | P0 discovery |
| 23 | [Best Delegate conference list](https://bestdelegate.com/model-un-conferences/) | mun, course | глобально; middle/high school | отраслевой каталог; HTML + sitemap | 200, A | ежедневно | часть данных редакционная | P1 discovery |
| 24 | [THIMUN Foundation](https://foundation.thimun.org/) | mun | глобально; secondary schools | официальный организатор; HTML + sitemap | 200, A | ежедневно в сезон | school/delegation registration | P1 |
| 25 | [Tabroom](https://www.tabroom.com/index/index.mhtml) | debate | глобально с сильным US-покрытием; MS/HS/college | tournament platform; HTML | 200, A | 3 ч | применять возраст/гео фильтры | P0 discovery |
| 26 | [World Schools Debating](https://wsdcdebating.org/) | debate | международно; secondary, сборные | официальный чемпионат; HTML, robots root-block | 200, R | ручная | национальный отбор; не парсить | D |
| 27 | [NYPDL schedule](https://www.nyparli.org/schedule) | debate | США/частично online; high school | официальный league calendar; HTML, robots root-block | 200, R | ручная | локальная география | D |
| 28 | [USTEM Competitions](https://www.ustem.kz/en/competitions) | robotics, science, hackathon | Казахстан/Центральная Азия; школьники | официальный организатор; HTML + sitemap | 200, A | 6 ч | сильный KZ-первоисточник | P0 |
| 29 | [FIRST event search](https://www.firstinspires.org/team-event-search) | robotics | глобально; 4–18 по программам | официальный каталог; HTML + sitemap | 200, A | 12 ч | региональная квалификация | P0 |
| 30 | [World Robot Olympiad](https://wro-association.org/competition/) | robotics | глобально; elementary–senior | официальный организатор; HTML + sitemap | 200, A | ежедневно в сезон | local national organizer | P0 |
| 31 | [VEX Events](https://events.vex.com/) | robotics | глобально; elementary–university | официальный каталог; JS/API-like UI | 403 page, robots A | 12 ч | не обходить WAF; искать documented feed | P1 gated |
| 32 | [RoboCupJunior events](https://junior.robocup.org/events/) | robotics | глобально; до 19 лет | официальный календарь; HTML | 200, A | 12 ч | квалификация по региону | P0 |
| 33 | [Regeneron ISEF](https://www.societyforscience.org/isef/) | science, research | глобально; grades 9–12 через affiliated fair | официальный организатор; HTML + sitemap | 200, A | ежедневно в сезон | непрямая подача | P0 |
| 34 | [Conrad Challenge](https://www.conradchallenge.org/) | science, startup | глобально; 13–18 | официальный конкурс; endpoint нестабилен | timeout, M | ежедневно в сезон | подключать после ручного preflight | P1 gated |
| 35 | [Breakthrough Junior Challenge](https://breakthroughjuniorchallenge.org/) | science, creative | глобально; 13–18 | официальный конкурс; HTML + sitemap | 200, A | ежедневно в сезон | ежегодный цикл | P0 |
| 36 | [GENIUS Olympiad](https://geniusolympiad.org/) | science, research, creative | международно; high school | официальный конкурс; HTML + sitemap | 200, A | ежедневно в сезон | стоимость/поездка отдельно | P0 |
| 37 | [NYAS Junior Academy](https://www.nyas.org/learning/high-school-research-programs/the-junior-academy/) | science, research, mentorship | глобально; 13–17 | официальный program page; HTML + sitemap | 200, A | ежедневно в окно | competitive application | P0 |
| 38 | [CEE Research Science Institute](https://www.cee.org/programs/research-science-institute) | research, summer | международно; rising seniors | официальный program page; robots root-block | 200, R | ручная | не парсить; annual manual record | D |
| 39 | [Pioneer Academics](https://pioneeracademics.com/) | research, mentorship | глобально; high school | официальный провайдер; HTML + sitemap | 200, A | ежедневно в окно | платная программа/aid; verify claims | P1 |
| 40 | [Polygence projects](https://www.polygence.org/projects) | research, mentorship | глобально; high school | коммерческий каталог; HTML | 200, A | ежедневно | платно; pricing/Terms essential | P2 |
| 41 | [Lumiere Education](https://www.lumiere-education.com/) | research, mentorship | глобально; high school | коммерческий provider; robots root-block | 200, R | ручная | не парсить, verify pricing | D |
| 42 | [Harvard HS Research Conference](https://www.harvardresearch.org/faqshsrc) | research, forum | глобально; grades 9–12 | официальный student conference; HTML + sitemap | 200, A | ежедневно в окно | отдельная организация, не Harvard admin | P1 |
| 43 | [College Board SAT dates](https://satsuite.collegeboard.org/sat/dates-deadlines) | test-prep | глобально/KZ; secondary | официальный календарь; HTML + sitemap | 200, A | ежедневно | timezone и international rules | P0 |
| 44 | [IELTS test centres Kazakhstan](https://ielts.org/test-centres?city=all&country=kaz) | test-prep | Казахстан; обычно 16+ | официальный finder; dynamic HTML + sitemap | 200, A | ежедневно | даты могут грузиться динамически | P0 |
| 45 | [IDP IELTS Kazakhstan dates](https://ielts.kz/exams-dates/) | test-prep | Казахстан; школьники/взрослые | официальный локальный центр; HTML + sitemap | 200, A | ежедневно | платёж/документы не автоматизировать | P0 |
| 46 | [ETS TOEFL scheduling](https://www.ets.org/toefl/test-takers/ibt/schedule.html) | test-prep | глобально; школьники/взрослые | официальный календарь; HTML + sitemap | 200, A | ежедневно | availability может быть за формой | P1 |
| 47 | [ACT registration](https://www.act.org/content/act/en/products-and-services/the-act/registration.html) | test-prep | международно; high school | официальный календарь; HTML + sitemap | 200, A | ежедневно | международные центры отдельно | P1 |
| 48 | [UNESCO Open Learning](https://openlearning.unesco.org/) | course | глобально; open to everyone | официальный каталог; HTML + sitemap | 200, M | ежедневно | robots отсутствует; rate limit | P0 |
| 49 | [edX search](https://www.edx.org/search) | course, career | глобально; возраст зависит от курса | MOOC-каталог; dynamic HTML + sitemap | 200, A | ежедневно | использовать только публичные метаданные | P1 |
| 50 | [Coursera courses](https://www.coursera.org/courses) | course, career | глобально; обычно 13+ по Terms | MOOC-каталог; robots root-block | 200, R | ручная/API | только официальная интеграция | D |
| 51 | [OpenLearn catalogue](https://www.open.edu/openlearn/free-courses/full-catalogue) | course | глобально; open learning | официальный каталог; запрос блокируется | 403, R | ручная | не обходить защиту | D |
| 52 | [Stepik catalogue](https://stepik.org/catalog) | course, test-prep | глобально; mixed age | course platform; dynamic HTML | 200, A | ежедневно | лицензии курсов различаются | P1 |

## Остальные категории и cross-category discovery

| № | Источник | Категории | География / возраст | Тип и пригодность | Проверка | Частота | Ограничения | Приоритет |
|---:|---|---|---|---|---|---|---|---|
| 53 | [Girls Who Code Programs](https://girlswhocode.com/programs) | bootcamp, course, mentorship | США/некоторые online; grades 3–12 | официальный каталог; HTML + sitemap | 200, A | ежедневно в окно | география программы | P1 |
| 54 | [Kode With Klossy](https://www.kodewithklossy.com/programs) | bootcamp, course | США; teens | официальный provider; robots root-block | 200, R | ручная | не ingest | D |
| 55 | [AI4ALL summer programs](https://ai-4-all.org/summer-programs/) | bootcamp, summer, science | преимущественно США; high school | официальный каталог; HTML + sitemap | 200, A | ежедневно в окно | partner-specific eligibility | P1 |
| 56 | [LaunchX Programs](https://www.launchx.com/programs) | bootcamp, startup, summer | глобально; high school | официальный provider; HTML + sitemap | 200, A | ежедневно в окно | платно/aid | P1 |
| 57 | [Harvard High School Programs](https://summer.harvard.edu/high-school-programs/) | summer, course | глобально; high school | официальный university page; HTML + sitemap | 200, A | ежедневно в окно | стоимость/visa/age | P0 |
| 58 | [Yale Young Global Scholars](https://globalscholars.yale.edu/) | summer, forum, course | глобально; 16–18 | официальный university program; HTML | 200, A | ежедневно в окно | competitive/paid, aid | P0 |
| 59 | [Stanford Pre-Collegiate programs](https://spcs.stanford.edu/programs) | summer, course, research | глобально; grades 6–12 by program | официальный каталог; HTML + sitemap | 200, A | ежедневно | eligibility per program | P0 |
| 60 | [US Exchange Program Finder](https://exchanges.state.gov/us/find-programs) | exchange, summer | глобально/US-specific; youth/adults | официальный госfinder; anti-bot 403 | 403, R | manual/API | искать официальный data access | D |
| 61 | [FLEX Global](https://www.americancouncils.org/programs/flex-global-program) | exchange, mentorship | включая Казахстан; high school | официальный program page; HTML + sitemap | 200, A | ежедневно в окно | fully funded; country criteria | P0 |
| 62 | [AFS Study Abroad](https://www.afs.org/study-abroad/) | exchange | глобально; secondary youth | официальный network; anti-bot 403 | 403, R | ручная | local AFS country source | D |
| 63 | [European Youth Portal volunteering](https://youth.europa.eu/go-abroad/volunteering_en) | volunteer, exchange | Europe/partner countries; обычно 18–30 | официальный EU portal; HTML | 200, A | 12 ч | большинство не для несовершеннолетних | P1 |
| 64 | [QazVolunteer](https://qazvolunteer.kz/) | volunteer, social | Казахстан; возраст по проекту | национальная платформа; dynamic HTML | 200, A | 3 ч | проверять child-safety/age | P0 |
| 65 | [UN Volunteers](https://app.unv.org/) | volunteer, internship | глобально; преимущественно 18+ | официальный app; dynamic HTML | 200, A | 12 ч | фильтровать несовершеннолетних | P2 |
| 66 | [Idealist Volunteer](https://www.idealist.org/en/volunteer) | volunteer, internship, social | глобально; mixed age | агрегатор; HTML + sitemap | 200, A | 12 ч | organizer verification | P1 discovery |
| 67 | [Ashoka Young Changemakers](https://www.ashoka.org/en-us/program/young-changemakers) | social, mentorship | глобально; teens/youth | официальный program page; page anti-bot | 403, A robots | ручная | не обходить WAF | D |
| 68 | [Global Changemakers](https://www.global-changemakers.net/) | social, mentorship, forum | глобально; youth, cohort-specific | официальный provider; HTML, robots root-block | 200, R | ручная | не ingest | D |
| 69 | [International School Sport Federation](https://www.isfsports.org/sports) | sport, forum | глобально; school students | официальный календарь/виды спорта; HTML | 200, A | ежедневно | обычно через school/national body | P1 |
| 70 | [Scholastic Art & Writing Awards](https://www.artandwriting.org/awards/) | creative | США/Канада/territories; grades 7–12 | официальный organizer; HTML + sitemap | 200, A | ежедневно в окно | география ограничена | P2 |
| 71 | [Bow Seat Ocean Awareness Contest](https://bowseat.org/programs/ocean-awareness-contest/) | creative, science | глобально; 11–18 | официальный конкурс; URL сейчас 404, sitemap жив | 404, A | ручная | найти актуальную canonical page | P1 gated |
| 72 | [NYT Learning Contests](https://www.nytimes.com/spotlight/learning-contests) | creative, debate | глобально/US rules; teens | publisher contest hub; root-block/403 | 403, R | ручная | не парсить NYT | D |
| 73 | [FilmFreeway Festivals](https://filmfreeway.com/festivals) | creative | глобально; mixed age | коммерческий агрегатор; anti-bot 403 | 403, A robots | ручная | discovery; verify festival legitimacy | D |
| 74 | [Forage simulations](https://www.theforage.com/simulations) | internship, career, course | глобально; обычно 13+ | официальный virtual experience catalog; HTML + sitemap | 200, A | ежедневно | simulation не реальная internship | P1 |
| 75 | [NASA STEM Gateway](https://stemgateway.nasa.gov/public/s/explore-opportunities) | internship, science, research | преимущественно US persons; middle school–college | официальный dynamic app | 200, A | ежедневно | citizenship/age hard filters | P1 |
| 76 | [CERN Beamline for Schools](https://beamlineforschools.cern/) | science, research, internship | глобально; secondary teams | официальный конкурс; HTML + sitemap | 200, A | ежедневно в окно | school team/teacher | P0 |
| 77 | [Research Girl Mentorship](https://researchgirl.org/mentorships) | mentorship, research | глобально; high school/undergrad | nonprofit program page; HTML + sitemap | 200, A | ежедневно в окно | organizer trust/manual review | P1 |
| 78 | [European Youth Forum Events](https://www.youthforum.org/events) | forum, social | Европа/online; youth | официальный network calendar; HTML + sitemap | 200, A | 12 ч | eligibility per event | P1 |
| 79 | [One Young World Scholarships](https://www.oneyoungworld.com/scholarships) | forum, mentorship, social | глобально; в основном 18+ | официальный scholarship catalog; HTML + sitemap | 200, A | ежедневно | фильтровать under-18 | P2 |
| 80 | [CareerVillage](https://www.careervillage.org/) | career, mentorship | глобально; students | nonprofit Q&A, не opportunity feed; root-block | 403, R | ручная | использовать только как справочник | D |
| 81 | [Eurodesk Opportunity Finder](https://programmes.eurodesk.eu/en) | exchange, volunteer, internship, forum | Европа/партнёры; youth | проверенный агрегатор; anti-bot 403 | 403, R | ручная/API | запросить официальный feed | D |
| 82 | [Global Youth Initiatives](https://www.globalyouthinitiatives.com/opportunities) | summer, internship, research, science | глобально; high school | агрегатор 1300+; HTML, robots отсутствует | 200, M | 12 ч | discovery; verify official page | P1 discovery |
| 83 | [Global Yuva Opportunities](https://globalyuva.org/opportunities.html) | summer, internship, course, olympiad | глобально; grades/age indexed | editorial aggregator; HTML + sitemap | 200, A | 12 ч | explicitly unaffiliated; verify source | P1 discovery |
| 84 | [SkillReFlex](https://www.skill-reflex.com/en) | internship, course, exchange, creative | глобально; youth/mixed | verified-opportunity aggregator; HTML + sitemap | 200, A | 12 ч | verify organizer and age | P1 discovery |
| 85 | [Youthlinker](https://youthlinker.com/) | internship, summer, science, forum | MENA/global; students/youth | aggregator; robots root-block | 200, R | ручная | не ingest | D |
| 86 | [Takadam](https://www.takadam.com/) | internship, course, forum, startup | глобально; youth/mixed | aggregator; HTML, robots absent | 200, M | 12 ч | some content/login; metadata only | P2 discovery |

## Точные итоги

- **86 уникальных публичных web-источников**; все 21 категории каталога имеют хотя бы один источник.
- Первые десять категорий вынесены в первые **52 строки**. Во всём реестре они покрыты так: startup 13, hackathon 9, olympiad 11, MUN 4, debate 4, robotics 6, science 17, research 13, test-prep 6, course 15. Числа пересекаются, потому что один источник может покрывать несколько категорий.
- По рекомендуемому режиму: **53** прямых P0/P1/P2 monitoring-feed, **10** discovery-feed (результат нельзя публиковать без официального первоисточника), **3** gated-источника после исправления URL/preflight/документированного доступа и **20** ручных `D`-источников. Группы взаимоисключающие и в сумме дают 86.
- Казахстан-first: Astana Hub, hackathon.kz, Daryn, myolympiad.kz, USTEM, IDP IELTS Kazakhstan, QazVolunteer и FLEX Global с Казахстаном в eligibility.
- Самые ценные discovery-каталоги официальных первоисточников: hackathon.kz, MUN.events, myMUN, Tabroom, Global Youth Initiatives, Global Yuva, SkillReFlex, Eurodesk и Takadam.

## Безопасный порядок подключения

1. Начать с P0 официальных HTML/sitemap источников и сохранять canonical URL организатора.
2. Для агрегатора создавать только discovery-кандидат; публикация возможна после повторной проверки официальной страницы, дедлайна, возраста, географии, цены и формы.
3. Перед включением каждого домена повторно получить `robots.txt` и Terms; хранить timestamp проверки и ограничивать частоту на домен.
4. Не подключать `R`, login-only или WAF-защищённые сайты через stealth/proxy. Использовать документированный API/feed или ручной discovery.
5. Первые сутки — dry-run с метриками `found / eligible_school_kz / missing_deadline / missing_application_url / duplicate / blocked_by_policy`; затем canary по одному источнику на категорию.

"""Extractor tests.

No network, no Telegram, no API key: everything here exercises the
deterministic local layer. Run with:  python -m pytest tests -q
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime, timezone
from io import StringIO

import pytest

from tgcollect.demo import SAMPLE_POSTS, run_demo
from tgcollect.config import Channel
from tgcollect.pipeline import posts_to_candidates
from tgcollect.triage_jsonl import main as triage_jsonl_main
from tgcollect.extract import (
    baseline,
    classify_kazakhstan_availability,
    classify_school_audience,
    extract_activity_tags,
    find_ages,
    find_city,
    find_deadline,
    find_dates,
    find_grades,
    find_links,
    find_price,
    guess_category,
    guess_format,
    looks_like_opportunity,
    make_title,
    reference_date,
    schema_safe_title,
    title_is_grounded,
)

POSTED = date(2026, 2, 10)


@pytest.mark.parametrize("text, expected", [
    ("Конкурс для школьников 9–11 классов", "SCHOOL"),
    ("Конкурс для школьников, студентов и аспирантов", "SCHOOL"),
    ("Олимпиада для оқушылар", "SCHOOL"),
    ("Competition for high school students", "SCHOOL"),
    ("Конкурс для участников 14–17 лет", "SCHOOL"),
    ("Стажировка только для студентов вузов", "NON_SCHOOL"),
    ("Fellowship only for university students", "NON_SCHOOL"),
    ("Стажировка для участников 21–25 лет", "NON_SCHOOL"),
    ("Стажировка для участников от 18 лет", "NON_SCHOOL"),
    ("Open call for participants ages 18+", "NON_SCHOOL"),
    ("Конкурс для участников 18+ лет", "NON_SCHOOL"),
    ("Конкурс не для школьников, открыт для всех студентов вузов", "NON_SCHOOL"),
    ("School students are not eligible for this research fellowship", "NON_SCHOOL"),
    ("Конкурс методических разработок для учителей. Материалы предназначены для школьников 5–9 классов.", "NON_SCHOOL"),
    ("Конкурс для преподавателей школ. Победители подготовят уроки для школьников.", "NON_SCHOOL"),
    ("Олимпиада для учителей и школьников 8–11 классов.", "SCHOOL"),
    (
        "Ранее Школа лидеров будущего была для старшеклассников. "
        "В новом сезоне 2026–2027 участники — студенты 1–3 курсов вузов Санкт-Петербурга.",
        "NON_SCHOOL",
    ),
    ("Открытый конкурс проектов", "UNKNOWN"),
])
def test_school_audience_triage(text, expected):
    status, evidence = classify_school_audience(text)
    assert status == expected
    assert bool(evidence) == (expected != "UNKNOWN")


def test_explicit_organizer_is_not_replaced_by_aggregator_channel():
    item = baseline(
        "Олимпиада для школьников 8–11 классов. Организатор: Freedom Bank\n"
        "Открыта регистрация, дедлайн 30 октября 2026. "
        "Подать заявку: https://example.kz/apply",
        "https://t.me/aggregator/1", "Агрегатор", "olympiad", today=date(2026, 9, 30),
    )
    assert item is not None
    assert item["organizerName"] == "Freedom Bank"
    assert item["organizerEvidence"] == "SOURCE_TEXT"
    assert item["audienceStatus"] == "SCHOOL"


def test_telegram_pipeline_keeps_explicitly_adult_only_post_with_audience_evidence():
    posts = [{
        "id": 5, "url": "https://t.me/example/5", "date": "2026-09-30T00:00:00+05:00",
        "text": "Стажировка только для студентов вузов. Открыта регистрация, дедлайн 30 октября 2026. "
                "Подать заявку: https://example.kz/apply", "media": [],
    }]
    candidates, stats = posts_to_candidates(posts, Channel("example"), "Новости")
    assert len(candidates) == 1
    assert candidates[0]["audienceStatus"] == "NON_SCHOOL"
    assert candidates[0]["audienceEvidence"] == "только для студентов вузов"
    assert candidates[0]["minimumAge"] == 18
    assert candidates[0]["tags"] == ["18+"]
    assert candidates[0]["requirements"] == ["Аудитория: только для студентов вузов"]
    assert stats["adult_audience"] == 1


@pytest.mark.parametrize("text", [
    "Выбрать страну и программу, разобраться с документами и дедлайнами непросто. "
    "Мы собрали полезный гайд и ссылки на консультации по поступлению, регистрация скоро откроется.",
    "Программа Fulbright объявила итоги, а мы обсуждаем важные дедлайны и гранты. "
    "Подписывайтесь на канал для новостей и новых конкурсов, регистрация в эфир на сайте.",
    "Jasa Opportunities Bootcamp — четыре недели, чтобы успеть подготовиться, пока дедлайны ещё открыты. "
    "Читайте нашу подборку о конкурсах и стажировках для студентов.",
])
def test_generic_deadline_or_registration_word_is_not_an_open_call(text):
    assert not looks_like_opportunity(text)


def test_historical_school_audience_does_not_override_current_university_eligibility(monkeypatch, capsys):
    text = (
        "С 2017 года программа объединяла целеустремлённых старшеклассников. "
        "С 2026–2027 учебного года программа переориентируется на более взрослую аудиторию "
        "— будущих предпринимателей, студентов вузов. "
        "Для студентов 1–3 курсе бакалавриата вузов Санкт-Петербурга."
    )
    monkeypatch.setattr(sys, "stdin", StringIO(json.dumps({"id": "school-leaders", "text": text}, ensure_ascii=False) + "\n"))
    triage_jsonl_main()
    result = json.loads(capsys.readouterr().out)
    assert result["audienceStatus"] == "NON_SCHOOL"
    assert "студентов вузов" in result["audienceEvidence"]


def test_school_promo_footer_does_not_override_adult_russia_only_eligibility(monkeypatch, capsys):
    text = (
        "Для студентов, аспирантов, молодых ученых и преподавателей из всех регионов России.\n"
        "Больше возможностей для школьников здесь: Канал в MAX https://example.org/school"
    )
    monkeypatch.setattr(sys, "stdin", StringIO(json.dumps({"id": "russia-adult", "text": text}, ensure_ascii=False) + "\n"))
    triage_jsonl_main()
    result = json.loads(capsys.readouterr().out)
    assert result["audienceStatus"] == "NON_SCHOOL"
    assert "студентов, аспирантов" in result["audienceEvidence"]


@pytest.mark.parametrize("text, expected", [
    (
        "International science competition for high school students worldwide. Applications are open.",
        "AVAILABLE",
    ),
    (
        "Summer school in London for students from Central Asia. Applications are open.",
        "AVAILABLE",
    ),
    (
        "Конкурс проводится в Париже. К участию приглашаются школьники 9–11 классов.",
        "UNKNOWN",
    ),
    (
        "Open only to residents of the United States who attend high school.",
        "UNAVAILABLE",
    ),
    (
        "Конкурс исключительно для школьников из всех регионов России.",
        "UNAVAILABLE",
    ),
    (
        "Open to students worldwide except Kazakhstan.",
        "UNAVAILABLE",
    ),
    (
        "Kazakhstan partner announcement. Open only to residents of the United States.",
        "UNAVAILABLE",
    ),
    (
        "Open only to students from Central Asia, including Kazakhstan.",
        "AVAILABLE",
    ),
])
def test_kazakhstan_availability_requires_explicit_geographic_evidence(text, expected):
    status, evidence = classify_kazakhstan_availability(text)
    assert status == expected
    assert bool(evidence) == (expected != "UNKNOWN")


def test_pipeline_keeps_accessible_international_and_foreign_venue_opportunities():
    posts = [
        {
            "id": 201,
            "url": "https://t.me/example/201",
            "date": "2026-10-20T00:00:00+05:00",
            "text": (
                "International Science Challenge for high school students worldwide. "
                "Applications are open until 30 November 2026. "
                "Apply here: https://apply.example.org/science"
            ),
            "media": [{"kind": "image", "platform_media_id": "201"}],
        },
        {
            "id": 202,
            "url": "https://t.me/example/202",
            "date": "2026-10-20T00:00:00+05:00",
            "text": (
                "Открыта регистрация на конкурс для школьников 9–11 классов. Финал пройдет в Париже. "
                "Дедлайн 30 ноября 2026. Подать заявку: https://apply.example.org/paris"
            ),
            "media": [{"kind": "image", "platform_media_id": "202"}],
        },
    ]
    candidates, stats = posts_to_candidates(posts, Channel("example"), "International Opportunities")
    assert [candidate["sourceUrl"] for candidate in candidates] == [
        "https://t.me/example/201",
        "https://t.me/example/202",
    ]
    assert stats["unavailable_to_kazakhstan"] == 0


def test_pipeline_keeps_explicit_foreign_only_restriction_with_visible_evidence():
    posts = [{
        "id": 203,
        "url": "https://t.me/example/203",
        "date": "2026-10-20T00:00:00+05:00",
        "text": (
            "Applications are open for a high school competition, only for residents of the United States. "
            "Deadline: November 30, 2026. Apply: https://apply.example.org/us-only"
        ),
        "media": [{"kind": "image", "platform_media_id": "203"}],
    }]
    candidates, stats = posts_to_candidates(posts, Channel("example"), "International Opportunities")
    assert len(candidates) == 1
    assert candidates[0]["tags"] == ["география ограничена"]
    assert candidates[0]["requirements"] == [
        "География участия: only for residents of the United States",
    ]
    assert stats["unavailable_to_kazakhstan"] == 0
    assert stats["geography_restricted"] == 1


def test_title_limit_uses_the_same_utf16_units_as_the_ingest_schema():
    title = schema_safe_title("Олимпиада " + "🏆" * 300)
    assert len(title.encode("utf-16-le")) // 2 <= 280
    item = baseline(
        "Олимпиада для школьников " + "🏆" * 300 + " Регистрация открыта, "
        "дедлайн 30 октября 2026. Подать заявку: https://example.kz/apply",
        "https://t.me/example/9", "Организатор", "olympiad", today=date(2026, 9, 30),
    )
    assert item is not None
    assert len(item["title"].encode("utf-16-le")) // 2 <= 280
    assert len(item["shortDescription"].encode("utf-16-le")) // 2 <= 450
    assert len(item["fullDescription"].encode("utf-16-le")) // 2 <= 7800


class TestDeadline:
    def test_invalid_day_without_year_does_not_stop_channel_backfill(self):
        text = "Заявки до 0 октября и до 31 апреля. Дедлайн 15 октября."
        assert find_dates(text, date(2026, 9, 30)) == [(text.index("15 октября"), date(2026, 10, 15))]

    def test_same_day_explicit_time_expires_at_the_actual_instant(self):
        text = (
            "Youth Science Olympiad applications are open for school students. "
            "Deadline: 29 September 2026 at 10:00 UTC+0. Apply now: https://example.kz/apply"
        )
        before = baseline(
            text, "https://t.me/example/91", "Organizer", "olympiad",
            today=date(2026, 9, 20), as_of=datetime(2026, 9, 29, 9, 59, tzinfo=timezone.utc),
        )
        after = baseline(
            text, "https://t.me/example/91", "Organizer", "olympiad",
            today=date(2026, 9, 20), as_of=datetime(2026, 9, 29, 10, 1, tzinfo=timezone.utc),
        )
        assert before is not None and after is not None
        assert "_expired" not in before
        assert after["_expired"] is True

    def test_kazakh_deadline_month_with_case_suffix(self):
        assert find_deadline("Өтінім қабылдау мерзімі 15 қазанға дейін", POSTED) == date(2026, 10, 15)

    def test_word_date_with_marker(self):
        assert find_deadline("Дедлайн подачи заявок: 20 марта", POSTED) == date(2026, 3, 20)

    def test_numeric_date_with_explicit_year(self):
        assert find_deadline("Приём заявок до 15.04.2026", POSTED) == date(2026, 4, 15)

    @pytest.mark.parametrize(
        "text, expected",
        [
            ("Приём заявок завершается 15 октября 2026", date(2026, 10, 15)),
            ("Подача заявок: до 15 октября 2026 включительно", date(2026, 10, 15)),
            ("Заявки принимаются по 15 октября 2026 включительно", date(2026, 10, 15)),
            ("Registration deadline: 2026-10-15", date(2026, 10, 15)),
            ("Applications close on 15-10-2026", date(2026, 10, 15)),
            ("Closing date: October 15th, 2026", date(2026, 10, 15)),
            ("Өтінімдерді қабылдау 15 қазан 2026", date(2026, 10, 15)),
        ],
    )
    def test_explicit_closing_phrases_and_formats(self, text, expected):
        assert find_deadline(text, POSTED) == expected

    def test_application_period_uses_end_not_start(self):
        assert find_deadline("Приём заявок с 01.10.2026 до 15.10.2026", POSTED) == date(2026, 10, 15)

    def test_application_period_with_start_verb_uses_closing_date(self):
        assert find_deadline(
            "II поток: прием заявок стартует 16 сентября и продлится до 6 ноября 2026 года.",
            date(2026, 9, 21),
        ) == date(2026, 11, 6)

    @pytest.mark.parametrize(
        "text",
        [
            "Регистрация: 1–15 октября 2026",
            "Регистрация открыта до 15 октября 2026",
            "Регистрация проходила с 1 по 15 октября 2026",
            "Registration period: 1–15 October 2026",
        ],
    )
    def test_registration_period_uses_the_closing_date(self, text):
        assert find_deadline(text, POSTED) == date(2026, 10, 15)

    @pytest.mark.parametrize(
        "text",
        [
            "Registration: October 1–15, 2026",
            "Registration: October 1-15",
            "Registration period runs October 1st–15th, 2026",
            "Application period: Oct 1-15, 2026",
        ],
    )
    def test_compact_english_registration_range_uses_the_end_date(self, text):
        assert find_deadline(text, POSTED) == date(2026, 10, 15)

    @pytest.mark.parametrize(
        "text",
        [
            "Conference dates: October 1–15, 2026",
            "The camp runs October 1-15, 2026",
            "Final round: October 1–15",
        ],
    )
    def test_compact_english_event_range_is_not_a_deadline(self, text):
        assert find_deadline(text, POSTED) is None

    def test_invalid_reverse_compact_registration_range_is_not_a_deadline(self):
        assert find_deadline("Registration: October 31-1, 2026", POSTED) is None

    def test_date_in_application_url_is_not_a_deadline(self):
        assert find_deadline("Дедлайн: https://example.kz/apply/2026-10-15", POSTED) is None

    def test_date_in_next_clause_is_not_a_deadline(self):
        assert find_deadline("Регистрация до конца недели; финал 15 октября 2026", POSTED) is None

    def test_generic_kazakh_application_mention_does_not_imply_deadline(self):
        assert find_deadline("Өтінім беріңіз. Финал 15 қазан 2026", POSTED) is None

    def test_english_day_month_deadline(self):
        assert find_deadline("Apply by 30 September 2026", POSTED) == date(2026, 9, 30)

    def test_english_month_day_deadline(self):
        assert find_deadline("Application deadline: September 30, 2026", POSTED) == date(2026, 9, 30)

    def test_english_abbreviated_month_deadline(self):
        assert find_deadline("Registration closes Sep 30, 2026", POSTED) == date(2026, 9, 30)

    @pytest.mark.parametrize(
        "text",
        [
            "Applications due 30 September 2026",
            "Submit by 30 September 2026",
            "Приём работ до 30 сентября 2026",
            "Құжаттарды қабылдау 30 қыркүйек 2026",
        ],
    )
    def test_additional_explicit_deadline_phrases(self, text):
        assert find_deadline(text, POSTED) == date(2026, 9, 30)

    @pytest.mark.parametrize(
        "text",
        [
            "Крайний срок подачи заявок — 30 сентября 2026",
            "Крайний срок регистрации: 30 сентября 2026",
            "Заявки принимают до 30 сентября 2026",
            "Заявки принимаем до 30 сентября 2026",
            "Подать заявку можно до 30 сентября 2026",
            "Последний день подачи заявок — 30 сентября 2026",
        ],
    )
    def test_explicit_application_closing_phrases(self, text):
        assert find_deadline(text, POSTED) == date(2026, 9, 30)

    def test_application_closing_phrase_does_not_select_a_later_event_date(self):
        assert find_deadline(
            "Заявки принимают до конца недели. Финал — 30 сентября 2026",
            POSTED,
        ) is None

    def test_explicit_utc_deadline_keeps_the_actual_instant(self):
        item = baseline(
            "International Youth Math Challenge 2026 accepts applications from high school students. "
            "Deadline: 27 September 2026, 23:59 UTC+0. Apply now: https://example.kz/apply",
            "https://t.me/example/29", "Organizer", "olympiad",
            today=date(2026, 9, 21), as_of=date(2026, 9, 28),
        )
        assert item is not None
        assert item["applicationDeadline"] == "2026-09-28T04:59:00+05:00"
        assert "_expired" not in item

    def test_explicit_utc_plus_six_deadline_converts_to_almaty(self):
        item = baseline(
            "Youth Forum registration is open for students across Central Asia. "
            "Deadline: September 30, 2026 at 17:00 UTC+6. Apply now: https://example.kz/apply",
            "https://t.me/example/30", "Organizer", "forum", today=date(2026, 9, 26),
        )
        assert item is not None
        assert item["applicationDeadline"] == "2026-09-30T16:00:00+05:00"

    def test_year_is_anchored_on_the_post_date_not_today(self):
        # Posted in February, so "20 марта" is March of the same year.
        assert find_deadline("дедлайн 20 марта", date(2026, 2, 1)) == date(2026, 3, 20)
        # Posted in December, so "20 марта" rolls into the next year.
        assert find_deadline("дедлайн 20 марта", date(2026, 12, 1)) == date(2027, 3, 20)

    def test_recently_passed_deadline_is_not_rolled_to_next_year(self):
        assert find_deadline("дедлайн 20 сентября", date(2026, 9, 22)) == date(2026, 9, 20)

    def test_english_recently_passed_deadline_is_not_rolled_forward(self):
        assert find_deadline("Deadline: September 20", date(2026, 9, 22)) == date(2026, 9, 20)

    def test_picks_the_earliest_marked_date(self):
        text = "Старт 1 сентября. Дедлайн 5 мая, финальный дедлайн 20 июня."
        assert find_deadline(text, POSTED) == date(2026, 5, 5)

    def test_event_date_is_not_a_deadline(self):
        assert find_deadline("Регистрация открыта, ждём вас 3 июня", POSTED) is None

    def test_other_sentence_date_is_not_a_deadline(self):
        assert find_deadline("Регистрация открыта. Финал 3 июня", POSTED) is None

    def test_registration_deadline_is_a_deadline(self):
        assert find_deadline("Регистрация до 3 июня. Финал 10 июня", POSTED) == date(2026, 6, 3)

    def test_no_date_means_none(self):
        assert find_deadline("Дедлайн скоро, следите за новостями", POSTED) is None

    def test_ignores_impossible_dates(self):
        assert find_deadline("версия 45.99 вышла", POSTED) is None


class TestFields:
    def test_free_beats_a_number(self):
        assert find_price("Участие бесплатное, призовой фонд 500 000 ₸") == 0

    def test_price_with_spaces(self):
        assert find_price("Стоимость: 120 000 тг") == 120000

    def test_price_with_dot_thousands_from_real_telegram_format(self):
        assert find_price("Эксклюзивная цена — всего от 35.990тг вместо 45.990") == 35990

    def test_kzt_fee_wins_over_its_foreign_currency_equivalent(self):
        assert find_price("Entry fee: 1,000 KZT / 2.10$") == 1000

    def test_price_absent(self):
        assert find_price("Подробности в описании") is None

    def test_prize_fund_is_not_a_participation_price(self):
        assert find_price("Призовой фонд 1 000 000 ₸") is None

    def test_fee_wins_over_prize_fund(self):
        assert find_price("Призовой фонд 1 000 000 ₸. Взнос за регистрацию: 15 000 KZT") == 15000

    def test_free_add_on_does_not_erase_paid_participation_fee(self):
        assert find_price("Стоимость курса: 20 000 ₸\nБесплатная консультация для всех участников") == 20000

    def test_free_scholarship_funding_does_not_prove_a_free_application(self):
        assert find_price("Free scholarship for high school students. Application fee not specified.") is None

    def test_negated_free_does_not_become_zero_price(self):
        assert find_price("Участие не бесплатное, стоимость уточняется") is None

    def test_explicitly_free_course_is_zero_price(self):
        assert find_price("Бесплатный курс для школьников. Регистрация открыта") == 0

    def test_conditional_free_vs_paid_participation_stays_unverified(self):
        assert find_price("Участие бесплатно для победителей. Взнос за участие: 20 000 ₸ для остальных") is None

    def test_foreign_currency_fee_not_guessed_as_free(self):
        assert find_price("Harvard Case Competition fee: $10 early, $15 regular. Free learning resources.") is None
        assert find_price("Free registration for finalists; entry fee $15 for other teams.") is None

    def test_multiple_fee_tiers_stay_unverified(self):
        assert find_price("Стоимость для школьников 5 000 ₸; для студентов 8 000 ₸") is None

    def test_grade_range(self):
        assert find_grades("для учеников 8–11 классов") == (8, 11)

    def test_single_grade(self):
        assert find_grades("только для 10 класса") == (10, None)

    def test_age_range(self):
        assert find_ages("Возраст участников: 14-18 лет") == (14, 18)

    @pytest.mark.parametrize(
        "text,expected",
        [
            ("Для молодых людей от 16 до 35 лет", (16, 35)),
            ("Open to students ages 13–18", (13, 18)),
            ("Open to students aged 14-19", (14, 19)),
            ("Для участников от 16 лет", (16, None)),
            ("Open to ages 16+", (16, None)),
            ("Для участников 18+ лет", (18, None)),
            ("Призовой фонд 2026 ₸", (None, None)),
        ],
    )
    def test_additional_age_phrases(self, text, expected):
        assert find_ages(text) == expected

    @pytest.mark.parametrize(
        "text,expected",
        [
            ("For students in grades 9–12", (9, 12)),
            ("Open to grade 10 students", (10, None)),
            ("Applications close October 10", (None, None)),
        ],
    )
    def test_english_grade_phrases(self, text, expected):
        assert find_grades(text) == expected

    @pytest.mark.parametrize(
        "text,expected",
        [
            ("финал пройдёт в Астане", "Астана"),
            ("приезжайте из Караганды", "Караганда"),
            ("площадка — Алматы, Технопарк", "Алматы"),
            ("проводим в интернете", None),
        ],
    )
    def test_city_handles_declensions(self, text, expected):
        assert find_city(text) == expected

    def test_prefers_a_form_link_over_the_first_link(self):
        text = "Инфо: https://example.kz/about\nРегистрация: https://forms.gle/abc"
        apply_url, urls = find_links(text)
        assert apply_url == "https://forms.gle/abc"
        assert len(urls) == 2

    def test_strips_trailing_punctuation_from_links(self):
        apply_url, urls = find_links("Подробнее тут: https://example.kz/page.")
        assert apply_url is None
        assert urls == ["https://example.kz/page"]

    def test_explicit_application_label_selects_generic_link(self):
        apply_url, _ = find_links("Подать заявку: https://example.kz/courses")
        assert apply_url == "https://example.kz/courses"

    def test_bare_www_application_link_gets_https(self):
        apply_url, urls = find_links("Подать заявку: www.example.kz/competition.")
        assert apply_url == "https://www.example.kz/competition"
        assert urls == ["https://www.example.kz/competition"]

    def test_bare_www_information_link_is_not_application(self):
        apply_url, urls = find_links("Подробнее: www.example.kz/about")
        assert apply_url is None
        assert urls == ["https://www.example.kz/about"]

    def test_www_inside_an_email_address_is_not_a_link(self):
        apply_url, urls = find_links("Вопросы направляйте на apply@www.example.kz")
        assert apply_url is None
        assert urls == []

    def test_shortlink_without_application_label_is_not_application(self):
        apply_url, urls = find_links("Подробнее: https://bit.ly/info")
        assert apply_url is None
        assert urls == ["https://bit.ly/info"]

    @pytest.mark.parametrize(
        "text",
        [
            "Опрос участников: https://forms.gle/survey",
            "Заполнить анкету обратной связи: https://forms.gle/feedback",
            "Event feedback: https://docs.google.com/forms/d/e/feedback/viewform",
        ],
    )
    def test_feedback_form_is_not_an_application_link(self, text):
        apply_url, urls = find_links(text)
        assert apply_url is None
        assert len(urls) == 1

    def test_explicit_application_link_beats_unrelated_form(self):
        apply_url, _ = find_links(
            "Опрос: https://forms.gle/survey\nПодать заявку: https://official.kz/program"
        )
        assert apply_url == "https://official.kz/program"

    @pytest.mark.parametrize(
        "text,expected",
        [
            ("Подать заявку на участие: https://forms.yandex.ru/u/example", "https://forms.yandex.ru/u/example"),
            ("Зарегистрировать команду на сайте: https://science.example.org/", "https://science.example.org/"),
        ],
    )
    def test_real_source_application_labels_are_evidence(self, text, expected):
        assert find_links(text)[0] == expected

    def test_social_link_is_not_application(self):
        apply_url, _ = find_links("Новости: https://t.me/somechannel/123")
        assert apply_url is None

    def test_labeled_social_profile_is_still_not_an_application_form(self):
        apply_url, urls = find_links(
            "Регистрация: https://www.instagram.com/awsd_debates/\n"
            "Ссылка на форму регистрации находится в профиле."
        )
        assert apply_url is None
        assert urls == ["https://www.instagram.com/awsd_debates/"]

    @pytest.mark.parametrize(
        "text,expected",
        [
            ("Хакатон по AI", "hackathon"),
            ("Республиканская олимпиада", "olympiad"),
            ("Набор волонтёров", "volunteer"),
            ("Стажировка в компании", "internship"),
            ("Летняя школа по биологии", "summer"),
            ("DAVRA Collective Art Residency 2026", "creative"),
            ("ADMITTED Free 3-Day Intensive", "course"),
            ("Harvard Student Agencies Case Competition", "startup"),
            ("PaperLab Research Assistant Positions", "research"),
            ("Халықаралық кейс байқауы", "startup"),
            ("Турнир юных физиков", "olympiad"),
            ("First Lego League", "robotics"),
            ("Предпринимательский конкурс", "startup"),
            ("Футбольный турнир", "sport"),
            ("Summer internship", "internship"),
            ("Международный Турнир естественных наук", "science"),
            ("Открыт конкурс для художников на создание росписей трамваев", "creative"),
            ("Молодёжный саммит", "forum"),
            ("Ярмарка вузов", "career"),
            ("Подготовка к SAT", "test-prep"),
        ],
    )
    def test_category_from_keywords(self, text, expected):
        assert guess_category(text)[0] == expected

    def test_unknown_category_falls_back_with_low_confidence(self):
        slug, confidence = guess_category("Просто объявление", default="forum")
        assert slug == "forum"
        assert confidence < 0.5

    @pytest.mark.parametrize(
        "text,category,tag",
        [
            ("Открыта регистрация на конкурс эссе", "creative", "эссе и письмо"),
            ("Кастинг моделей для fashion-показа", "creative", "моделинг и мода"),
            ("Вокальный конкурс молодых исполнителей", "creative", "вокал и музыка"),
            ("Открытый чемпионат по фехтованию", "sport", "фехтование"),
            ("Турнир по армрестлингу", "sport", "армрестлинг"),
            ("Streetlifting championship", "sport", "стритлифтинг"),
            ("Street workout battle", "sport", "воркаут"),
        ],
    )
    def test_niche_activity_category_and_tag(self, text, category, tag):
        assert guess_category(text)[0] == category
        assert tag in extract_activity_tags(text)

    def test_exam_tags_are_preserved_for_catalog_facts(self):
        assert extract_activity_tags("Digital SAT and IELTS Academic preparation") == ["SAT", "IELTS"]

    def test_baseline_keeps_niche_activity_tag(self):
        item = baseline(
            "Открыта регистрация на чемпионат по армрестлингу. "
            "Заявки до 20 декабря 2026: https://example.kz/apply",
            "https://t.me/sport_kz/10",
            "Sport KZ",
            "forum",
            today=date(2026, 10, 22),
        )
        assert item is not None
        assert item["categorySlug"] == "sport"
        assert "армрестлинг" in item["tags"]

    def test_online_plus_a_city_is_hybrid(self):
        assert guess_format("отбор онлайн, финал в Астане", "Астана") == "HYBRID"

    def test_online_only(self):
        assert guess_format("полностью онлайн в zoom", None) == "ONLINE"

    def test_city_of_eligible_students_does_not_imply_a_venue(self):
        assert guess_format("Онлайн конкурс для школьников Алматы", "Алматы") == "ONLINE"
        assert guess_format("Онлайн курс для школьников в Алматы", "Алматы") == "ONLINE"

    def test_city_only_without_location_context_stays_unknown(self):
        assert guess_format("Участники из Караганды могут зарегистрироваться", "Караганда") is None

    def test_unknown_mode_stays_unknown(self):
        assert guess_format("Регистрация открыта, детали скоро", None) is None

    def test_title_drops_emoji_and_hashtags(self):
        assert make_title("🏆 #конкурс Олимпиада по информатике\nПодробности ниже") == (
            "Олимпиада по информатике"
        )

    def test_prefers_specific_source_title_over_teaser(self):
        text = "🔥 Возможность недели!\nСтажировка в Freedom Bank\nПриём заявок до 20 марта"
        assert make_title(text, "internship") == "Стажировка в Freedom Bank"

    def test_named_program_beats_generic_registration_sentence(self):
        text = (
            "Alem AI Talent Lab 2026\n"
            "Открыта регистрация на образовательную программу для школьников.\n"
            "Подать заявку можно до 20 октября."
        )
        assert make_title(text, "course") == "Alem AI Talent Lab 2026"

    def test_launched_named_bootcamp_beats_explanatory_sentence(self):
        text = (
            "Многие программы уже открывают приём заявок на следующий сезон. "
            "Поэтому мы запускаем Jasa International Programs Bootcamp: 3 недели, "
            "за которые готовим CV, эссе и ответы."
        )
        assert make_title(text, "bootcamp") == "Jasa International Programs Bootcamp"

    def test_named_competition_beats_where_and_calendar_sections(self):
        text = (
            "Где: онлайн обучение и финал в Астане\n"
            "КАЛЕНДАРЬ ТУРНИРА:\n"
            "International Youth Science Challenge 2026\n"
            "Турнир для учеников 9–11 классов. Регистрация до 30 октября."
        )
        assert make_title(text, "science") == "International Youth Science Challenge 2026"

    def test_named_program_beats_generic_audience_sentence(self):
        text = (
            "Программа предназначена для школьников 9–11 классов.\n"
            "Alem AI Talent Lab 2026\n"
            "Открыта регистрация на курс, дедлайн 30 октября."
        )
        assert make_title(text, "course") == "Alem AI Talent Lab 2026"

    def test_section_heading_without_a_name_is_not_a_title(self):
        text = "КАЛЕНДАРЬ ТУРНИРА:\nТурнир по робототехнике для школьников 8–11 классов"
        assert make_title(text, "robotics") == "Турнир по робототехнике для школьников 8–11 классов"

    def test_builds_clear_title_only_from_explicit_facts(self):
        text = (
            "Открыт набор!\nFreedom Bank открывает набор на оплачиваемую стажировку "
            "для студентов. Дедлайн 20 марта."
        )
        assert make_title(text, "internship") == (
            "Freedom Bank открывает набор на оплачиваемую стажировку для студентов."
        )

    def test_generic_heading_is_replaced_with_grounded_type_and_organizer(self):
        text = "Открыт набор!\nКомпания Freedom Bank запускает новый набор. Подайте заявку до 20 марта."
        assert make_title(text, "internship") == "Стажировка в Freedom Bank"

    def test_does_not_invent_organizer_when_source_has_none(self):
        text = "Открыт набор!\nПриём заявок на стажировку для студентов до 20 марта."
        assert "Freedom" not in make_title(text, "internship")

    def test_generated_title_must_be_grounded_in_source(self):
        source = "Freedom Bank открывает стажировку для студентов"
        assert title_is_grounded("Стажировка Freedom Bank", source)
        assert not title_is_grounded("Стажировка в Halyk Bank", source)

    def test_preserves_a_long_complete_program_title_without_cutting_a_phrase(self):
        title = (
            "Astana Hub, Alem.ai Foundation и Yandex Qazaqstan открывают ML School Kazakhstan "
            "— бесплатную двухгодичную программу для подготовки специалистов по машинному обучению."
        )
        assert len(title) > 160
        assert make_title(title, "course") == title

    def test_talent_pitch_title_wins_over_olympiad_list_item(self):
        text = (
            "Школьникам предлагают показать AI-проекты компаниям и вузам\n"
            "Alem AI Talent Lab продолжает приём заявок на трек Talent Pitch в рамках AI & Digital Bridge 2026.\n"
            "🏆 результат на олимпиаде или конкурсе;\n"
            "💡 собственный проект или прототип;"
        )
        title = make_title(text, "startup")
        assert "Talent Pitch" in title
        assert not title.startswith("результат на олимпиаде")

    def test_specific_question_headline_beats_a_context_sentence(self):
        text = (
            "Бизнес-модели для эпохи ИИ: что меняется уже сегодня? 🤖\n"
            "Продукт есть – а как вокруг нее построить бизнес-модель?\n"
            "Особенно сейчас, когда очередной AI-продукт можно собрать быстрее, чем раньше."
        )
        assert make_title(text, "startup") == "Бизнес-модели для эпохи ИИ: что меняется уже сегодня?"


class TestPreFilter:
    def test_accepts_short_kazakh_announcement_with_type_action_and_link(self):
        text = "Робототехника жарысына тіркеу ашылды. Өтінім 15 қазанға дейін: https://example.kz/apply"
        assert looks_like_opportunity(text)
        item = baseline(text, "https://t.me/example/1", "Organizer", "forum", POSTED)
        assert item is not None
        assert item["categorySlug"] == "robotics"
        assert item["applicationDeadline"] == "2026-10-15T23:59:00+05:00"

    def test_rejects_a_chat_message(self):
        assert looks_like_opportunity("Всем привет! Мы вернулись 👋") is False

    def test_rejects_channel_self_promotion(self):
        assert (
            looks_like_opportunity(
                "Наш телеграм-канал вырос до 10 000 подписчиков! "
                "Спасибо, что вы с нами. Дальше — больше полезного контента."
            )
            is False
        )

    def test_keeps_linked_recognised_activity_without_application_imperative(self):
        assert looks_like_opportunity(
            "Youth Chess Tournament 2026. Dates and participation details: https://organizer.example/chess"
        ) is True

    def test_keeps_terse_media_first_open_call(self):
        text = "Открыт набор! Подробности на афише"
        assert looks_like_opportunity(text) is False
        assert looks_like_opportunity(text, has_source_media=True) is True
        item = baseline(
            text,
            "https://t.me/example/901",
            "Organizer channel",
            "course",
            POSTED,
            has_source_media=True,
        )
        assert item is not None

    def test_pipeline_keeps_terse_media_first_post_and_exact_video_descriptor(self):
        descriptor = {"kind": "VIDEO", "platform_media_id": "video-901", "message_id": 901}
        posts = [{
            "id": 901,
            "url": "https://t.me/example/901",
            "date": "2026-10-20T00:00:00+05:00",
            "edit_date": "2026-10-26T00:00:00+05:00",
            "text": "Открыт набор! Подробности на видео",
            "media": [descriptor],
        }]
        candidates, stats = posts_to_candidates(posts, Channel("example", category="course"), "Organizer channel")
        assert stats["candidates"] == 1
        assert candidates[0]["_telegramMedia"] == [descriptor]
        assert candidates[0]["sourcePublishedAt"] == "2026-10-20T00:00:00+05:00"
        assert candidates[0]["sourceEditedAt"] == "2026-10-26T00:00:00+05:00"

    def test_extracts_explicit_event_date_separately_from_registration(self):
        item = baseline(
            "Registration is open. The webinar will take place October 23, 2026. Apply now: https://example.org/apply",
            "https://t.me/example/902",
            "Organizer channel",
            "course",
            date(2026, 10, 20),
            has_source_media=True,
        )
        assert item is not None
        assert item["eventStartDate"].startswith("2026-10-23")

    @pytest.mark.parametrize("text,expected", [
        ("Leadership seminar\n📅 Date: Friday, October 23, 2026\n🔗 Register now: https://example.org/apply", "2026-10-23"),
        ("💡 HAPPENING TODAY | Leadership seminar\n📅 Friday, October 23, 2026\n🔗 Register here: https://example.org/apply", "2026-10-23"),
        ("Webinar Invitation\n🗓 Date: October 15, 2026\nRegister here: https://example.org/apply", "2026-10-15"),
        ("Entrepreneurship series\n📅 17 October 2026\nREGISTER NOW! https://example.org/apply", "2026-10-17"),
    ])
    def test_extracts_structured_schedule_dates(self, text, expected):
        item = baseline(text, "https://t.me/example/903", "Organizer", "course", date(2026, 10, 20), has_source_media=True)
        assert item is not None
        assert item["eventStartDate"].startswith(expected)

    def test_rejects_free_material_promotions(self):
        assert looks_like_opportunity(
            "Бесплатные материалы для IELTS, SAT и TOEFL. Гранты, стажировки и программы в одном канале. Ссылка: https://example.kz"
        ) is False

    @pytest.mark.parametrize(
        "text",
        [
            "В Астане состоялся крупнейший AI-хакатон. Участники представили проекты, а победители получили гранты. Подробнее: https://example.kz/news",
            "Spaceborne вышел в финал международного стартап-конкурса. Команда уже представила проект жюри. Новости: https://example.kz/news",
            "Банк запустил новый венчурный фонд для поддержки стартапов. Размер фонда составит 6 миллионов долларов. Подробнее: https://example.kz/fund",
            "Мы стали информационным партнером конференции по искусственному интеллекту. Форум пройдет осенью. Подробнее: https://example.kz/event",
        ],
    )
    def test_rejects_news_and_retrospective_posts_without_an_open_call(self, text):
        assert looks_like_opportunity(text) is False

    def test_retrospective_context_still_accepts_a_separate_open_call(self):
        assert looks_like_opportunity(
            "В прошлом году состоялся первый этап конкурса. Сейчас открыта регистрация на новый набор участников. Дедлайн 20 октября. https://example.kz/apply"
        ) is True

    def test_completed_first_stage_does_not_hide_a_current_second_stage_call(self):
        assert looks_like_opportunity(
            "Первый этап конкурса завершился, но открыта регистрация на второй этап для школьников. "
            "Подать заявку: https://example.kz/apply"
        ) is True

    @pytest.mark.parametrize(
        "text",
        [
            "В прошлом году была открыта регистрация на хакатон для школьников. "
            "Победители получили призы. Подробнее: https://example.kz/news",
            "В прошлом году состоялся конкурс. Тогда заявки принимались до 15 октября 2025. "
            "Фото: https://example.kz/news",
            "Registration was open last year for a high school competition. "
            "Read the winners story: https://example.kz/news",
        ],
    )
    def test_rejects_historical_calls_republished_as_news(self, text):
        assert looks_like_opportunity(text) is False

    @pytest.mark.parametrize(
        "text",
        [
            "Открываем набор на интенсивный курс для школьников. Оставить заявку можно по ссылке https://example.kz/courses",
            "Акселератор для женщин Центральной Азии. Подавайте заявки и заполняйте форму https://forms.gle/example",
        ],
    )
    def test_accepts_direct_open_call_wording(self, text):
        assert looks_like_opportunity(text) is True

    @pytest.mark.parametrize(
        "text",
        [
            "Open call for Academic Olympiad for high school students. Apply here: https://example.kz/olympiad",
            "Жазғы академияға қатысуға шақырамыз. Тіркеліңіз: https://example.kz/summer",
            "Открыт отбор на стажировку в Freedom Bank. Подайте заявку: https://example.kz/apply",
        ],
    )
    def test_accepts_expanded_open_call_wording(self, text):
        assert looks_like_opportunity(text) is True

    @pytest.mark.parametrize(
        "text",
        [
            "Объявляется конкурс рисунков для школьников. Работы принимаются через QR-код на афише.",
            "Стартовал конкурс исследовательских проектов. Принять участие могут школьники 8–11 классов.",
            "Жас өнертапқыштар байқауы жарияланды. Қатысу үшін афишадағы QR-кодты сканерлеңіз.",
            "Entries open for the Youth Science Competition. Submit your project using the QR code on the poster.",
        ],
    )
    def test_accepts_open_calls_when_the_application_route_is_in_source_media(self, text):
        assert looks_like_opportunity(text) is True

    @pytest.mark.parametrize(
        "text",
        [
            "Олимпиада для школьников 7–11 классов. Анкета участника: https://forms.gle/school-form",
            "Youth Robotics Challenge for high school students. Application form: https://example.org/application",
        ],
    )
    def test_accepts_concise_activity_with_evidenced_application_form(self, text):
        assert looks_like_opportunity(text) is True

    @pytest.mark.parametrize(
        "text",
        [
            "Мы подготовили гайд: как участвовать в олимпиадах и конкурсах. Скачать: https://example.org/guide",
            "Фоторепортаж: стартовал конкурс прошлого сезона, а сегодня победителям вручили награды. https://example.org/news",
            "Календарь прошедших олимпиад для школьников. Анкета участника исследования: https://example.org/survey",
        ],
    )
    def test_broader_rules_still_reject_guides_retrospectives_and_surveys(self, text):
        assert looks_like_opportunity(text) is False

    @pytest.mark.parametrize(
        "text",
        [
            "Open call for a Capture the Flag cybersecurity competition for high school students. Apply here: https://example.kz/ctf",
            "Открыта регистрация на идеатон для школьников и студентов. Подать заявку: https://example.kz/ideas",
            "Photo contest for teens: applications open until 20 October. Apply here: https://example.kz/photos",
            "Service learning opportunity for high school students. Registration open: https://example.kz/volunteer",
        ],
    )
    def test_accepts_new_specific_student_open_calls(self, text):
        assert looks_like_opportunity(text) is True

    def test_accepts_on_repeated_vocabulary(self):
        assert looks_like_opportunity(
            "Открыт набор участников на конкурс проектов. "
            "Регистрация по ссылке, заявки принимаются до конца месяца."
        )

    def test_accepts_a_single_signal_with_deadline_and_link(self):
        # The case that a plain keyword count misses.
        assert looks_like_opportunity(
            "Летняя школа по биологии при университете. Две недели лекций и "
            "лабораторных, проживание включено. Срок подачи документов — 1 июня 2026. "
            "Подробнее: https://example.kz/form"
        )


class TestBaseline:
    def test_prefers_exact_named_competition_over_promotional_call_to_action(self):
        item = baseline(
            "ОТКРЫТА РЕГИСТРАЦИЯ НА МЕЖДУНАРОДНЫЙ STARTUP COMPETITION! "
            "Тогда участвуй в LAUNCHZONE STARTUP COMPETITION и не упусти шанс. "
            "Дедлайн подачи заявок — 2 октября 2030. Подать заявку: https://example.org/apply",
            "https://t.me/example/launchzone", "Aggregator", "startup",
            today=date(2030, 9, 1),
        )
        assert item is not None
        assert item["title"] == "LAUNCHZONE STARTUP COMPETITION"

    def test_builds_clear_batch_title_from_real_course_wording(self):
        item = baseline(
            "Открываем набор в Batch 01, старт групп уже 3 октября. "
            "Это интенсивные курсы, занятия три раза в неделю. Оставить заявку: https://example.org/courses",
            "https://t.me/example/batch", "Aggregator", "bootcamp",
            today=date(2030, 9, 1),
        )
        assert item is not None
        assert item["title"] == "Интенсивные курсы — Batch 01"

    def test_unknown_price_is_omitted_instead_of_guessed(self):
        item = baseline(
            "Открыта регистрация на олимпиаду для школьников. "
            "Стоимость уточняется у организатора. Дедлайн 20 октября 2026. "
            "Подать заявку: https://example.kz/apply",
            "https://t.me/example/price", "Organizer", "olympiad",
            today=date(2026, 9, 20),
        )
        assert item is not None
        assert "price" not in item

    def test_english_only_open_call_has_a_deadline_and_expires_correctly(self):
        text = (
            "AIQYN Best Social Projects 2026 is accepting applications from social initiatives in Kazakhstan. "
            "Projects in education, ecology and inclusion can apply now. "
            "Deadline: September 30, 2026. Apply here: https://example.kz/apply"
        )
        current = baseline(text, "https://t.me/example/18", "Opportunities", "forum",
                           today=date(2026, 9, 26), as_of=date(2026, 9, 27))
        expired = baseline(text, "https://t.me/example/18", "Opportunities", "forum",
                           today=date(2026, 9, 26), as_of=date(2026, 10, 1))
        assert current is not None and expired is not None
        assert current["applicationDeadline"] == "2026-09-30T23:59:00+05:00"
        assert "_expired" not in current
        assert expired["_expired"] is True

    def test_expired_post_is_forwarded_for_existing_card_revalidation(self):
        item = baseline(
            "Открыта регистрация на олимпиаду для школьников. Дедлайн 20 сентября. "
            "Подать заявку: https://example.kz/apply",
            "https://t.me/example/17", "Organizer", "olympiad",
            today=date(2026, 9, 18), as_of=date(2026, 9, 27),
        )
        assert item is not None
        assert item["applicationDeadline"].startswith("2026-09-20")
        assert item["_expired"] is True

    def test_school_eligibility_and_bare_www_survive_baseline(self):
        item = baseline(
            "International Research Contest for students in grades 9–12, ages 14–19. "
            "Applications due 30 September 2026. Apply here: www.example.kz/apply",
            "https://t.me/example/123", "Research Club", "research",
            today=date(2026, 9, 15), as_of=date(2026, 9, 20),
        )
        assert item is not None
        assert item["applicationDeadline"] == "2026-09-30T23:59:00+05:00"
        assert item["applicationUrl"] == "https://www.example.kz/apply"
        assert (item["minimumGrade"], item["maximumGrade"]) == (9, 12)
        assert (item["minimumAge"], item["maximumAge"]) == (14, 19)

    def test_full_post_maps_to_the_ingest_schema(self):
        post = SAMPLE_POSTS[0]
        item = baseline(
            post["text"],
            post_url="https://t.me/demo/101",
            channel_title="Demo",
            default_category="forum",
            today=reference_date(post["date"]),
        )
        assert item is not None
        assert item["categorySlug"] == "olympiad"
        assert item["applicationDeadline"].startswith("2026-03-20")
        assert item["price"] == 0
        assert (item["minimumGrade"], item["maximumGrade"]) == (8, 11)
        assert item["applicationUrl"] == "https://forms.gle/example123"
        assert item["sourceUrl"] == "https://t.me/demo/101"

    def test_returns_none_for_a_non_opportunity(self):
        assert baseline("Всем привет 👋", "https://t.me/demo/1", "Demo", "forum") is None

    def test_confidence_rises_with_evidence(self):
        rich = baseline(
            "Конкурс проектов для 9-11 классов. Дедлайн 5 мая. "
            "Регистрация: https://forms.gle/x",
            "https://t.me/d/1", "D", "forum", today=POSTED,
        )
        thin = baseline(
            "Открыт набор участников, заявки принимаются, подробности позже. "
            "Пишите нам в личные сообщения, расскажем всё о программе.",
            "https://t.me/d/2", "D", "forum", today=POSTED,
        )
        assert rich and thin
        assert rich["confidence"] > thin["confidence"]

    def test_deadline_is_end_of_day_almaty(self):
        item = baseline(
            "Конкурс проектов для 9-11 классов. Дедлайн 5 мая. "
            "Регистрация: https://forms.gle/x",
            "https://t.me/d/1", "D", "forum", today=POSTED,
        )
        assert item["applicationDeadline"] == "2026-05-05T23:59:00+05:00"


class TestDemo:
    def test_four_candidates_two_rejections(self):
        results = run_demo()
        candidates = [r for r in results if "candidate" in r]
        skipped = [r for r in results if "skipped" in r]
        assert len(candidates) == 4
        assert len(skipped) == 2

    def test_every_candidate_has_the_required_ingest_fields(self):
        required = {
            "title", "shortDescription", "fullDescription", "categorySlug",
            "organizerName", "sourceUrl", "confidence",
        }
        for result in run_demo():
            if "candidate" in result:
                assert required <= set(result["candidate"])

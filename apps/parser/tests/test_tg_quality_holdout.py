from datetime import date

from tgcollect.extract import (
    classify_school_audience,
    find_deadline,
    find_links,
    find_price,
    looks_like_opportunity,
)


CASES = [
    {
        "text": "Открыта регистрация на олимпиаду для школьников 8–11 классов. Дедлайн: 15 октября 2030. Участие бесплатное. Подать заявку: https://forms.gle/school2030",
        "opportunity": True, "deadline": date(2030, 10, 15), "audience": "SCHOOL", "application": "https://forms.gle/school2030", "price": 0,
    },
    {
        "text": "Вебинар только для учителей и педагогов. Регистрация до 20 ноября 2030. Форма: https://example.org/register/teachers",
        "opportunity": True, "deadline": date(2030, 11, 20), "audience": "NON_SCHOOL", "application": "https://example.org/register/teachers", "price": None,
    },
    {
        "text": "Вчера состоялся городской хакатон для школьников. Подвели итоги и наградили победителей. Фото: https://example.org/news/results",
        "opportunity": False, "deadline": None, "audience": "SCHOOL", "application": None, "price": None,
    },
    {
        "text": "Applications are open for the Central Asia Hackathon for grades 9-11. Registration: October 1-15, 2030. Participation fee 5 000 KZT. Apply here: https://apply.example.org/application/start",
        "opportunity": True, "deadline": date(2030, 10, 15), "audience": "SCHOOL", "application": "https://apply.example.org/application/start", "price": 5000,
    },
    {
        "text": "Опрос обратной связи после курса для школьников. Пожалуйста, оцените мероприятие: https://docs.google.com/forms/d/e/survey/viewform",
        "opportunity": False, "deadline": None, "audience": "SCHOOL", "application": None, "price": None,
    },
    {
        "text": "Open call exclusively for university students. Application deadline: December 1, 2030. Apply: https://example.org/apply/university",
        "opportunity": True, "deadline": date(2030, 12, 1), "audience": "NON_SCHOOL", "application": "https://example.org/apply/university", "price": None,
    },
    {
        "text": "Открыт набор на исследовательскую программу. Заявки принимаются до 3 декабря 2030. Подать заявку: https://example.org/application/research",
        "opportunity": True, "deadline": date(2030, 12, 3), "audience": "UNKNOWN", "application": "https://example.org/application/research", "price": None,
    },
    {
        "text": "Регистрация открыта на форум для школьников. Conference dates: October 1-15, 2030. Register here: https://example.org/register/forum",
        "opportunity": True, "deadline": None, "audience": "SCHOOL", "application": "https://example.org/register/forum", "price": None,
    },
    {
        "text": "Конкурс проектов для старшеклассников. Приём заявок до 12.12.2030. Призовой фонд 1 000 000 ₸. Анкета: https://tally.so/r/school-projects",
        "opportunity": True, "deadline": date(2030, 12, 12), "audience": "SCHOOL", "application": "https://tally.so/r/school-projects", "price": None,
    },
    {
        "text": "Программа для родителей. Регистрация заканчивается 8 ноября 2030. Подать заявку: https://example.org/form/parents",
        "opportunity": True, "deadline": date(2030, 11, 8), "audience": "NON_SCHOOL", "application": "https://example.org/form/parents", "price": None,
    },
    {
        "text": "Открыта регистрация на бесплатный онлайн-курс для учащихся школ. Заявки до 10 января 2030. Ссылка: https://example.org/apply/course",
        "opportunity": True, "deadline": date(2030, 1, 10), "audience": "SCHOOL", "application": "https://example.org/apply/course", "price": 0,
    },
    {
        "text": "Летняя школа для участников 18-24 лет. Application deadline: June 5, 2030. Apply now: https://example.org/application/summer",
        "opportunity": True, "deadline": date(2030, 6, 5), "audience": "NON_SCHOOL", "application": "https://example.org/application/summer", "price": None,
    },
    {
        "text": "Открываем набор на интенсивные курсы. Эксклюзивная цена — всего от 35.990тг вместо 45.990. Оставить заявку: https://example.org/courses",
        "opportunity": True, "deadline": None, "audience": "UNKNOWN", "application": "https://example.org/courses", "price": 35990,
    },
    {
        "text": "International youth business competition for students. Entry fee: 1,000 KZT / 2.10$. Registration deadline: October 30, 2030. Apply: https://example.org/iybc/apply",
        "opportunity": True, "deadline": date(2030, 10, 30), "audience": "UNKNOWN", "application": "https://example.org/iybc/apply", "price": 1000,
    },
]


def _binary_metrics(expected: list[bool], actual: list[bool]) -> tuple[float, float]:
    true_positive = sum(want and got for want, got in zip(expected, actual, strict=True))
    false_positive = sum(not want and got for want, got in zip(expected, actual, strict=True))
    false_negative = sum(want and not got for want, got in zip(expected, actual, strict=True))
    precision = true_positive / max(1, true_positive + false_positive)
    recall = true_positive / max(1, true_positive + false_negative)
    return precision, recall


def test_locked_quality_holdout():
    opportunity_actual = [looks_like_opportunity(case["text"]) for case in CASES]
    opportunity_expected = [case["opportunity"] for case in CASES]
    precision, recall = _binary_metrics(opportunity_expected, opportunity_actual)
    assert precision >= 0.95
    assert recall >= 0.95

    fields = {
        "deadline": [find_deadline(case["text"], date(2029, 1, 1)) for case in CASES],
        "audience": [classify_school_audience(case["text"])[0] for case in CASES],
        "application": [find_links(case["text"])[0] for case in CASES],
        "price": [find_price(case["text"]) for case in CASES],
    }
    for field, actual in fields.items():
        expected = [case[field] for case in CASES]
        assert sum(want == got for want, got in zip(expected, actual, strict=True)) / len(CASES) >= 0.95, field

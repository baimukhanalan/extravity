from parser.llm_refine import refine


def base() -> dict:
    return {
        "title": "Конкурс проектов",
        "categorySlug": "olympiad",
        "minimumGrade": 9,
        "maximumGrade": 11,
        "confidence": 0.6,
    }


def test_model_does_not_replace_literal_grades():
    item = refine(base(), "website text", llm={"min_grade": 1, "max_grade": 4})
    assert (item["minimumGrade"], item["maximumGrade"]) == (9, 11)


def test_model_can_fill_missing_price_for_permitted_source():
    item = refine(base(), "website text", llm={"price_kzt": 5000})
    assert item["price"] == 5000


def test_model_rejection_is_explicit():
    item = refine(base(), "website text", llm={"is_opportunity": False})
    assert item["_rejected_by_llm"] is True


def test_model_title_must_be_grounded_in_source_text():
    item = refine(
        base(),
        "Freedom Bank открывает стажировку для студентов",
        llm={"title": "Стажировка в Halyk Bank"},
    )
    assert item["title"] == "Конкурс проектов"


def test_model_can_use_a_precise_grounded_title():
    item = refine(
        base(),
        "Freedom Bank открывает стажировку для студентов",
        llm={"title": "Стажировка Freedom Bank"},
    )
    assert item["title"] == "Стажировка Freedom Bank"

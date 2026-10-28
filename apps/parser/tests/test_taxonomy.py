from parser.normalize import guess_category as web_category
from tgcollect.extract import guess_category as social_category


def test_social_and_web_share_multilingual_categories():
    examples = {
        "Жазғы мектепке өтінім қабылдау басталды": "summer",
        "Пікірсайыс турниріне тіркеу ашылды": "debate",
        "Social impact fellowship applications open": "social",
        "Freedom Bank тағылымдамасына өтінім беріңіз": "internship",
        "Ғылыми жоба байқауына тіркеліңіз": "science",
        "Шеберлік сабағына тіркелу ашық": "course",
    }
    for text, expected in examples.items():
        assert social_category(text)[0] == expected
        assert web_category(text, "forum")[0] == expected


def test_generic_art_or_program_words_do_not_force_category():
    for text in ("Smart city grant", "New program launch", "Annual report"):
        assert social_category(text)[0] == "forum"
        assert web_category(text, "forum")[0] == "forum"


def test_expanded_student_opportunity_vocabulary_is_shared():
    examples = {
        "International Youth Math Challenge 2026 — applications open": "olympiad",
        "Lumiere Research Scholar Program — apply now": "research",
        "Talk Talk Korea — культурный конкурс для школьников": "creative",
        "Youth exchange program — applications open": "exchange",
        "Mentoring program for high school students": "mentorship",
        "Подготовка к поступлению за рубеж — бесплатный вебинар": "career",
        "Creative coding camp for teens": "bootcamp",
        "AIQYN Best Social Projects — конкурс социальных проектов": "social",
    }
    for text, expected in examples.items():
        assert social_category(text)[0] == expected
        assert web_category(text, "forum")[0] == expected


def test_headline_category_wins_over_incidental_body_mentions():
    examples = {
        "Talent Pitch для школьников. Результат на олимпиаде не обязателен.": "startup",
        "AIQYN Best Social Projects. Model UN участники тоже могут смотреть.": "social",
        "Стажировка в Freedom Bank. На курсе также изучают стартапы.": "internship",
    }
    for text, expected in examples.items():
        assert social_category(text)[0] == expected
        assert web_category(text, "forum")[0] == expected


def test_expanded_student_terms_across_three_languages():
    examples = {
        "Academic Olympiad for high school students": "olympiad",
        "Business plan competition for teens": "startup",
        "Youth exchange scholarship applications": "exchange",
        "Шетелге оқуға түсу бойынша кездесу": "career",
        "Пікірталас турниріне тіркеу": "debate",
        "Конкурс эссе для школьников": "creative",
        "Жазғы академияға өтінім": "summer",
        "Роботтар жарысына тіркеу": "robotics",
    }
    for text, expected in examples.items():
        assert social_category(text)[0] == expected
        assert web_category(text, "forum")[0] == expected


def test_keyword_must_begin_at_a_word_boundary():
    for text in ("recourse planning", "poststartup market report", "биохакатонный обзор"):
        assert social_category(text)[0] == "forum"
        assert web_category(text, "forum")[0] == "forum"


def test_additional_student_opportunity_terms_across_sources():
    examples = {
        "Datathon for high school students — registration open": "hackathon",
        "Дататон для школьников — регистрация открыта": "hackathon",
        "Математический турнир для школьников": "olympiad",
        "Конкурс сочинений для школьников": "creative",
        "Эссе байқауы: оқушылар үшін тіркеу ашылды": "creative",
        "International scholarship for high school graduates": "career",
        "Грант на обучение за рубежом для выпускников": "career",
        "Оқу грантына өтінім қабылдау басталды": "career",
    }
    for text, expected in examples.items():
        assert social_category(text)[0] == expected
        assert web_category(text, "forum")[0] == expected


def test_new_student_opportunity_vocabulary_across_sources():
    examples = {
        "Ideathon for teens": "hackathon",
        "Capture the Flag competition": "hackathon",
        "Ораторский конкурс для школьников": "debate",
        "Business case competition for teens": "startup",
        "Научная стажировка для школьников": "research",
        "Конкурс научных проектов": "science",
        "Summer programme for pupils": "summer",
        "Academic mobility for students": "exchange",
        "Service learning opportunity": "volunteer",
        "Photo contest for teens": "creative",
        "Bursary for high school graduates": "career",
        "Training program in Python": "course",
    }
    for text, expected in examples.items():
        assert social_category(text)[0] == expected
        assert web_category(text, "forum")[0] == expected


def test_visual_science_chess_and_career_terms_across_sources():
    examples = {
        "Конкурс по рисованию для школьников": "creative",
        "Қолөнер байқауы: өтінім қабылдау": "creative",
        "Шахматный турнир для школьников": "sport",
        "STEM competition for teens": "science",
        "University open day for applicants": "career",
        "Apprenticeship program for graduates": "internship",
        "IELTS preparation workshop": "test-prep",
    }
    for text, expected in examples.items():
        assert social_category(text)[0] == expected
        assert web_category(text, "forum")[0] == expected


def test_sat_ielts_and_toefl_have_a_dedicated_category():
    examples = (
        "Digital SAT registration for high school students",
        "IELTS Academic preparation cohort",
        "TOEFL iBT test registration",
    )
    for text in examples:
        assert social_category(text)[0] == "test-prep"
        assert web_category(text, "forum")[0] == "test-prep"


def test_sat_acronym_does_not_match_saturday():
    assert social_category("Saturday workshop for students")[0] != "test-prep"
    assert web_category("Saturday workshop for students", "forum")[0] != "test-prep"

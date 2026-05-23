from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "cv.pdf"
PROFILE = ROOT / "assets" / "img" / "cv-photo.png"

PAGE_W, PAGE_H = fitz.paper_size("letter")
MARGIN_X = 54
MARGIN_TOP = 48
MARGIN_BOTTOM = 48
CONTENT_W = PAGE_W - (MARGIN_X * 2)
DATE_W = 96
GAP = 14
TEXT_X = MARGIN_X + DATE_W + GAP
TEXT_W = CONTENT_W - DATE_W - GAP

TEXT = (0.11, 0.16, 0.23)
MUTED = (0.37, 0.42, 0.48)
LINE = (0.82, 0.85, 0.89)
ACCENT = (0.11, 0.37, 0.54)


def wrap_lines(text, width, fontsize=9.8, fontname="helv"):
    if not text:
        return [""]
    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if fitz.get_text_length(candidate, fontname=fontname, fontsize=fontsize) <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def textbox_height(text, width, fontsize=9.8, fontname="helv", lineheight=1.25):
    return max(1, len(wrap_lines(text, width, fontsize, fontname))) * fontsize * lineheight


def ensure_page(doc, page, y, needed):
    if y + needed <= PAGE_H - MARGIN_BOTTOM:
        return page, y
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    return page, MARGIN_TOP


def draw_wrapped(page, text, x, y, w, fontsize=9.8, color=TEXT, fontname="helv", lineheight=1.25):
    line_step = fontsize * lineheight
    for line in wrap_lines(text, w, fontsize, fontname):
        page.insert_text((x, y), line, fontsize=fontsize, fontname=fontname, color=color)
        y += line_step
    return y


def section(doc, page, y, title):
    page, y = ensure_page(doc, page, y, 34)
    page.insert_text((MARGIN_X, y), title.upper(), fontsize=10.5, fontname="helv", color=TEXT)
    y += 6
    page.draw_line((MARGIN_X, y), (MARGIN_X + CONTENT_W, y), color=LINE, width=0.8)
    return page, y + 12


def item(doc, page, y, date, title, body, meta=None):
    body_h = textbox_height(body, TEXT_W, 9.4)
    meta_h = textbox_height(meta, TEXT_W, 9.0) if meta else 0
    needed = max(28, body_h + meta_h + 18)
    page, y = ensure_page(doc, page, y, needed)
    page.insert_text((MARGIN_X, y), date, fontsize=8.8, fontname="helv", color=MUTED)
    page.insert_text((TEXT_X, y), title, fontsize=9.8, fontname="helv", color=TEXT)
    y_body = y + 12
    y_body = draw_wrapped(page, body, TEXT_X, y_body, TEXT_W, fontsize=9.2, color=TEXT)
    if meta:
        y_body = draw_wrapped(page, meta, TEXT_X, y_body + 1, TEXT_W, fontsize=8.8, color=MUTED)
    return page, y_body + 8


def paper(doc, page, y, venue, title, authors, summary):
    needed = 16 + textbox_height(title, CONTENT_W, 9.7, "helv") + textbox_height(authors, CONTENT_W, 9.1) + textbox_height(summary, CONTENT_W, 9.0) + 12
    page, y = ensure_page(doc, page, y, needed)
    page.insert_text((MARGIN_X, y), venue, fontsize=8.7, fontname="helv", color=MUTED)
    y += 11
    y = draw_wrapped(page, title, MARGIN_X, y, CONTENT_W, fontsize=9.7, color=TEXT, fontname="helv")
    y = draw_wrapped(page, authors, MARGIN_X, y + 1, CONTENT_W, fontsize=9.1, color=TEXT)
    y = draw_wrapped(page, summary, MARGIN_X, y + 1, CONTENT_W, fontsize=9.0, color=(0.22, 0.25, 0.31))
    return page, y + 8


def make_pdf():
    doc = fitz.open()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    y = MARGIN_TOP

    photo_size = 76
    photo_rect = fitz.Rect(MARGIN_X + CONTENT_W - photo_size, y - 7, MARGIN_X + CONTENT_W, y - 7 + photo_size)
    if PROFILE.exists():
        page.insert_image(photo_rect, filename=str(PROFILE), keep_proportion=True)
        page.draw_rect(photo_rect, color=LINE, width=0.8)

    page.insert_text((MARGIN_X, y), "Jongwon Lim", fontsize=25, fontname="helv", color=TEXT)
    y += 21
    page.insert_text(
        (MARGIN_X, y),
        "Ph.D. Student, Graduate School of Data Science, Seoul National University",
        fontsize=10.5,
        fontname="helv",
        color=MUTED,
    )
    y += 18
    contact = "elijah0430@snu.ac.kr"
    page.insert_text((MARGIN_X, y), contact, fontsize=8.8, fontname="helv", color=ACCENT)
    y += 11
    y = max(y, photo_rect.y1 + 12)
    page.draw_line((MARGIN_X, y), (MARGIN_X + CONTENT_W, y), color=LINE, width=0.8)
    y += 18

    page, y = section(doc, page, y, "Research Interests")
    y = draw_wrapped(
        page,
        "I am interested in developing methods for understanding the internal mechanisms of language models, and using those insights to improve practical NLP and LLM applications.",
        MARGIN_X,
        y,
        CONTENT_W,
        fontsize=9.4,
    ) + 8

    page, y = section(doc, page, y, "Education")
    page, y = item(
        doc,
        page,
        y,
        "2025 - Present",
        "Seoul National University",
        "Ph.D. in Data Science, Graduate School of Data Science.",
        "Advisor: Prof. Yohan Jo, HOLI Lab.",
    )
    page, y = item(
        doc,
        page,
        y,
        "2019 - 2025",
        "Seoul National University",
        "B.A. in Linguistics and Data Science for Humanities.",
    )

    page, y = section(doc, page, y, "Publications")
    page, y = paper(
        doc,
        page,
        y,
        "arXiv preprint, 2026",
        "Your Language Model is Its Own Critic: Reinforcement Learning with Value Estimation from Actor's Internal States",
        "Yunho Choi*, Jongwon Lim*, Woojin Ahn, Minjae Oh, Jeonghoon Shim, Yohan Jo",
        "POISE estimates RLVR baselines from the actor's internal hidden states and entropy statistics, reducing rollout overhead while matching DAPO-level performance.",
    )
    page, y = paper(
        doc,
        page,
        y,
        "ICML 2026 Regular Paper; Mechanistic Interpretability Workshop @ NeurIPS 2025",
        "Dual Mechanisms of Value Expression: Intrinsic vs. Prompted Values in Large Language Models",
        "Jongwook Han*, Jongwon Lim*, Injin Kong, Yohan Jo",
        "Mechanistic analysis of how language models internally represent and express values under intrinsic and prompted settings.",
    )
    page, y = paper(
        doc,
        page,
        y,
        "ACL Findings 2026",
        "Learning to Retrieve User History and Generate User Profiles for Personalized Persuasiveness Prediction",
        "Sejun Park, Yoonah Park, Jongwon Lim, Yohan Jo",
        "Context-aware user profiling framework for retrieving persuasion-relevant history and generating user profiles for persuasiveness prediction.",
    )
    page, y = paper(
        doc,
        page,
        y,
        "FEVER Workshop @ EMNLP 2024",
        "DAHL: Domain-specific Automated Hallucination Evaluation of Long-Form Text through a Benchmark Dataset in Biomedicine",
        "Jean Seo, Jongwon Lim, Dongjun Jang, Hyopil Shin",
        "Biomedical benchmark and automated evaluation pipeline for factuality assessment in long-form LLM outputs.",
    )
    y = draw_wrapped(page, "* Equal contribution", MARGIN_X, y, CONTENT_W, fontsize=8.8, color=MUTED) + 7

    page, y = section(doc, page, y, "Research Experience")
    page, y = item(
        doc,
        page,
        y,
        "Oct 2023 - Sep 2024",
        "Research Intern, CL_NLP Lab, Seoul National University",
        "Worked on language model training and evaluation, retrieval-augmented generation, experiments, analysis, and academic writing.",
    )
    page, y = item(
        doc,
        page,
        y,
        "May 2024 - Dec 2024",
        "Head Researcher, SNU Faculty of Liberal Education",
        "Led work on a benchmark dataset for evaluating morphological capabilities of large language models.",
    )
    page, y = item(
        doc,
        page,
        y,
        "Jan 2024 - Mar 2024",
        "Kaggle Silver Medalist, LLM - Detect AI-generated Text",
        "Built ensemble systems for detecting AI-generated text.",
    )

    page, y = section(doc, page, y, "Teaching and Service")
    page, y = item(
        doc,
        page,
        y,
        "Spring 2026",
        "Teaching Assistant, Large Language Models and Conversational AI",
        "Seoul National University.",
    )
    page, y = item(
        doc,
        page,
        y,
        "2026",
        "Mentor, 3rd LG AI Youth Camp",
        "Mentored student participants on AI projects and research-oriented problem solving.",
    )
    page, y = item(
        doc,
        page,
        y,
        "2026",
        "Reviewer, ICML 2026 Workshops",
        "Pluralistic Alignment Workshop @ ICML 2026; Mechanistic Interpretability Workshop @ ICML 2026; 3rd AI for Math Workshop @ ICML 2026.",
    )

    page, y = section(doc, page, y, "Awards and Other Experience")
    page, y = item(
        doc,
        page,
        y,
        "Sep 2025 - Present",
        "Research Scholarship",
        "National Research Foundation of Korea (NRF).",
    )
    page, y = item(
        doc,
        page,
        y,
        "2024",
        "Outstanding Bachelor's Thesis",
        "Evaluating the Understanding of Blend Morphology in Large Language Models.",
    )
    page, y = item(
        doc,
        page,
        y,
        "Apr 2021 - Sep 2022",
        "Military Service, Republic of Korea Army",
        "Instructor for armored vehicle operation at the Republic of Korea Army Armor School.",
    )

    page, y = ensure_page(doc, page, y, 22)
    page.insert_text((MARGIN_X + CONTENT_W - 96, PAGE_H - 34), "Last updated: May 2026", fontsize=8.5, fontname="helv", color=MUTED)

    doc.save(OUT, deflate=True, garbage=4)
    doc.close()


if __name__ == "__main__":
    make_pdf()

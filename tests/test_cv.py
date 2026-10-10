import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from bs4 import BeautifulSoup
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("cv_generator", ROOT / "scripts/generate_cv_pdf.py")
cv = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cv)

# Deliberately small, fixed fixtures: CI must not depend on today's publication
# count, appointment titles, or dates. Real source parity is checked separately.
HOME = """<!doctype html><html><head>
<link rel="canonical" href="https://example.com/"></head><body><main>
<section id="home"><img class="portrait" src="assets/img/profile.jpg?v=2">
<h1>Test Researcher</h1><p class="kicker">Ph.D. Student</p>
<p class="affiliation">Test University</p><p class="bio">Research interests.</p>
<p class="advisor"><a href="https://yohanjo.github.io/">Advisor</a></p>
<div class="link-row"><a href="cv.pdf">CV</a></div></section>
<section class="section" id="news"><h2>News</h2><article class="entry">
<time>2026</time><h3>Paper accepted to NeurIPS 2026</h3></article></section>
<section class="section" id="education"><h2>Education</h2><article class="entry">
<time>2025 - Present</time><h3>Test University</h3>
<p>Advised by <a href="https://yohanjo.github.io/">Advisor</a>.</p></article></section>
<section class="section" id="awards"><h2>Awards</h2><article class="entry">
<time>2025.09 - 2026.08</time><h3>Research Scholarship</h3><p>Foundation</p></article></section>
<section class="section" id="teaching"><h2>Teaching</h2><article class="entry">
<time>Spring 2026</time><h3>Teaching Assistant</h3><p>Test course</p></article></section>
<section class="section" id="services"><h2>Services</h2><article class="entry">
<time>2026</time><h3>Reviewer</h3><ul>
<li>Workshop A <span>· also emergency reviewer</span></li>
<li>Workshop B <span>· also emergency reviewer</span></li></ul></article></section>
<section class="section" id="experience"><h2>Experience</h2><article class="entry">
<time>2022</time><h3>Military Service</h3><p>Republic of Korea Army</p></article></section>
<section class="section" id="selected-publications" data-cv-exclude><h2>Selected Publications</h2>
<ol class="paper-list"><li><article class="paper" id="accepted"></article></li>
<li><article class="paper" id="workshop"></article></li>
<li><article class="paper" id="preprint"></article></li>
<li><article class="paper" id="joint"></article></li></ol></section>
    <section class="section" id="contact"><a href="mailto:test@example.com">test@example.com</a></section>
</main></body></html>"""
RESEARCH = """<!doctype html><html><body>
<section id="publications"><h2>Publications</h2><div class="section-body">
<article class="paper" id="accepted"><p class="venue">NeurIPS 2026</p><h3>Accepted paper</h3>
<p class="authors">Author A*, <strong>Test Researcher*</strong></p>
<p class="summary">An accepted paper.</p><div class="paper-links">
<a href="https://example.com/paper">PDF</a></div></article>
<article class="paper" id="workshop"><p class="venue">Workshop 2026</p><h3>Workshop paper</h3>
<p class="authors"><strong>Test Researcher</strong>, Author A</p></article></div></section>
<section id="preprints"><h2>Preprints</h2><div class="section-body">
<article class="paper" id="preprint"><p class="venue">Preprint, 2026</p><h3>New preprint</h3>
<p class="authors">Author A*, <strong>Test Researcher*</strong></p></article>
<article class="paper" id="joint"><p class="venue">Preprint, 2026</p><h3>Joint first authors</h3>
<p class="authors">Author A*, Author B*, <strong>Test Researcher*</strong>, Advisor</p>
</article></div></section></body></html>"""


class CVTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for source in ("scripts/generate_cv_pdf.py", "scripts/cv.css", "scripts/requirements-cv.txt"):
            target = self.root / source
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / source, target)
        self.root.joinpath("index.html").write_text(HOME, encoding="utf-8")
        self.root.joinpath("research.html").write_text(RESEARCH, encoding="utf-8")
        self.skills = [
            {"label": "Mathematics", "text": "Linear algebra, optimization, calculus"},
            {"label": "Programming", "text": "Python, C/C++"},
            {"label": "Languages", "text": "Test language (native)"},
        ]
        self.root.joinpath("scripts/cv-only.json").write_text(
            json.dumps({"skills": self.skills}), encoding="utf-8")

    def edit(self, filename, old, new):
        path = self.root / filename
        source = path.read_text(encoding="utf-8")
        self.assertIn(old, source)
        path.write_text(source.replace(old, new, 1), encoding="utf-8")

    def text(self):
        return " ".join(" ".join(page.extract_text().split()) for page in PdfReader(self.root / "cv.pdf").pages)

    def select_papers(self, ids):
        path = self.root / "index.html"
        home = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
        listing = home.select_one("#selected-publications .paper-list")
        listing.clear()
        for paper_id in ids:
            listing.append(BeautifulSoup(
                f'<li><article class="paper" id="{paper_id}"></article></li>', "html.parser"))
        path.write_text(str(home), encoding="utf-8")

    def test_cv_only_skills_render_without_changing_homepage(self):
        before = (self.root / "index.html").read_bytes()
        model = cv.generate(self.root)
        rendered = BeautifulSoup((self.root / "cv.html").read_text(encoding="utf-8"), "html.parser")
        section = rendered.select_one("#skills")
        self.assertEqual(section.h2.text, "Skills & Competencies")
        self.assertEqual(rendered.select("main > section")[-1], section)
        self.assertEqual(model["skills"], self.skills)
        self.assertEqual(len(section.select("li")), len(self.skills))
        for skill in self.skills:
            content = f'{skill["label"]}: {skill["text"]}'
            self.assertIn(content, section.get_text(" ", strip=True))
            self.assertIn(content, self.text())
        self.assertEqual(before, (self.root / "index.html").read_bytes())
        self.assertNotIn("Skills & Competencies", before.decode())

    def test_skill_changes_refresh_both_outputs(self):
        cv.generate(self.root, today="2026-10-03")
        before = BeautifulSoup((self.root / "cv.html").read_text(encoding="utf-8"), "html.parser")
        self.edit("scripts/cv-only.json", "Python, C/C++", "Python, C/C++, R")
        cv.generate(self.root, today="2026-10-11")
        after = BeautifulSoup((self.root / "cv.html").read_text(encoding="utf-8"), "html.parser")
        self.assertNotEqual(before.select_one('[name="cv-source-sha256"]')["content"],
                            after.select_one('[name="cv-source-sha256"]')["content"])
        self.assertEqual(after.select_one('[name="cv-updated"]')["content"], "2026-10-11")
        self.assertIn("Python, C/C++, R", after.select_one("#skills").get_text())
        self.assertIn("Python, C/C++, R", self.text())

    def test_invalid_cv_only_skills_preserve_existing_outputs(self):
        cv.generate(self.root)
        before = [(self.root / f).read_bytes() for f in ("cv.html", "cv.pdf")]
        for skills in (None, [], "Python", [{}], [{"label": "Programming", "text": " "}], [7]):
            with self.subTest(skills=skills):
                self.root.joinpath("scripts/cv-only.json").write_text(
                    json.dumps({"skills": skills}), encoding="utf-8")
                with self.assertRaises(ValueError):
                    cv.generate(self.root)
                self.assertEqual(before, [(self.root / f).read_bytes() for f in ("cv.html", "cv.pdf")])

    def test_all_current_content_matches_source(self):
        model = cv.generate(self.root, today="2026-10-03")
        rendered = BeautifulSoup((self.root / "cv.html").read_text(encoding="utf-8"), "html.parser")
        pdf = self.text()
        self.assertEqual(len(rendered.select(".paper")), 4)
        for section in model["sections"]:
            for item in section["items"]:
                self.assertIn(item["title"], pdf)
        self.assertEqual([s["title"] for s in model["sections"]][:3],
                         ["Education", "Awards", "Selected Publications"])
        self.assertEqual(model["sections"][-1]["title"], "Experience")
        self.assertIn("NeurIPS 2026", rendered.select_one("#selected-publications .venue").text)
        self.assertIn("2025.09 - 2026.08", pdf)
        self.assertIn("Author A*, Author B*, Test Researcher*, Advisor", pdf)
        self.assertIn("Author A*, Test Researcher*", pdf)
        self.assertEqual(pdf.count("also emergency reviewer"), 2)
        self.assertNotIn("Reviewed 2 submissions", pdf)
        self.assertNotIn("Paper accepted to", pdf)
        links = [a.get_object().get("/A", {}).get("/URI", "")
                 for p in PdfReader(self.root / "cv.pdf").pages for a in p.get("/Annots", [])]
        self.assertIn("https://example.com/paper", links)

    def test_live_homepage_parity_without_hardcoded_counts(self):
        output = self.root / "live-output"
        model = cv.generate(ROOT, output_dir=output)
        self.assertEqual([s["id"] for s in model["sections"] if s["kind"] == "papers"],
                         ["selected-publications"])
        pdf = " ".join(" ".join(p.extract_text().split()) for p in PdfReader(output / "cv.pdf").pages)
        generated = BeautifulSoup((output / "cv.html").read_text(encoding="utf-8"), "html.parser")
        self.assertEqual(generated.select_one("#experience h2").get_text(strip=True), "Experiences")
        self.assertIn("EXPERIENCES", pdf)
        self.assertIn("AI at Work", pdf)
        self.assertNotIn("Data Science Seminar", pdf)
        self.assertNotIn("Data Science Seminar", generated.get_text())
        self.assertEqual(model["skills"], [
            {"label": "Mathematics", "text": "Linear algebra, optimization, calculus"},
            {"label": "Programming", "text": "Python, C/C++"},
            {"label": "Languages", "text": "Korean (native), English (fluent, TOEIC 990)"},
        ])
        for skill in model["skills"]:
            self.assertIn(f'{skill["label"]}: {skill["text"]}', pdf)
            self.assertIn(f'{skill["label"]}: {skill["text"]}',
                          generated.select_one("#skills").get_text(" ", strip=True))
        source = BeautifulSoup((ROOT / "research.html").read_text(encoding="utf-8"), "html.parser")
        home = BeautifulSoup((ROOT / "index.html").read_text(encoding="utf-8"), "html.parser")
        experience_titles = [" ".join(title.get_text().split())
                             for title in home.select("#experience .entry h3")]
        self.assertEqual([" ".join(title.get_text().split())
                          for title in generated.select("#experience h3")], experience_titles)
        self.assertEqual([pdf.index(title) for title in experience_titles],
                         sorted(pdf.index(title) for title in experience_titles))
        for removed in ("Head Researcher, SNU Faculty of Liberal Education",
                        "Benchmark dataset for evaluating morphological capabilities"):
            self.assertNotIn(removed, generated.get_text())
            self.assertNotIn(removed, pdf)
        selected = home.select("#selected-publications .paper-list > li > article.paper")
        self.assertEqual(len(generated.select(".paper")), len(selected))
        self.assertIsNone(generated.select_one("#publications, #preprints"))
        papers = [paper for section in model["sections"] if section["kind"] == "papers"
                  for paper in section["items"]]
        self.assertEqual([p["source_id"] for p in papers], [p["id"] for p in selected])
        for omitted in source.select("article.paper"):
            if omitted["id"] not in {p["id"] for p in selected}:
                self.assertNotIn(omitted.h3.get_text(), pdf)
                self.assertNotIn(omitted.h3.get_text(), generated.get_text())
        self.assertEqual([p["number"] for p in papers], list(range(1, len(papers) + 1)))
        self.assertEqual([n.text for n in generated.select(".paper-number")],
                         [f'[{p["number"]}]' for p in papers])
        for reference in generated.select(".research-directions a"):
            matches = [p for p in papers if reference["href"] in {link["url"] for link in p["links"]}]
            self.assertEqual(len(matches), 1)
            self.assertEqual(reference.text, f'[{matches[0]["number"]}]')
        for paper in papers:
            self.assertIn(f'[{paper["number"]}] {paper["title"]}', pdf)
        for direction in model["directions"]:
            for question in direction["questions"]:
                self.assertIn(BeautifulSoup(question, "html.parser").get_text(), pdf)
        pdf_links = {a.get_object().get("/A", {}).get("/URI", "")
                     for page in PdfReader(output / "cv.pdf").pages for a in page.get("/Annots", [])}
        html_links = {a["href"] for a in generated.select("a[href]")}
        self.assertEqual(pdf_links, html_links)
        for contact in model["contacts"]:
            self.assertIn(contact["url"], pdf_links)
        self.assertEqual(len(model["contacts"]), 1)
        self.assertEqual(len(generated.select("header .contact")), 1)
        self.assertEqual([a["href"] for a in generated.select("header a")],
                         ["mailto:elijah0430@snu.ac.kr"])
        self.assertNotIn("https://www.semanticscholar.org/author/Jongwon-Lim/2382941030", pdf_links)
        self.assertNotIn("elijah0430.github.io", generated.header.get_text())
        venues = [paper.select_one(".venue").get_text(" ", strip=True) for paper in generated.select(".paper")]
        self.assertIn("NeurIPS 2026 Poster", venues)
        self.assertIn("ICML 2026 Regular", venues)
        self.assertNotIn("Pre-to-Post Workshop @ NeurIPS 2026", venues)
        self.assertNotIn("Mech Interp Workshop @ NeurIPS 2025", venues)
        self.assertEqual(venues, [cv.plain(p.select_one(".venue")) for p in selected])
        for section in model["sections"]:
            for item in section["items"]:
                self.assertIn(item["title"], pdf)
                if section["kind"] == "papers":
                    authors = BeautifulSoup(item["authors"], "html.parser").get_text()
                    self.assertIn(authors, pdf)
                    self.assertIn(item["venue"], pdf)
                    for link in item["links"]:
                        self.assertIn(link["url"], pdf_links)
                else:
                    self.assertIn(item["date"], pdf)
                    for paragraph in item["paragraphs"]:
                        self.assertIn(BeautifulSoup(paragraph, "html.parser").get_text(), pdf)
                    for bullet in item["bullets"]:
                        self.assertIn(BeautifulSoup(bullet, "html.parser").get_text(), pdf)

    def test_header_keeps_affiliation_and_email_without_profile_links(self):
        self.edit("index.html", '<div class="link-row"><a href="cv.pdf">CV</a></div>',
                  '<div class="link-row"><a href="cv.pdf">CV</a>'
                  '<a href="https://example.com/scholar">Google Scholar</a>'
                  '<a href="https://example.com/semantic">Semantic Scholar</a>'
                  '<a href="https://example.com/linkedin">LinkedIn</a>'
                  '<a href="https://example.com/lab">Lab Page</a></div>')
        model = cv.generate(self.root, today="2026-10-03")
        self.assertEqual(model["contacts"], [{"label": "test@example.com", "url": "mailto:test@example.com"}])
        rendered = BeautifulSoup((self.root / "cv.html").read_text(encoding="utf-8"), "html.parser")
        self.assertEqual(rendered.header.select_one(".subtitle").text, "Ph.D. Student, Test University")
        self.assertEqual([p.get_text() for p in rendered.header.select(".contact")], ["test@example.com"])
        pdf = PdfReader(self.root / "cv.pdf")
        header_text = pdf.pages[0].extract_text().split("RESEARCH INTERESTS")[0]
        self.assertIn("Test Researcher", header_text)
        self.assertIn("Test University", header_text)
        self.assertIn("test@example.com", header_text)
        for label in ("Google Scholar", "Semantic Scholar", "LinkedIn", "Lab Page"):
            self.assertNotIn(label, header_text)
        links = {a.get_object().get("/A", {}).get("/URI", "")
                 for page in pdf.pages for a in page.get("/Annots", [])}
        self.assertIn("mailto:test@example.com", links)
        self.assertIn("https://example.com/paper", links)
        for url in ("https://example.com/", "https://example.com/scholar", "https://example.com/semantic",
                    "https://example.com/linkedin", "https://example.com/lab"):
            self.assertNotIn(url, links)
        before = [(self.root / f).read_bytes() for f in ("cv.html", "cv.pdf")]
        self.edit("index.html", "https://example.com/scholar", "https://example.com/updated-profile")
        cv.generate(self.root, today="2026-10-05")
        self.assertEqual(before, [(self.root / f).read_bytes() for f in ("cv.html", "cv.pdf")])

    def test_prose_introduction_preserves_cv_header_without_visible_labels(self):
        before = cv.generate(self.root)
        before_pdf = (self.root / "cv.pdf").read_bytes()
        self.edit("index.html", '<section id="home">',
                  '<section id="home" data-cv-subtitle="Ph.D. Student, Test University">')
        self.edit("index.html", '<p class="kicker">Ph.D. Student</p>', '')
        self.edit("index.html", '<p class="affiliation">Test University</p>',
                  '<p class="intro-description">I am a Ph.D. student at Test University.</p>')
        self.assertEqual(cv.generate(self.root), before)
        self.assertEqual((self.root / "cv.pdf").read_bytes(), before_pdf)

    def test_research_directions_keep_hierarchy_questions_and_links(self):
        self.edit("index.html", '<p class="bio">Research interests.</p>',
                  '<div class="research-interests"><p class="bio">Research <strong>interests</strong>.</p>'
                  '<ol class="research-directions">'
                  '<li><strong>Understanding models</strong><ul>'
                  '<li>How do models compute? (<a href="https://example.com/mechanisms">Study</a>)</li>'
                  '<li>Where do they fail?</li></ul></li>'
                  '<li><strong>Improving training</strong><ul>'
                  '<li>How does training reshape a model’s computation?</li>'
                  '<li>How can insights help? (<a href="https://example.com/training">Method</a>)</li>'
                  '</ul></li></ol></div>')
        model = cv.generate(self.root)
        self.assertEqual(model["interests"], 'Research <strong>interests</strong>.')
        self.assertEqual([d["title"] for d in model["directions"]],
                         ["Understanding models", "Improving training"])
        rendered = BeautifulSoup((self.root / "cv.html").read_text(encoding="utf-8"), "html.parser")
        self.assertEqual(len(rendered.select(".research-directions > li")), 2)
        self.assertEqual(len(rendered.select(".research-directions > li > ul > li")), 4)
        pdf = self.text()
        for index, direction in enumerate(model["directions"], start=1):
            self.assertIn(f'{index}. {direction["title"]}', pdf)
            for question in direction["questions"]:
                self.assertIn(BeautifulSoup(question, "html.parser").get_text(), pdf)
        links = {a.get_object().get("/A", {}).get("/URI", "")
                 for page in PdfReader(self.root / "cv.pdf").pages for a in page.get("/Annots", [])}
        self.assertIn("https://example.com/mechanisms", links)
        self.assertIn("https://example.com/training", links)

    def add_numbered_reference(self):
        self.edit("index.html", '<p class="bio">Research interests.</p>',
                  '<p class="bio">Research interests. '
                  '<a href="#selected-paper" data-paper-ref data-cv-label="[Study]" '
                  'data-cv-href="https://example.com/paper">[3]</a></p>')

    def test_homepage_citations_use_cv_numbers_and_keep_paper_urls(self):
        self.add_numbered_reference()
        model = cv.generate(self.root)
        self.assertIn('<a href="https://example.com/paper">[1]</a>', model["interests"])
        self.assertNotIn("#selected-paper", model["interests"])
        self.assertNotIn("[Study]", self.text())
        self.assertIn("Research interests. [1]", self.text())
        self.assertIn("[1] Accepted paper", self.text())
        self.assertIn("[3] New preprint", self.text())
        rendered = BeautifulSoup((self.root / "cv.html").read_text(encoding="utf-8"), "html.parser")
        self.assertEqual([n.text for n in rendered.select(".paper-number")], ["[1]", "[2]", "[3]", "[4]"])
        self.edit("index.html", 'data-cv-href="https://example.com/paper"',
                  'data-cv-href="javascript:alert(1)"')
        with self.assertRaisesRegex(ValueError, "Unsupported link"):
            cv.generate(self.root)

    def test_citation_numbers_follow_reordered_and_added_papers(self):
        self.add_numbered_reference()
        self.select_papers(["workshop", "preprint", "joint", "accepted"])
        page = self.root / "research.html"
        soup = BeautifulSoup(page.read_text(encoding="utf-8"), "html.parser")
        moved = soup.select_one("#publications article.paper").extract()
        soup.select_one("#preprints .section-body").append(moved)
        page.write_text(str(soup), encoding="utf-8")
        model = cv.generate(self.root)
        self.assertIn('>[4]</a>', model["interests"])
        self.assertIn("[4] Accepted paper", self.text())
        soup.select_one("#publications .section-body").append(BeautifulSoup(
            '<article class="paper" id="added"><h3>Added paper</h3><p class="venue">Venue</p>'
            '<p class="authors">Test Researcher</p></article>', "html.parser"))
        page.write_text(str(soup), encoding="utf-8")
        self.select_papers(["workshop", "preprint", "joint", "added", "accepted"])
        model = cv.generate(self.root)
        self.assertIn('>[5]</a>', model["interests"])
        self.assertIn("[5] Accepted paper", self.text())

    def test_unresolved_or_ambiguous_citations_do_not_replace_outputs(self):
        self.add_numbered_reference()
        cv.generate(self.root)
        before = [(self.root / f).read_bytes() for f in ("cv.html", "cv.pdf")]
        page = self.root / "research.html"
        for case in ("missing", "ambiguous"):
            with self.subTest(case=case):
                soup = BeautifulSoup(RESEARCH, "html.parser")
                paper = soup.select_one("article.paper")
                if case == "missing":
                    paper.decompose()
                else:
                    soup.select_one("#preprints .section-body").append(
                        BeautifulSoup(str(paper), "html.parser"))
                page.write_text(str(soup), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "Selected paper must match exactly one research entry"):
                    cv.generate(self.root)
                self.assertEqual(before, [(self.root / f).read_bytes() for f in ("cv.html", "cv.pdf")])

    def test_duplicate_resource_links_on_one_paper_are_not_ambiguous(self):
        self.add_numbered_reference()
        self.edit("research.html", '<a href="https://example.com/paper">PDF</a>',
                  '<a href="https://example.com/paper">PDF</a><a href="https://example.com/paper">Paper</a>')
        model = cv.generate(self.root)
        self.assertIn('>[1]</a>', model["interests"])

    def test_only_selected_papers_appear_and_unselected_changes_do_not_churn_cv(self):
        self.select_papers(["joint", "accepted"])
        model = cv.generate(self.root)
        papers = next(s for s in model["sections"] if s["kind"] == "papers")["items"]
        self.assertEqual([p["title"] for p in papers], ["Joint first authors", "Accepted paper"])
        self.assertEqual([p["number"] for p in papers], [1, 2])
        self.assertNotIn("Workshop paper", self.text())
        self.assertNotIn("New preprint", self.text())
        before = [(self.root / f).read_bytes() for f in ("cv.html", "cv.pdf")]
        self.edit("research.html", "Workshop paper", "Revised unselected paper")
        cv.generate(self.root)
        self.assertEqual(before, [(self.root / f).read_bytes() for f in ("cv.html", "cv.pdf")])

    def test_missing_empty_duplicate_or_unknown_selection_is_rejected(self):
        cv.generate(self.root)
        before = [(self.root / f).read_bytes() for f in ("cv.html", "cv.pdf")]
        for selection in ([], ["accepted", "accepted"], ["missing"], [""]):
            with self.subTest(selection=selection):
                self.select_papers(selection)
                with self.assertRaisesRegex(ValueError, "Selected"):
                    cv.generate(self.root)
                self.assertEqual(before, [(self.root / f).read_bytes() for f in ("cv.html", "cv.pdf")])
        self.edit("index.html", 'id="selected-publications"', 'id="removed-selection"')
        with self.assertRaisesRegex(ValueError, "Missing CV source field: #selected-publications"):
            cv.generate(self.root)

    def test_research_reference_to_unselected_paper_is_rejected(self):
        self.add_numbered_reference()
        self.select_papers(["workshop", "joint"])
        with self.assertRaisesRegex(ValueError, "CV paper reference must match exactly one paper"):
            cv.generate(self.root)

    def test_multiple_venues_remain_on_separate_lines_in_both_formats(self):
        self.edit("research.html", '<p class="venue">NeurIPS 2026</p>',
                  '<p class="venue"><span class="venue-line">NeurIPS 2026</span>'
                  '<span class="venue-line venue-secondary">Pre-to-Post Workshop @ NeurIPS 2026</span></p>')
        model = cv.generate(self.root)
        paper = next(s for s in model["sections"] if s["id"] == "selected-publications")["items"][0]
        self.assertEqual(paper["venue_lines"], ["NeurIPS 2026", "Pre-to-Post Workshop @ NeurIPS 2026"])
        rendered = BeautifulSoup((self.root / "cv.html").read_text(encoding="utf-8"), "html.parser")
        venue = rendered.select_one("#selected-publications .venue")
        self.assertEqual(len(venue.select("br")), 1)
        self.assertEqual(venue.get_text(" ", strip=True), paper["venue"])
        pdf = "\n".join(page.extract_text() for page in PdfReader(self.root / "cv.pdf").pages)
        self.assertIn("NeurIPS 2026\nPre-to-Post Workshop @ NeurIPS 2026", pdf)

    def test_add_move_and_remove_papers(self):
        page = self.root / "research.html"
        soup = BeautifulSoup(page.read_text(encoding="utf-8"), "html.parser")
        moved = soup.select_one("#preprints article.paper").extract()
        moved.select_one(".venue").string = "New Conference 2027"
        soup.select_one("#publications .section-body").append(moved)
        soup.select_one("#publications article.paper").decompose()
        new = BeautifulSoup('<article class="paper" id="added"><p class="venue">Preprint, 2027</p>'
                            '<h3>A newly added paper</h3><p class="authors">Jongwon Lim*</p>'
                            '</article>', "html.parser")
        soup.select_one("#preprints .section-body").append(new)
        page.write_text(str(soup), encoding="utf-8")
        self.select_papers(["workshop", "preprint", "joint", "added"])
        cv.generate(self.root)
        output = BeautifulSoup((self.root / "cv.html").read_text(encoding="utf-8"), "html.parser")
        self.assertIn("New Conference 2027", output.select_one("#selected-publications").text)
        self.assertNotIn("Accepted paper", self.text())
        self.assertIn("A newly added paper", self.text())

    def test_homepage_changes_update_both_formats(self):
        self.edit("index.html", "2025.09 - 2026.08", "2025.09 - 2027.08")
        self.edit("index.html", "Teaching Assistant</h3>", "Teaching Fellow</h3>")
        self.edit("index.html", "Ph.D. Student</p>", "Research Scientist</p>")
        cv.generate(self.root)
        for content in (self.text(), (self.root / "cv.html").read_text(encoding="utf-8")):
            self.assertIn("2025.09 - 2027.08", content)
            self.assertIn("Teaching Fellow", content)
            self.assertIn("Research Scientist", content)

    def test_no_changes_no_new_date_or_pdf_churn(self):
        cv.generate(self.root, today="2026-10-03")
        before = [(self.root / f).read_bytes() for f in ("cv.html", "cv.pdf")]
        self.edit("index.html", "Paper accepted to NeurIPS 2026", "Unrelated news update")
        cv.generate(self.root, today="2026-10-05")
        self.assertEqual(before, [(self.root / f).read_bytes() for f in ("cv.html", "cv.pdf")])
        self.edit("index.html", "Teaching Assistant</h3>", "Teaching Fellow</h3>")
        cv.generate(self.root, today="2026-10-05")
        rendered = BeautifulSoup((self.root / "cv.html").read_text(encoding="utf-8"), "html.parser")
        self.assertEqual(rendered.select_one('meta[name="cv-updated"]')["content"], "2026-10-05")
        self.assertNotIn("Last updated", rendered.get_text())
        self.assertNotIn("Last updated", self.text())

    def test_academic_layout_keeps_bibliography_without_photo_or_summaries(self):
        cv.generate(self.root)
        rendered = BeautifulSoup((self.root / "cv.html").read_text(encoding="utf-8"), "html.parser")
        self.assertIsNone(rendered.select_one("img"))
        self.assertIsNone(rendered.select_one(".summary"))
        self.assertNotIn("An accepted paper.", self.text())
        paper = rendered.select_one(".paper")
        self.assertEqual([node.get("class") for node in paper.find_all("p", recursive=False)],
                         [["authors"], ["publication-meta"]])
        self.assertEqual(paper.select_one(".links a").text, "[PDF]")
        self.assertIn("* Equal contribution", rendered.select_one("#selected-publications .section-heading").text)
        self.assertEqual(rendered.select_one(".item-heading .date").text, "2025 - Present")
        for page in PdfReader(self.root / "cv.pdf").pages:
            self.assertEqual(len(page.images), 0)

    def test_website_only_photo_and_summary_changes_do_not_churn_cv(self):
        cv.generate(self.root, today="2026-10-03")
        before = [(self.root / f).read_bytes() for f in ("cv.html", "cv.pdf")]
        # Neither an image file nor its URL is read when producing a text-only CV.
        self.edit("index.html", 'src="assets/img/profile.jpg?v=2"', 'src="https://example.com/new.jpg"')
        self.edit("research.html", "An accepted paper.", "A revised homepage-only explanation.")
        cv.generate(self.root, today="2026-10-05")
        self.assertEqual(before, [(self.root / f).read_bytes() for f in ("cv.html", "cv.pdf")])

    def test_section_heading_stays_with_first_entry_when_paginating(self):
        path = self.root / "research.html"
        original = BeautifulSoup(RESEARCH, "html.parser")
        template = str(original.select_one("article.paper"))
        # Vary the boundary so this is not tied to a single accidental page fit.
        for count in (8, 11, 14, 17):
            soup = BeautifulSoup(RESEARCH, "html.parser")
            for number in range(count):
                soup.select_one("#publications .section-body").append(
                    BeautifulSoup(template.replace('id="accepted"', f'id="extra-{number}"')
                                  .replace("Accepted paper", f"Additional paper {number}"), "html.parser"))
            path.write_text(str(soup), encoding="utf-8")
            self.select_papers(["accepted", "workshop", "preprint", "joint"] +
                               [f"extra-{number}" for number in range(count)])
            model = cv.generate(self.root)
            for page in PdfReader(self.root / "cv.pdf").pages:
                text = " ".join(page.extract_text().split())
                for section in model["sections"]:
                    if section["title"].upper() in text:
                        self.assertIn(section["items"][0]["title"], text)

    def test_invalid_source_does_not_replace_existing_outputs(self):
        cv.generate(self.root)
        before = [(self.root / f).read_bytes() for f in ("cv.html", "cv.pdf")]
        self.edit("research.html", 'class="authors"', 'class="missing-authors"')
        with self.assertRaisesRegex(ValueError, "Missing CV source"):
            cv.generate(self.root)
        self.assertEqual(before, [(self.root / f).read_bytes() for f in ("cv.html", "cv.pdf")])

    def test_new_sections_are_included_not_silently_ignored(self):
        self.edit("index.html", '    <section class="section" id="contact">',
                  '<section class="section" id="appointments"><h2>Appointments</h2>'
                  '<article class="entry"><time>2027</time><h3>New appointment</h3>'
                  '<p>Details from the homepage</p></article></section>'
                  '<section class="section" id="contact">')
        cv.generate(self.root)
        self.assertIn("New appointment", self.text())

    def test_collapsed_workshop_service_is_kept_in_both_cv_formats(self):
        self.edit("index.html", '<time>2026</time><h3>Reviewer</h3><ul>',
                  '<time>2026</time><details class="service-workshops">'
                  '<summary><h3>Workshop Reviewer</h3></summary><ul>')
        self.edit("index.html", '</li></ul></article></section>',
                  '</li></ul></details></article></section>')
        self.edit("index.html", '<h2>Services</h2>',
                  '<h2>Services</h2><article class="entry"><time>2027</time>'
                  '<h3>Conference Reviewer</h3><p>ICLR 2027</p></article>')
        cv.generate(self.root)
        rendered = BeautifulSoup((self.root / "cv.html").read_text(encoding="utf-8"), "html.parser")
        service = rendered.select_one("#services")
        self.assertIsNone(service.select_one("details"))
        for text in (service.get_text(" ", strip=True), self.text()):
            self.assertIn("Conference Reviewer", text)
            self.assertIn("ICLR 2027", text)
            self.assertIn("Workshop Reviewer", text)
            self.assertIn("Workshop A", text)
            self.assertIn("Workshop B", text)
            self.assertEqual(text.count("also emergency reviewer"), 2)

    def test_undated_entries_keep_content_without_an_empty_date_column(self):
        self.edit("index.html", '<time>2026</time><h3>Reviewer</h3>',
                  '<h3>Reviewer</h3><p>ICLR 2027</p>')
        model = cv.generate(self.root)
        rendered = BeautifulSoup((self.root / "cv.html").read_text(encoding="utf-8"), "html.parser")
        service = next(s for s in model["sections"] if s["id"] == "services")
        self.assertEqual(service["items"][0]["date"], "")
        self.assertIsNone(rendered.select_one("#services .date"))
        self.assertIn("ICLR 2027", self.text())
        self.assertIn("Workshop A", self.text())
        self.assertEqual(self.text().count("also emergency reviewer"), 2)
        self.assertEqual(rendered.select_one("#education .date").text, "2025 - Present")

    def test_empty_dates_are_rejected_without_replacing_outputs(self):
        cv.generate(self.root)
        before = [(self.root / f).read_bytes() for f in ("cv.html", "cv.pdf")]
        self.edit("index.html", "<time>2025 - Present</time>", "<time> </time>")
        with self.assertRaisesRegex(ValueError, "Missing CV source field: time"):
            cv.generate(self.root)
        self.assertEqual(before, [(self.root / f).read_bytes() for f in ("cv.html", "cv.pdf")])

    def test_collapsed_experience_is_expanded_in_both_cv_formats(self):
        self.edit("index.html", '<section class="section" id="experience"><h2>Experience</h2>',
                  '<section class="section" id="experience"><details class="section-disclosure">'
                  '<summary><h2>Experience</h2></summary>')
        self.edit("index.html", '<p>Republic of Korea Army</p></article></section>',
                  '<p>Republic of Korea Army</p></article></details></section>')
        cv.generate(self.root)
        rendered = BeautifulSoup((self.root / "cv.html").read_text(encoding="utf-8"), "html.parser")
        self.assertIsNone(rendered.select_one("#experience details"))
        for content in (rendered.select_one("#experience").get_text(" ", strip=True), self.text()):
            self.assertIn("Military Service", content)
            self.assertIn("Republic of Korea Army", content)
            self.assertIn("2022", content)

    def test_long_titles_wrap_and_documents_paginate(self):
        self.edit("index.html", "Teaching Assistant</h3>",
                  "A long teaching role with detailed responsibilities " * 8 + "</h3>")
        # Force multiple pages independently of the current site's length.
        path = self.root / "research.html"
        soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
        paper = str(soup.select_one("article.paper"))
        for number in range(20):
            soup.select_one("#publications .section-body").append(
                BeautifulSoup(paper.replace('id="accepted"', f'id="extra-{number}"')
                              .replace("Accepted paper", f"Paper number {number}"), "html.parser"))
        path.write_text(str(soup), encoding="utf-8")
        self.select_papers(["accepted", "workshop", "preprint", "joint"] +
                           [f"extra-{number}" for number in range(20)])
        cv.generate(self.root)
        reader = PdfReader(self.root / "cv.pdf")
        self.assertGreaterEqual(len(reader.pages), 2)
        self.assertLess(len(reader.pages), 6)
        self.assertIn("Republic of Korea Army", self.text())
        self.assertEqual(self.text().count("detailed responsibilities"), 8)

    def test_rejects_unsafe_links(self):
        self.edit("index.html", 'href="https://yohanjo.github.io/"', 'href="javascript:alert(1)"')
        # This advisor link is not part of the CV; the education link is.
        self.edit("index.html", 'href="https://yohanjo.github.io/"', 'href="javascript:alert(1)"')
        with self.assertRaisesRegex(ValueError, "Unsupported link"):
            cv.generate(self.root)


if __name__ == "__main__":
    unittest.main()

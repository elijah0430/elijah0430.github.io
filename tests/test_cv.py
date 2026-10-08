import importlib.util
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
    <section class="section" id="contact"><a href="mailto:test@example.com">test@example.com</a></section>
</main></body></html>"""
RESEARCH = """<!doctype html><html><body>
<section id="publications"><h2>Publications</h2><div class="section-body">
<article class="paper"><p class="venue">NeurIPS 2026</p><h3>Accepted paper</h3>
<p class="authors">Author A*, <strong>Test Researcher*</strong></p>
<p class="summary">An accepted paper.</p><div class="paper-links">
<a href="https://example.com/paper">PDF</a></div></article>
<article class="paper"><p class="venue">Workshop 2026</p><h3>Workshop paper</h3>
<p class="authors"><strong>Test Researcher</strong>, Author A</p></article></div></section>
<section id="preprints"><h2>Preprints</h2><div class="section-body">
<article class="paper"><p class="venue">Preprint, 2026</p><h3>New preprint</h3>
<p class="authors">Author A*, <strong>Test Researcher*</strong></p></article>
<article class="paper"><p class="venue">Preprint, 2026</p><h3>Joint first authors</h3>
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

    def edit(self, filename, old, new):
        path = self.root / filename
        source = path.read_text(encoding="utf-8")
        self.assertIn(old, source)
        path.write_text(source.replace(old, new, 1), encoding="utf-8")

    def text(self):
        return " ".join(" ".join(page.extract_text().split()) for page in PdfReader(self.root / "cv.pdf").pages)

    def test_all_current_content_matches_source(self):
        model = cv.generate(self.root, today="2026-10-03")
        rendered = BeautifulSoup((self.root / "cv.html").read_text(encoding="utf-8"), "html.parser")
        pdf = self.text()
        self.assertEqual(len(rendered.select(".paper")), 4)
        for section in model["sections"]:
            for item in section["items"]:
                self.assertIn(item["title"], pdf)
        self.assertEqual([s["title"] for s in model["sections"]][:4],
                         ["Education", "Awards", "Publications", "Preprints"])
        self.assertEqual(model["sections"][-1]["title"], "Experience")
        self.assertIn("NeurIPS 2026", rendered.select_one("#publications .venue").text)
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
        pdf = " ".join(" ".join(p.extract_text().split()) for p in PdfReader(output / "cv.pdf").pages)
        generated = BeautifulSoup((output / "cv.html").read_text(encoding="utf-8"), "html.parser")
        source = BeautifulSoup((ROOT / "research.html").read_text(encoding="utf-8"), "html.parser")
        self.assertEqual(len(generated.select(".paper")), len(source.select("article.paper")))
        pdf_links = {a.get_object().get("/A", {}).get("/URI", "")
                     for page in PdfReader(output / "cv.pdf").pages for a in page.get("/Annots", [])}
        html_links = {a["href"] for a in generated.select("a[href]")}
        self.assertEqual(pdf_links, html_links)
        for contact in model["contacts"]:
            self.assertIn(contact["url"], pdf_links)
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

    def test_add_move_and_remove_papers(self):
        page = self.root / "research.html"
        soup = BeautifulSoup(page.read_text(encoding="utf-8"), "html.parser")
        moved = soup.select_one("#preprints article.paper").extract()
        moved.select_one(".venue").string = "New Conference 2027"
        soup.select_one("#publications .section-body").append(moved)
        soup.select_one("#publications article.paper").decompose()
        new = BeautifulSoup('<article class="paper"><p class="venue">Preprint, 2027</p>'
                            '<h3>A newly added paper</h3><p class="authors">Jongwon Lim*</p>'
                            '</article>', "html.parser")
        soup.select_one("#preprints .section-body").append(new)
        page.write_text(str(soup), encoding="utf-8")
        cv.generate(self.root)
        output = BeautifulSoup((self.root / "cv.html").read_text(encoding="utf-8"), "html.parser")
        self.assertIn("New Conference 2027", output.select_one("#publications").text)
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
        self.assertIn("Last updated: 2026-10-05", self.text())

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
        self.assertIn("* Equal contribution", rendered.select_one("#publications .section-heading").text)
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
                    BeautifulSoup(template.replace("Accepted paper", f"Additional paper {number}"), "html.parser"))
            path.write_text(str(soup), encoding="utf-8")
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

    def test_long_titles_wrap_and_documents_paginate(self):
        self.edit("index.html", "Teaching Assistant</h3>",
                  "A long teaching role with detailed responsibilities " * 8 + "</h3>")
        # Force multiple pages independently of the current site's length.
        path = self.root / "research.html"
        soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
        paper = str(soup.select_one("article.paper"))
        for number in range(20):
            soup.select_one("#publications .section-body").append(
                BeautifulSoup(paper.replace("Accepted paper", f"Paper number {number}"), "html.parser"))
        path.write_text(str(soup), encoding="utf-8")
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

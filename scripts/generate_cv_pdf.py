"""Generate both CV formats from homepage content and CV-only skills."""

import argparse
import hashlib
import html
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup, NavigableString
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
KST = timezone(timedelta(hours=9))
BLUE = colors.HexColor("#285f88")
MUTED = colors.HexColor("#555555")
LINE = colors.HexColor("#a8a8a8")


def normalized(value):
    return re.sub(r"\s+", " ", value.translate(str.maketrans({"–": "-", "—": "-", "‑": "-"}))).strip()


def required(parent, selector):
    node = parent.select_one(selector)
    if node is None or not node.get_text(strip=True):
        raise ValueError(f"Missing CV source field: {selector}")
    return node


def plain(node):
    return normalized(node.get_text())


def safe_url(value, base):
    url = urljoin(base, value)
    if urlsplit(url).scheme not in {"https", "http", "mailto"}:
        raise ValueError(f"Unsupported link in CV source: {value}")
    return url


def inline(node, base, paper_references=None):
    """Keep text, emphasis and links, not site-specific wrappers or active HTML."""
    def visit(child):
        if isinstance(child, NavigableString):
            return html.escape(str(child))
        if child.name in {"script", "style"}:
            return ""
        content = "".join(visit(part) for part in child.children)
        if child.has_attr("data-cv-text"):
            if not normalized(child["data-cv-text"]):
                raise ValueError("CV text override must not be empty")
            content = html.escape(child["data-cv-text"])
        if child.name in {"strong", "b", "em", "i"}:
            return f"<{child.name}>{content}</{child.name}>"
        if child.name == "span" and "author-name" in child.get("class", []):
            return f"<u>{content}</u>"
        if child.name == "a" and child.get("href"):
            href = child["href"]
            if child.has_attr("data-paper-ref"):
                # Resolve against the actual CV selection, so printed citations
                # remain in sync without relying on manually entered numbers.
                href = safe_url(child.get("data-cv-href", href), base)
                matches = (paper_references or {}).get(href, [])
                if len(matches) != 1:
                    raise ValueError(f"CV paper reference must match exactly one paper: {href}")
                content = f'[{matches[0]["number"]}]'
            return f'<a href="{html.escape(safe_url(href, base), quote=True)}">{content}</a>'
        return content
    return normalized("".join(visit(child) for child in node.children))


def read_sources(root):
    home = BeautifulSoup((root / "index.html").read_text(encoding="utf-8"), "html.parser")
    research = BeautifulSoup((root / "research.html").read_text(encoding="utf-8"), "html.parser")
    cv_only = json.loads((root / "scripts/cv-only.json").read_text(encoding="utf-8"))
    skills = cv_only.get("skills") if isinstance(cv_only, dict) else None
    if not isinstance(skills, list) or not skills:
        raise ValueError("CV-only skills must be a non-empty list")
    for skill in skills:
        if not isinstance(skill, dict) or any(
            not isinstance(skill.get(key), str) or not normalized(skill[key])
            for key in ("label", "text")
        ):
            raise ValueError("Each CV-only skill requires non-empty label and text")
    skills = [{key: normalized(skill[key]) for key in ("label", "text")} for skill in skills]
    canonical = home.select_one('link[rel="canonical"]')
    if canonical is None or not canonical.get("href"):
        raise ValueError("Missing canonical homepage URL")
    base = canonical["href"]
    intro = required(home, "#home")
    subtitle = normalized(intro.get("data-cv-subtitle", ""))
    if not subtitle:
        subtitle = f'{plain(required(intro, ".kicker"))}, {plain(required(intro, ".affiliation"))}'
    email = home.select_one('a[href^="mailto:"]')
    if email is None:
        raise ValueError("Missing contact email")
    contacts = [{"label": plain(email), "url": safe_url(email["href"], base)}]
    homepage_url = safe_url(base, base)
    contacts.append({"label": "Homepage", "url": homepage_url})
    scholar = next((a for a in intro.select(".link-row a[href]")
                    if plain(a) == "Google Scholar"), None)
    if scholar is not None:
        contacts.append({"label": "Google Scholar", "url": safe_url(scholar["href"], base)})

    sections = []
    for section in home.select("main > section.section"):
        if section.get("id") in {"news", "contact"} or section.has_attr("data-cv-exclude"):
            continue
        entries = []
        for article in section.select("article.entry"):
            entries.append({
                "date": plain(required(article, "time")) if article.select_one("time") is not None else "",
                "title": plain(required(article, "h3")),
                "paragraphs": [inline(p, base) for p in article.select("p")],
                "bullets": [inline(li, base) for li in article.select("li")],
            })
        if not entries:
            raise ValueError("CV section has no article.entry items; use data-cv-exclude to omit it")
        sections.append({"id": section.get("id"), "title": plain(required(section, "h2")),
                         "kind": "entries", "items": entries})
    for section_id in ("education", "awards", "teaching", "services", "experience"):
        if not any(s["id"] == section_id for s in sections):
            raise ValueError(f"Missing homepage CV section: {section_id}")

    papers = []
    for section_id in ("publications", "preprints"):
        section = required(research, f"#{section_id}")
        items = []
        for article in section.select("article.paper"):
            venue_node = required(article, ".venue")
            venue_lines = [plain(line) for line in venue_node.select(".venue-line")] or [plain(venue_node)]
            items.append({
                "source_id": article.get("id"),
                "venue": " ".join(venue_lines),
                "venue_lines": venue_lines,
                "title": plain(required(article, "h3")),
                "authors": inline(required(article, ".authors"), base),
                "links": [{"label": plain(a), "url": safe_url(a["href"], base)}
                          for a in article.select(".paper-links a[href]")],
            })
        if not items:
            # An explicitly empty section is valid; malformed articles are not.
            continue
        papers.append({"id": section_id, "title": plain(required(section, "h2")),
                       "kind": "papers", "items": items})
    if len([p for s in papers for p in s["items"]]) != len(research.select("article.paper")):
        raise ValueError("Found papers outside Publications/Preprints; refusing to omit them")
    selected = required(home, "#selected-publications")
    selected_ids = [article.get("id") for article in selected.select(".paper-list > li > article.paper")]
    if not selected_ids or any(not paper_id for paper_id in selected_ids) or len(set(selected_ids)) != len(selected_ids):
        raise ValueError("Selected Publications must contain unique paper IDs")
    catalog = [paper for section in papers for paper in section["items"]]
    selected_items = []
    for number, paper_id in enumerate(selected_ids, start=1):
        matches = [paper for paper in catalog if paper["source_id"] == paper_id]
        if len(matches) != 1:
            raise ValueError(f"Selected paper must match exactly one research entry: {paper_id}")
        selected_items.append({**matches[0], "number": number})
    papers = [{"id": "selected-publications", "title": "Selected Papers",
               "kind": "papers", "items": selected_items}]
    paper_references = {}
    for section in papers:
        for paper in section["items"]:
            for url in {link["url"] for link in paper["links"]}:
                paper_references.setdefault(url, []).append(paper)
    # Research interests render first; the selected papers follow immediately.
    sections[0:0] = papers
    return {
        "name": plain(required(intro, "h1")),
        "subtitle": subtitle,
        "interests": inline(required(intro, ".bio"), base, paper_references),
        "directions": [{
            "title": inline(required(item, ":scope > strong"), base),
            "questions": [inline(question, base, paper_references)
                          for question in item.select(":scope > ul > li")],
        } for item in intro.select(".research-directions > li")],
        "contacts": contacts, "sections": sections, "skills": skills,
    }


def fingerprint(root, model):
    digest = hashlib.sha256(json.dumps(model, sort_keys=True, ensure_ascii=False).encode())
    for path in ("scripts/generate_cv_pdf.py", "scripts/cv.css", "scripts/requirements-cv.txt"):
        # Canonical newlines keep Windows/local and Linux/CI hashes identical.
        digest.update((root / path).read_text(encoding="utf-8").encode("utf-8"))
    return digest.hexdigest()


def last_updated(output, digest, today):
    if output.exists():
        previous = BeautifulSoup(output.read_text(encoding="utf-8"), "html.parser")
        stamp = previous.select_one('meta[name="cv-source-sha256"]')
        date = previous.select_one('meta[name="cv-updated"]')
        if stamp and date and stamp.get("content") == digest:
            return date["content"]
    return today


def links_html(links, bracketed=False):
    def label(link):
        text = html.escape(link["label"])
        return f"[{text}]" if bracketed else text
    separator = " " if bracketed else " · "
    return separator.join(f'<a href="{html.escape(link["url"], quote=True)}">{label(link)}</a>'
                          for link in links)


def contribution_note(section):
    return "* Equal contribution" if section["kind"] == "papers" and any(
        "*" in paper["authors"] for paper in section["items"]
    ) else ""


def html_document(root, model, digest, updated):
    esc = html.escape
    parts = [
        "<!doctype html>", '<html lang="en"><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f'<title>{esc(model["name"])} - CV</title>',
        f'<meta name="cv-source-sha256" content="{digest}">',
        f'<meta name="cv-updated" content="{updated}">',
        "<!-- Generated from index.html, research.html and scripts/cv-only.json. Do not edit directly. -->",
        f'<style>{(root / "scripts/cv.css").read_text(encoding="utf-8")}</style>',
        "</head><body><main><header>",
        f'<h1>{esc(model["name"])}</h1><p class="subtitle">{esc(model["subtitle"])}</p>',
        f'<p class="contact contact-email">{links_html(model["contacts"][:1])}</p>',
        f'<p class="contact contact-profiles">{links_html(model["contacts"][1:])}</p></header>',
        f'<section id="research-interests"><h2>Research Interests</h2><p>{model["interests"]}</p>',
    ]
    if model["directions"]:
        parts.append('<ol class="research-directions">')
        for direction in model["directions"]:
            questions = "".join(f"<li>{question}</li>" for question in direction["questions"])
            parts.append(f'<li><strong>{direction["title"]}</strong><ul>{questions}</ul></li>')
        parts.append('</ol>')
    parts.append('</section>')
    for section in model["sections"]:
        note = contribution_note(section)
        parts.append(f'<section id="{esc(section["id"] or "")}">')
        parts.append(f'<div class="section-heading"><h2>{esc(section["title"])}</h2>')
        if note:
            parts.append(f'<p class="meta">{note}</p>')
        parts.append('</div>')
        for entry in section["items"]:
            if section["kind"] == "papers":
                venues = "<br />".join(esc(line) for line in entry["venue_lines"])
                parts.extend([
                    '<article class="paper">',
                    f'<h3><span class="paper-number">[{entry["number"]}]</span> {esc(entry["title"])}</h3>',
                    f'<p class="authors">{entry["authors"]}</p>',
                    f'<p class="publication-meta"><span class="venue">{venues}</span>',
                ])
                if entry["links"]:
                    parts.append(f' <span class="links">{links_html(entry["links"], bracketed=True)}</span>')
                parts.append('</p>')
            else:
                parts.extend(['<article class="item"><div class="item-heading">',
                              f'<h3>{esc(entry["title"])}</h3>'])
                if entry["date"]:
                    parts.append(f'<div class="date">{esc(entry["date"])}</div>')
                parts.append('</div>')
                parts.extend(f"<p>{p}</p>" for p in entry["paragraphs"])
                if entry["bullets"]:
                    parts.append("<ul>" + "".join(f"<li>{b}</li>" for b in entry["bullets"]) + "</ul>")
            parts.append("</article>")
        parts.append("</section>")
    parts.append('<section id="skills"><h2>Skills &amp; Competencies</h2><ul>')
    parts.extend(f'<li><strong>{esc(skill["label"])}:</strong> {esc(skill["text"])}</li>'
                 for skill in model["skills"])
    parts.append('</ul></section>')
    parts.append('</main></body></html>')
    return "\n".join(parts) + "\n"


def pdf_document(root, model, updated, output):
    body = ParagraphStyle("CVBody", fontName="Times-Roman", fontSize=10.5, leading=13,
                          textColor=colors.HexColor("#202020"), spaceAfter=1.5,
                          uriWasteReduce=0)
    title = ParagraphStyle("CVTitle", parent=body, fontName="Times-Bold")
    small = ParagraphStyle("CVSmall", parent=body, fontSize=9.2, leading=12, textColor=MUTED)
    date = ParagraphStyle("CVDate", parent=small, alignment=2)
    bibliography = ParagraphStyle("CVBibliography", parent=body, fontSize=10, leading=12.8)
    paper_title = ParagraphStyle("CVPaperTitle", parent=title, leftIndent=22,
                                bulletIndent=0, bulletFontName="Times-Roman", bulletFontSize=10.5)
    paper_authors = ParagraphStyle("CVPaperAuthors", parent=body, leftIndent=22)
    paper_venue = ParagraphStyle("CVPaperVenue", parent=bibliography, leftIndent=22)
    section_style = ParagraphStyle("CVSection", parent=title, fontSize=11.5, leading=14)
    name = ParagraphStyle("CVName", parent=title, alignment=1, fontSize=26, leading=30,
                          spaceAfter=5)
    subtitle = ParagraphStyle("CVSubtitle", parent=body, alignment=1, spaceAfter=3)
    contact = ParagraphStyle("CVContact", parent=small, alignment=1)
    bullet_style = ParagraphStyle("CVBullet", parent=body, leftIndent=10, firstLineIndent=-7)

    def para(text, style=body):
        # ReportLab's parser supports the sanitized inline markup from the source.
        return Paragraph(text, style)

    # SimpleDocTemplate adds six points of frame padding inside each margin.
    doc = SimpleDocTemplate(str(output), pagesize=letter, rightMargin=42, leftMargin=42,
                            topMargin=38, bottomMargin=42, title=f'{model["name"]} - CV',
                            author=model["name"], invariant=1, pageCompression=1)
    content_width = doc.width - 12

    def heading(text, note=""):
        row = Table([[para(html.escape(text.upper()), section_style), para(note, date)]],
                    colWidths=[content_width - 110, 110], hAlign="LEFT")
        row.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LINEBELOW", (0, 0), (-1, -1), .4, LINE),
        ]))
        row.spaceBefore = 10
        row.spaceAfter = 6
        return row

    story = [para(html.escape(model["name"]), name),
             para(html.escape(model["subtitle"]), subtitle),
             para(links_html(model["contacts"][:1]), contact),
             para(links_html(model["contacts"][1:]), contact)]
    story.append(KeepTogether([heading("Research Interests"), para(model["interests"])]))
    direction_style = ParagraphStyle("CVDirection", parent=title, leftIndent=12,
                                    firstLineIndent=-12, spaceBefore=6)
    question_style = ParagraphStyle("CVQuestion", parent=body, leftIndent=22,
                                   firstLineIndent=-8)
    for index, direction in enumerate(model["directions"], start=1):
        group = [para(f'{index}. {direction["title"]}', direction_style)]
        group.extend(para("- " + question, question_style) for question in direction["questions"])
        story.append(KeepTogether(group))
    for section in model["sections"]:
        section_heading = heading(section["title"], contribution_note(section))
        for index, entry in enumerate(section["items"]):
            if section["kind"] == "papers":
                venues = "<br/>".join(html.escape(line) for line in entry["venue_lines"])
                venue = f'<i>{venues}</i>'
                if entry["links"]:
                    venue += f' <font size="9" color="{BLUE.hexval()}">{links_html(entry["links"], bracketed=True)}</font>'
                group = [Paragraph(html.escape(entry["title"]), paper_title,
                                   bulletText=f'[{entry["number"]}]'),
                         para(entry["authors"], paper_authors), para(venue, paper_venue)]
            else:
                row = Table([[para(html.escape(entry["title"]), title),
                              para(html.escape(entry["date"]), date)]],
                            colWidths=[content_width - 110, 110], hAlign="LEFT",
                            splitByRow=1, splitInRow=1)
                row.setStyle(TableStyle([
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (0, -1), 10),
                    ("RIGHTPADDING", (1, 0), (1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]))
                group = [row] if entry["date"] else [para(html.escape(entry["title"]), title)]
                group.extend(para(p) for p in entry["paragraphs"])
                group.extend(para("- " + bullet, bullet_style) for bullet in entry["bullets"])
            # Keep a heading with its first entry; oversized entries may split.
            if index == 0:
                group.insert(0, section_heading)
            story.extend([KeepTogether(group), Spacer(1, 4)])
    story.append(KeepTogether([
        heading("Skills & Competencies"),
        *(para(f'- <b>{html.escape(skill["label"])}:</b> {html.escape(skill["text"])}', bullet_style)
          for skill in model["skills"]),
    ]))

    def footer(canvas, document):
        canvas.saveState()
        canvas.setFont("Times-Roman", 8.5)
        canvas.setFillColor(MUTED)
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(.35)
        canvas.line(48, 38, letter[0] - 48, 38)
        canvas.drawRightString(letter[0] - 48, 26, f'{model["name"]} | {document.page}')
        canvas.restoreState()
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def generate(root=ROOT, output_dir=None, today=None):
    root = Path(root).resolve()
    output_dir = Path(output_dir or root).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    model = read_sources(root)
    digest = fingerprint(root, model)
    updated = last_updated(output_dir / "cv.html", digest, today or datetime.now(KST).date().isoformat())
    content = html_document(root, model, digest, updated)
    # Build both fully before replacing either published output.
    temporary = output_dir / "cv.generated.pdf"
    try:
        pdf_document(root, model, updated, temporary)
        temporary.replace(output_dir / "cv.pdf")
        (output_dir / "cv.html").write_text(content, encoding="utf-8", newline="\n")
    finally:
        temporary.unlink(missing_ok=True)
    return model


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    model = generate(args.root, args.output_dir)
    count = sum(len(s["items"]) for s in model["sections"] if s["kind"] == "papers")
    print(f"Updated cv.html and cv.pdf from homepage sources ({count} papers).")

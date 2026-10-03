"""Generate both CV formats from the visible homepage; never maintain a second CV."""

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
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    HRFlowable, Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
KST = timezone(timedelta(hours=9))
BLUE = colors.HexColor("#285f88")
MUTED = colors.HexColor("#5f6b7a")
LINE = colors.HexColor("#d8e0e8")


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


def inline(node, base):
    """Keep text, emphasis and links, not site-specific wrappers or active HTML."""
    def visit(child):
        if isinstance(child, NavigableString):
            return html.escape(str(child))
        if child.name in {"script", "style"}:
            return ""
        content = "".join(visit(part) for part in child.children)
        if child.name in {"strong", "b", "em", "i"}:
            return f"<{child.name}>{content}</{child.name}>"
        if child.name == "a" and child.get("href"):
            return f'<a href="{html.escape(safe_url(child["href"], base), quote=True)}">{content}</a>'
        return content
    return normalized("".join(visit(child) for child in node.children))


def read_sources(root):
    home = BeautifulSoup((root / "index.html").read_text(encoding="utf-8"), "html.parser")
    research = BeautifulSoup((root / "research.html").read_text(encoding="utf-8"), "html.parser")
    canonical = home.select_one('link[rel="canonical"]')
    if canonical is None or not canonical.get("href"):
        raise ValueError("Missing canonical homepage URL")
    base = canonical["href"]
    intro = required(home, "#home")
    portrait = intro.select_one("img.portrait")
    image_path = urlsplit(portrait["src"]).path if portrait else ""
    # Never fetch remote images or read outside the repository.
    if not image_path or urlsplit(portrait["src"]).netloc:
        raise ValueError("CV requires a local homepage portrait")
    photo = (root / image_path).resolve()
    if not photo.is_relative_to(root.resolve()) or not photo.is_file():
        raise ValueError("Homepage portrait is missing or outside the repository")
    email = home.select_one('a[href^="mailto:"]')
    if email is None:
        raise ValueError("Missing contact email")
    contacts = [{"label": plain(email), "url": safe_url(email["href"], base)}]
    contacts.append({"label": urlsplit(base).netloc, "url": base})
    for link in intro.select(".link-row a[href]"):
        if Path(urlsplit(link["href"]).path).name not in {"cv.pdf", "cv.html"}:
            contacts.append({"label": plain(link), "url": safe_url(link["href"], base)})

    sections = []
    for section in home.select("main > section.section"):
        if section.get("id") in {"news", "contact"} or section.has_attr("data-cv-exclude"):
            continue
        entries = []
        for article in section.select("article.entry"):
            entries.append({
                "date": plain(required(article, "time")),
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
            summary = article.select_one(".summary")
            items.append({
                "venue": plain(required(article, ".venue")),
                "title": plain(required(article, "h3")),
                "authors": inline(required(article, ".authors"), base),
                "summary": inline(summary, base) if summary else "",
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
    insert_at = next(i for i, s in enumerate(sections) if s["id"] == "awards") + 1
    sections[insert_at:insert_at] = papers
    return {
        "name": plain(required(intro, "h1")),
        "subtitle": f'{plain(required(intro, ".kicker"))}, {plain(required(intro, ".affiliation"))}',
        "interests": inline(required(intro, ".bio"), base),
        "contacts": contacts, "photo": image_path, "sections": sections,
    }


def fingerprint(root, model):
    digest = hashlib.sha256(json.dumps(model, sort_keys=True, ensure_ascii=False).encode())
    for path in ("scripts/generate_cv_pdf.py", "scripts/cv.css", "scripts/requirements-cv.txt"):
        # Canonical newlines keep Windows/local and Linux/CI hashes identical.
        digest.update((root / path).read_text(encoding="utf-8").encode("utf-8"))
    digest.update((root / model["photo"]).read_bytes())
    return digest.hexdigest()


def last_updated(output, digest, today):
    if output.exists():
        previous = BeautifulSoup(output.read_text(encoding="utf-8"), "html.parser")
        stamp = previous.select_one('meta[name="cv-source-sha256"]')
        date = previous.select_one('meta[name="cv-updated"]')
        if stamp and date and stamp.get("content") == digest:
            return date["content"]
    return today


def links_html(links):
    return " · ".join(f'<a href="{html.escape(link["url"], quote=True)}">{html.escape(link["label"])}</a>'
                      for link in links)


def html_document(root, model, digest, updated):
    esc = html.escape
    parts = [
        "<!doctype html>", '<html lang="en"><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f'<title>{esc(model["name"])} - CV</title>',
        f'<meta name="cv-source-sha256" content="{digest}">',
        f'<meta name="cv-updated" content="{updated}">',
        "<!-- Generated from index.html and research.html. Do not edit this file directly. -->",
        f'<style>{(root / "scripts/cv.css").read_text(encoding="utf-8")}</style>',
        "</head><body><main><header><div>",
        f'<h1>{esc(model["name"])}</h1><p class="subtitle">{esc(model["subtitle"])}</p>',
        f'<p class="contact">{links_html(model["contacts"])}</p></div>',
        f'<img class="headshot" src="{esc(model["photo"])}" alt="{esc(model["name"])}"></header>',
        f'<section><h2>Research Interests</h2><p>{model["interests"]}</p></section>',
    ]
    for section in model["sections"]:
        parts.append(f'<section id="{esc(section["id"] or "")}"><h2>{esc(section["title"])}</h2>')
        for entry in section["items"]:
            if section["kind"] == "papers":
                parts.extend([
                    '<article class="paper">',
                    f'<p class="venue">{esc(entry["venue"])}</p><h3>{esc(entry["title"])}</h3>',
                    f'<p>{entry["authors"]}</p>',
                ])
                if entry["summary"]:
                    parts.append(f'<p class="summary">{entry["summary"]}</p>')
                if entry["links"]:
                    parts.append(f'<p class="links">{links_html(entry["links"])}</p>')
            else:
                parts.extend(['<article class="item">', f'<div class="date">{esc(entry["date"])}</div>',
                              f'<div><h3>{esc(entry["title"])}</h3>'])
                parts.extend(f"<p>{p}</p>" for p in entry["paragraphs"])
                if entry["bullets"]:
                    parts.append("<ul>" + "".join(f"<li>{b}</li>" for b in entry["bullets"]) + "</ul>")
                parts.append("</div>")
            parts.append("</article>")
        if section["kind"] == "papers" and any("*" in p["authors"] for p in section["items"]):
            parts.append('<p class="meta">* Equal contribution</p>')
        parts.append("</section>")
    parts.append(f'<p class="updated">Last updated: {updated}</p></main></body></html>')
    return "\n".join(parts) + "\n"


def pdf_document(root, model, updated, output):
    styles = getSampleStyleSheet()
    body = ParagraphStyle("CVBody", fontName="Helvetica", fontSize=9.2, leading=12.4,
                          textColor=colors.HexColor("#243244"), spaceAfter=3)
    title = ParagraphStyle("CVTitle", parent=body, fontName="Helvetica-Bold",
                           fontSize=9.6, leading=12.6, spaceAfter=4)
    small = ParagraphStyle("CVSmall", parent=body, fontSize=8.3, leading=10.6, textColor=MUTED)
    section_style = ParagraphStyle("CVSection", parent=title, fontSize=10.3, leading=13,
                                   spaceBefore=13, spaceAfter=6, keepWithNext=True)
    name = ParagraphStyle("CVName", parent=styles["Title"], alignment=0, fontName="Helvetica-Bold",
                          fontSize=23, leading=27, textColor=body.textColor, spaceAfter=7)

    def para(text, style=body):
        # ReportLab's parser supports the sanitized inline markup from the source.
        return Paragraph(text, style)

    doc = SimpleDocTemplate(str(output), pagesize=letter, rightMargin=48, leftMargin=48,
                            topMargin=42, bottomMargin=45, title=f'{model["name"]} - CV',
                            author=model["name"], invariant=1, pageCompression=1)
    image_w, image_h = ImageReader(str(root / model["photo"])).getSize()
    scale = 66 / max(image_w, image_h)
    photo = Image(str(root / model["photo"]), image_w * scale, image_h * scale)
    header = Table([[[para(html.escape(model["name"]), name),
                     para(html.escape(model["subtitle"]), body),
                     para(links_html(model["contacts"]), small)], photo]], colWidths=[430, 86])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("LEFTPADDING", (0, 0), (-1, -1), 0),
                               ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story = [header, Spacer(1, 10), HRFlowable(width="100%", thickness=.6, color=LINE),
             para("RESEARCH INTERESTS", section_style), para(model["interests"])]
    for section in model["sections"]:
        story.append(para(html.escape(section["title"].upper()), section_style))
        for entry in section["items"]:
            if section["kind"] == "papers":
                group = [para(html.escape(entry["venue"]), small),
                         para(html.escape(entry["title"]), title), para(entry["authors"])]
                if entry["summary"]:
                    group.append(para(entry["summary"], small))
                if entry["links"]:
                    group.append(para(links_html(entry["links"]), small))
                story.extend([KeepTogether(group), Spacer(1, 8)])
            else:
                content = [para(html.escape(entry["title"]), title)]
                content.extend(para(p) for p in entry["paragraphs"])
                content.extend(para("- " + bullet, small) for bullet in entry["bullets"])
                row = Table([[para(html.escape(entry["date"]), small), content]],
                            colWidths=[100, 416], hAlign="LEFT", splitByRow=1, splitInRow=1)
                row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                         ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                         ("RIGHTPADDING", (0, 0), (0, -1), 12),
                                         ("RIGHTPADDING", (1, 0), (1, -1), 0),
                                         ("TOPPADDING", (0, 0), (-1, -1), 0),
                                         ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
                # Keep a normal entry together; ReportLab can still split an
                # unusually large entry that is taller than an entire page.
                story.append(KeepTogether([row]))
        if section["kind"] == "papers" and any("*" in p["authors"] for p in section["items"]):
            story.append(para("* Equal contribution", small))

    def footer(canvas, document):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(48, 26, f"Last updated: {updated}")
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

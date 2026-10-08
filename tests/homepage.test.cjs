const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('selected publications replace news and exactly match the requested four research entries', () => {
  const home = new JSDOM(read('index.html'));
  const research = new JSDOM(read('research.html'));
  try {
    const doc = home.window.document;
    assert.equal(doc.querySelector('#news'), null);
    const selected = doc.querySelector('#selected-publications');
    assert.equal(selected.querySelector('h2').textContent, 'Selected Publications');
    assert.ok(selected.hasAttribute('data-cv-exclude'));
    const papers = [...selected.querySelectorAll('.paper')];
    assert.deepEqual(papers.map(p => p.id), ['poise', 'dual-mechanisms', 'negation', 'vla-rl']);
    for (const paper of papers) {
      const original = research.window.document.getElementById(paper.id);
      assert.equal(paper.outerHTML.replace(/\s+/g, ' '), original.outerHTML.replace(/\s+/g, ' '));
      assert.equal(paper.querySelector('details').open, false);
    }
    assert.deepEqual(papers.slice(2).map(p => p.querySelector('.venue').textContent), ['Preprint (under review)', 'Preprint (under review)']);
    assert.equal(selected.querySelector('.publication-more'), null);
    assert.doesNotMatch(selected.textContent, /All publications & preprints/);
    assert.ok(doc.querySelector('nav a[href="research.html"]'));
  } finally {
    home.window.close();
    research.window.close();
  }
});

test('publication lists use title, authors, venue and links, with one contribution note per section', () => {
  for (const file of ['index.html', 'research.html']) {
    const dom = new JSDOM(read(file));
    try {
      const style = dom.window.document.createElement('style');
      style.textContent = read('assets/css/styles.css');
      dom.window.document.head.append(style);
      const lists = [...dom.window.document.querySelectorAll('ol.paper-list')];
      assert.equal(lists.length, file === 'index.html' ? 1 : 2);
      assert.equal(dom.window.document.querySelector('ul.paper-list'), null);
      for (const list of lists) {
        assert.equal(dom.window.getComputedStyle(list).listStyle, 'decimal');
        assert.equal(list.closest('section').querySelectorAll('.contribution-note').length, 1);
        for (const item of list.children) {
          assert.equal(item.tagName, 'LI');
          const paper = item.querySelector('article.paper');
          assert.ok(paper);
          assert.deepEqual([...paper.querySelector('.paper-main').children].map(node => node.className || node.tagName),
            ['H3', 'authors', 'venue', 'paper-links']);
          assert.equal(paper.querySelector('.paper-links span'), null);
        }
      }
    } finally { dom.window.close(); }
  }
  assert.match(read('assets/css/styles.css'), /--page-width: 663px/);
});

test('arXiv papers omit duplicate PDF buttons while retaining other resources', () => {
  for (const file of ['index.html', 'research.html']) {
    const dom = new JSDOM(read(file));
    try {
      const doc = dom.window.document;
      for (const paper of doc.querySelectorAll('.paper')) {
        const links = [...paper.querySelectorAll('.paper-links a')];
        if (links.some(a => a.textContent.trim() === 'arXiv')) {
          assert.ok(links.every(a => a.textContent.trim() !== 'PDF'));
        }
      }
      assert.ok(doc.querySelector('#poise .paper-links a[href="https://holi-lab.github.io/POISE/"]'));
      assert.ok(doc.querySelector('#dual-mechanisms .paper-links a[href^="https://openreview.net/forum"]'));
      if (file === 'research.html') {
        assert.ok(doc.querySelector('#factual-negation .paper-links a[href="https://openreview.net/pdf?id=JRj3TkSOJV"]'));
        assert.ok(doc.querySelector('#dahl .paper-links a[href="https://github.com/seemdog/DAHL"]'));
      }
    } finally { dom.window.close(); }
  }
});

test('workshop-only papers belong to Preprints and retain their actual venues', () => {
  const dom = new JSDOM(read('research.html'));
  try {
    const doc = dom.window.document;
    const ids = section => [...doc.querySelectorAll(`#${section} .paper`)].map(paper => paper.id);
    assert.deepEqual(ids('publications'), ['poise', 'arcane', 'dual-mechanisms', 'user-profiles']);
    assert.deepEqual(ids('preprints'), ['negation', 'vla-rl', 'factual-negation', 'dahl']);
    assert.equal(doc.querySelectorAll('.paper').length, new Set([...ids('publications'), ...ids('preprints')]).size);
    assert.equal(doc.querySelector('#factual-negation .venue').textContent, 'Mech Interp Workshop @ ICML 2026');
    assert.equal(doc.querySelector('#dahl .venue').textContent, 'FEVER Workshop @ EMNLP 2024');
  } finally { dom.window.close(); }
});

test('publication spacing groups metadata and gives links and disclosures equal separation', () => {
  for (const file of ['index.html', 'research.html']) {
    const dom = new JSDOM(read(file));
    try {
      const doc = dom.window.document;
      const style = doc.createElement('style');
      style.textContent = read('assets/css/styles.css');
      doc.head.append(style);
      const computed = node => dom.window.getComputedStyle(node);
      for (const paper of doc.querySelectorAll('.paper-list .paper')) {
        const main = paper.querySelector('.paper-main');
        assert.equal(computed(main).display, 'grid');
        assert.equal(computed(main).gap, '4px');
        for (const selector of ['h3', '.authors', '.venue']) {
          const block = computed(main.querySelector(selector));
          assert.equal(block.marginTop, '0px');
          assert.equal(block.marginBottom, '0px');
        }
        const metadataGap = parseFloat(computed(main).gap);
        const linksMargin = parseFloat(computed(main.querySelector('.paper-links')).marginTop);
        assert.equal(metadataGap + linksMargin, 12);
        assert.equal(computed(paper).gap, '12px');
      }
      for (const item of doc.querySelectorAll('.paper-list > li:not(:last-child)')) {
        assert.equal(computed(item).marginBottom, '32px');
      }
    } finally { dom.window.close(); }
  }
});

test('author names are underlined and contribution-note stars are larger and distinct', () => {
  for (const file of ['index.html', 'research.html']) {
    const dom = new JSDOM(read(file));
    try {
      const doc = dom.window.document;
      const style = doc.createElement('style');
      style.textContent = read('assets/css/styles.css');
      doc.head.append(style);
      for (const author of doc.querySelectorAll('.authors strong')) {
        assert.match(author.textContent, /^Jongwon Lim\*?$/);
        const name = author.querySelector('.author-name');
        assert.equal(name.textContent, 'Jongwon Lim');
        assert.equal(name.querySelector('sup'), null);
        assert.notEqual(dom.window.getComputedStyle(author).textDecorationLine, 'underline');
        const computed = dom.window.getComputedStyle(name);
        assert.equal(computed.textDecorationLine, 'underline');
        assert.equal(computed.textUnderlineOffset, '3px');
      }
      for (const star of doc.querySelectorAll('.contribution-note sup')) {
        assert.equal(star.textContent, '*');
        const computed = dom.window.getComputedStyle(star);
        const noteStyle = dom.window.getComputedStyle(star.parentElement);
        assert.ok(parseFloat(computed.fontSize) > parseFloat(noteStyle.fontSize));
        assert.equal(computed.fontWeight, '700');
        assert.equal(computed.fontStyle, 'normal');
        assert.equal(computed.verticalAlign, 'baseline');
        assert.equal(noteStyle.fontStyle, 'italic');
      }
    } finally { dom.window.close(); }
  }
});

test('useful dates stay beside entry headings, not in a separate column', () => {
  const dom = new JSDOM(read('index.html'));
  try {
    const doc = dom.window.document;
    for (const section of ['education', 'awards', 'teaching', 'experience']) {
      for (const entry of doc.querySelectorAll(`#${section} .entry`)) {
        assert.ok(entry.querySelector('.entry-heading time').textContent.trim());
        assert.ok(entry.querySelector('.entry-heading h3'));
      }
    }
    assert.equal(doc.querySelector('.entry > time'), null);
    const reviewers = [...doc.querySelectorAll('#services .entry')]
      .filter(entry => entry.querySelector('h3').textContent.includes('Reviewer'));
    assert.equal(reviewers.length, 2);
    for (const entry of reviewers) assert.equal(entry.querySelector('time'), null);
    assert.equal(doc.querySelector('#services .entry-heading time').textContent, '2026');
  } finally {
    dom.window.close();
  }
});

test('new portrait and simplified introduction keep only the top navigation CV link', () => {
  const dom = new JSDOM(read('index.html'));
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelector('.portrait-frame .portrait').getAttribute('src'), 'assets/img/profile-202610.png');
    const intro = doc.querySelector('#home');
    assert.equal(intro.querySelector('.kicker, .affiliation, .advisor'), null);
    const description = intro.querySelector('.intro-description');
    assert.equal(description.textContent.replace(/\s+/g, ' ').trim(),
      'I am a Ph.D. student in Data Science at Seoul National University, advised by Prof. Yohan Jo in the Human-Oriented Language Intelligence (HOLI) Lab.');
    assert.deepEqual([...description.querySelectorAll('a')].map(a => [a.textContent, a.href]), [
      ['Data Science', 'https://gsds.snu.ac.kr/'],
      ['Seoul National University', 'https://www.snu.ac.kr/'],
      ['Prof. Yohan Jo', 'https://yohanjo.github.io/'],
    ]);
    assert.equal(intro.querySelector('h1').nextElementSibling, description);
    assert.equal(description.nextElementSibling, intro.querySelector('.bio'));
    assert.equal(intro.querySelector('.bio').textContent.replace(/\s+/g, ' ').trim(),
      'I am interested in developing methods for understanding the internal mechanisms of language models, and using those insights to improve practical NLP and LLM applications.');
    assert.equal(doc.querySelector('#home a[href="cv.pdf"]'), null);
    assert.ok(doc.querySelector('nav a[href="cv.pdf"]'));
  } finally {
    dom.window.close();
  }
});

test('site uses plain sans-serif on white, while the printed CV and code retain their fonts', () => {
  const shared = read('assets/css/styles.css');
  const blog = read('assets/css/blog.css');
  assert.match(shared, /--font-main: Arial, "Helvetica Neue", sans-serif/);
  assert.match(shared, /--bg: #ffffff/);
  assert.match(blog, /--bg: #ffffff/);
  assert.match(read('scripts/cv.css'), /"Times New Roman", Times, serif/);
  assert.match(shared, /--font-code: Consolas, "Courier New", monospace/);
  assert.doesNotMatch(shared + blog, /(?:box-shadow|text-shadow|drop-shadow)\s*[:(]/);
  assert.match(blog, /\.editor-source:focus-within\s*\{\s*outline:/);
  for (const file of ['index.html', 'research.html', 'blog.html', 'game.html']) {
    assert.match(read(file), file === 'index.html'
      ? /styles\.css\?v=20261009-footer/
      : /styles\.css\?v=20261009-service-markers/);
    assert.doesNotMatch(read(file), /&copy;|data-year/);
  }
});

test('navigation and small controls avoid heavy, tightly spaced type', () => {
  for (const file of ['index.html', 'research.html', 'blog.html', 'game.html']) {
    const dom = new JSDOM(read(file));
    try {
      const doc = dom.window.document;
      const style = doc.createElement('style');
      style.textContent = read('assets/css/styles.css');
      doc.head.append(style);
      if (file === 'blog.html') {
        const blogStyle = doc.createElement('style');
        blogStyle.textContent = read('assets/css/blog.css');
        doc.head.append(blogStyle);
      }
      assert.equal(dom.window.getComputedStyle(doc.documentElement).fontSize, '12.75px');
      assert.equal(dom.window.getComputedStyle(doc.body).fontSize, '12.75px');
      for (const title of doc.querySelectorAll('.paper-list h3')) {
        assert.equal(dom.window.getComputedStyle(title).fontSize, '14.28px');
      }
      for (const item of doc.querySelectorAll('.nav-links a, .nav-links .theme-toggle')) {
        const computed = dom.window.getComputedStyle(item);
        assert.ok(Math.abs(parseFloat(computed.fontSize) - 11.953125) < 0.001);
        assert.equal(computed.fontWeight, '400');
        assert.equal(computed.letterSpacing, 'normal');
      }
      assert.equal(dom.window.getComputedStyle(doc.querySelector('.brand')).letterSpacing, 'normal');
    } finally { dom.window.close(); }
  }
});

test('home categories use indented lists with an aligned disclosure and no internal rules', () => {
  const dom = new JSDOM(read('index.html'));
  try {
    const doc = dom.window.document;
    const style = doc.createElement('style');
    style.textContent = read('assets/css/styles.css');
    doc.head.append(style);
    for (const id of ['education', 'awards', 'teaching', 'services', 'experience']) {
      const section = doc.getElementById(id);
      const list = section.querySelector('.section-body > ul.entry-list');
      assert.ok(list);
      assert.equal(dom.window.getComputedStyle(list).display, 'grid');
      assert.equal(dom.window.getComputedStyle(list).gap, '24px');
      for (const item of list.children) {
        assert.equal(item.tagName, 'LI');
        assert.equal(dom.window.getComputedStyle(item).marginBottom, '0px');
        const entry = item.querySelector(':scope > article.entry');
        assert.ok(entry);
        for (const node of [item, entry]) {
          const computed = dom.window.getComputedStyle(node);
          assert.ok(['', '0px'].includes(computed.borderTopWidth));
          assert.ok(['', '0px'].includes(computed.borderBottomWidth));
        }
      }
    }
    const workshop = doc.querySelector('.service-workshops');
    assert.ok(workshop.closest('li.disclosure-item'));
    assert.equal(workshop.open, false);
    // JSDOM reports the built-in summary display even when the author rule overrides it.
    const summaryRule = [...style.sheet.cssRules].find(rule => rule.selectorText === '.service-workshops > summary');
    assert.equal(summaryRule.style.display, 'block');
    assert.equal(summaryRule.style.getPropertyValue('min-height'), '44px');
    const rule = selector => [...style.sheet.cssRules].find(item => item.selectorText === selector).style;
    const marker = rule('#services .entry-list > li:not(.disclosure-item) h3::before,\n.service-workshops > summary h3::before');
    assert.equal(marker.left, '-16px');
    assert.equal(marker.top, '0.675em');
    assert.equal(marker.transform, 'translate(-50%, -50%)');
    assert.equal(marker.background, 'var(--text)');
    assert.equal(rule('#services .entry-list > li').getPropertyValue('list-style'), 'none');
    assert.equal(rule('#services .entry-list > li h3').position, 'relative');
    const bullet = rule('#services .entry-list > li:not(.disclosure-item) h3::before');
    assert.equal(bullet.width, '5px');
    assert.equal(bullet.height, '5px');
    const arrow = rule('.service-workshops > summary h3::before');
    assert.equal(arrow.width, '8px');
    assert.equal(arrow.height, '10px');
    assert.equal(arrow.getPropertyValue('clip-path'), 'polygon(0 0, 100% 50%, 0 100%)');
    assert.equal(rule('.service-workshops[open] > summary h3::before').transform, 'translate(-50%, -50%) rotate(90deg)');
    assert.equal(rule('.entry-list > li::marker').getPropertyValue('font-size'), '1.35rem');
    assert.equal(rule('.entry-list > li::marker').color, 'var(--text)');
    assert.equal(rule('.service-workshops > summary h3').display, 'block');
    const sectionSummary = rule('.section-disclosure > summary');
    assert.equal(sectionSummary.display, 'flex');
    assert.equal(rule('.section-disclosure > summary::after').width, arrow.width);
    assert.equal(rule('.section-disclosure > summary::after').height, arrow.height);
  } finally { dom.window.close(); }
});

test('Experiences is collapsed by default and retains entries and the lab link when toggled', () => {
  const dom = new JSDOM(read('index.html'));
  try {
    const details = dom.window.document.querySelector('#experience > details');
    assert.ok(details);
    assert.equal(details.open, false);
    assert.equal(details.querySelector('summary h2').textContent, 'Experiences');
    const lab = details.querySelector('h3 a[href="https://knlp.snu.ac.kr/"]');
    assert.ok(lab);
    assert.equal(lab.textContent, 'CL_NLP Lab');
    assert.equal(lab.target, '_blank');
    assert.equal(lab.rel, 'noopener noreferrer');
    const entries = details.querySelector('.section-body').innerHTML;
    details.querySelector('summary').click();
    assert.equal(details.open, true);
    details.querySelector('summary').click();
    assert.equal(details.open, false);
    assert.equal(details.querySelector('.section-body').innerHTML, entries);
    assert.equal(details.querySelectorAll('.entry').length, 4);
  } finally { dom.window.close(); }
});

test('responsive layouts keep navigation hidden, breadcrumbs intact and space above the runner', () => {
  const dom = new JSDOM('<html><head></head><body></body></html>');
  try {
    const sheetFor = file => {
      const style = dom.window.document.createElement('style');
      style.textContent = read(file);
      dom.window.document.head.append(style);
      return style.sheet;
    };
    const responsiveRules = (sheet, width) => [...sheet.cssRules]
      .find(rule => rule.conditionText === `(max-width: ${width}px)`).cssRules;
    const find = (rules, selector) => [...rules].find(rule => rule.selectorText === selector).style;
    const shared = sheetFor('assets/css/styles.css');
    const tablet = responsiveRules(shared, 820);
    assert.equal(find(tablet, '.nav-links').visibility, 'hidden');
    assert.equal(find(tablet, '.nav-links.is-open').visibility, 'visible');
    assert.equal(find(tablet, '.intro').getPropertyValue('grid-template-columns'), '133px minmax(0, 1fr)');
    assert.equal(find(shared.cssRules, '.paper-overview').getPropertyValue('grid-template-columns'),
      'minmax(0, 1fr) minmax(238px, 0.58fr)');
    assert.equal(find(tablet, '.paper-overview').getPropertyValue('grid-template-columns'), 'minmax(0, 1fr)');
    assert.equal(find(shared.cssRules, '.paper-overview[data-figure-layout="stacked"]').getPropertyValue('grid-template-columns'),
      'minmax(0, 1fr)');
    const stackedFigure = find(shared.cssRules, '.paper-overview[data-figure-layout="stacked"] .paper-figure');
    assert.equal(stackedFigure.getPropertyValue('max-width'), '510px');
    assert.equal(stackedFigure.getPropertyValue('justify-self'), 'center');
    assert.equal(find(shared.cssRules, '.paper-overview[data-figure-layout="stacked"] img').getPropertyValue('width'), 'auto');
    const phone = responsiveRules(shared, 600);
    assert.equal(find(phone, '.intro').getPropertyValue('grid-template-columns'), 'minmax(0, 1fr)');
    assert.equal(find(phone, '.runner-canvas').getPropertyValue('min-height'), '240px');
    const blog = responsiveRules(sheetFor('assets/css/blog.css'), 600);
    assert.equal(find(blog, '.editor-breadcrumb').getPropertyValue('flex-shrink'), '0');
    assert.equal(find(blog, '.editor-breadcrumb').getPropertyValue('white-space'), 'nowrap');
  } finally { dom.window.close(); }
});

test('Teaching includes the confirmed Fall 2026 AI at Work course before Spring 2026', () => {
  const dom = new JSDOM(read('index.html'));
  try {
    const entries = [...dom.window.document.querySelectorAll('#teaching .entry')];
    assert.deepEqual(entries.map(entry => entry.querySelector('time').textContent), ['Fall 2026', 'Spring 2026']);
    assert.equal(entries[0].querySelector('h3').textContent, 'Teaching Assistant');
    assert.equal(entries[0].querySelector('a').textContent, 'AI at Work (Data Science Seminar)');
  } finally { dom.window.close(); }
});

test('paper venues retain their original capitalization with normal spacing and weight', () => {
  const dom = new JSDOM(read('research.html'));
  try {
    const style = dom.window.document.createElement('style');
    style.textContent = read('assets/css/styles.css');
    dom.window.document.head.append(style);
    const venues = [...dom.window.document.querySelectorAll('.paper .venue')];
    assert.equal(venues[0].querySelector('.venue-line').textContent, 'NeurIPS 2026 Poster');
    assert.equal(dom.window.getComputedStyle(venues[0].querySelector('.venue-presentation')).fontStyle, 'italic');
    assert.equal(dom.window.document.querySelector('#user-profiles .venue').textContent, 'ACL 2026 Findings');
    for (const venue of venues) {
      const computed = dom.window.getComputedStyle(venue);
      assert.equal(computed.textTransform, 'none');
      assert.equal(computed.letterSpacing, 'normal');
      assert.equal(computed.fontWeight, '400');
    }
  } finally { dom.window.close(); }
});

test('publication metadata uses gray italic type and quiet square links', () => {
  for (const file of ['index.html', 'research.html']) {
    const dom = new JSDOM(read(file));
    try {
      const doc = dom.window.document;
      const style = doc.createElement('style');
      style.textContent = read('assets/css/styles.css');
      doc.head.append(style);
      const rule = selector => [...style.sheet.cssRules].find(item => item.selectorText === selector).style;
      for (const venue of doc.querySelectorAll('.paper .venue')) {
        assert.equal(dom.window.getComputedStyle(venue).fontStyle, 'italic');
      }
      assert.equal(rule('.paper-list .venue').color, 'var(--muted)');
      for (const presentation of doc.querySelectorAll('.venue-presentation')) {
        assert.equal(dom.window.getComputedStyle(presentation).fontStyle, 'italic');
      }
      assert.equal(rule('.paper-list .venue').getPropertyValue('font-size'), '0.9rem');
      const links = rule('.paper-list .paper-links a');
      assert.equal(links.getPropertyValue('border-color'), 'var(--line)');
      assert.equal(links.getPropertyValue('border-radius'), '0px');
      assert.equal(links.getPropertyValue('min-height'), '30px');
    } finally { dom.window.close(); }
  }
});

test('conference papers omit earlier workshop venues on both publication lists', () => {
  for (const file of ['index.html', 'research.html']) {
    const dom = new JSDOM(read(file));
    try {
      for (const [id, expected] of [
        ['poise', 'NeurIPS 2026 Poster'],
        ['dual-mechanisms', 'ICML 2026 Regular'],
      ]) {
        const venue = dom.window.document.querySelector(`#${id} .venue`);
        assert.equal(venue.textContent.trim(), expected);
        assert.equal(venue.querySelector('.venue-secondary'), null);
        assert.doesNotMatch(venue.textContent, /Workshop|·/);
      }
      if (file === 'research.html') {
        const workshopVenues = [...dom.window.document.querySelectorAll('.paper .venue')]
          .map(venue => venue.textContent.trim()).filter(venue => venue.includes('Workshop'));
        assert.deepEqual(workshopVenues, ['Mech Interp Workshop @ ICML 2026', 'FEVER Workshop @ EMNLP 2024']);
      }
    } finally { dom.window.close(); }
  }
});

test('Semantic Scholar appears beside the existing profile buttons', () => {
  const dom = new JSDOM(read('index.html'));
  try {
    const links = [...dom.window.document.querySelectorAll('#home .link-row a')];
    assert.deepEqual(links.map(link => link.textContent), ['Google Scholar', 'Semantic Scholar', 'LinkedIn', 'Lab Page']);
    assert.equal(links[0].href, 'https://scholar.google.com/citations?user=Mo8VK_YAAAAJ&hl=en');
    const identity = JSON.parse(dom.window.document.querySelector('script[type="application/ld+json"]').textContent);
    assert.ok(identity.sameAs.includes(links[0].href));
    const semantic = links[1];
    assert.equal(semantic.href, 'https://www.semanticscholar.org/author/Jongwon-Lim/2382941030');
    assert.equal(semantic.target, '_blank');
    assert.match(semantic.rel, /noopener/);
  } finally { dom.window.close(); }
});

test('Research navigation and page title are consistent', () => {
  for (const file of ['index.html', 'research.html', 'blog.html', 'game.html']) {
    const dom = new JSDOM(read(file));
    try {
      const doc = dom.window.document;
      assert.equal(doc.querySelector('nav a[href="research.html"]').textContent, 'Research');
      if (file === 'research.html') {
        assert.equal(doc.querySelector('.page-hero h1').textContent, 'Research');
        assert.equal(doc.querySelector('#publications h2').textContent, 'Publications');
        assert.equal(doc.querySelector('#preprints h2').textContent, 'Preprints');
        assert.equal(doc.querySelector('.page-hero .kicker'), null);
        assert.equal(doc.title, 'Research - Jongwon Lim');
        assert.equal(doc.querySelector('meta[property="og:title"]').content, doc.title);
        assert.equal(doc.querySelector('meta[name="twitter:title"]').content, doc.title);
        assert.equal(JSON.parse(doc.querySelector('script[type="application/ld+json"]').textContent).name, doc.title);
        assert.equal(doc.querySelector('link[rel="canonical"]').href, 'https://elijah0430.github.io/research.html');
      }
    } finally { dom.window.close(); }
  }
});

test('Kiwi Runner has a single page title without a redundant kicker', () => {
  const dom = new JSDOM(read('game.html'));
  try {
    const hero = dom.window.document.querySelector('.page-hero');
    assert.equal(hero.querySelector('h1').textContent, 'Kiwi Runner');
    assert.equal(hero.querySelector('.kicker'), null);
    assert.doesNotMatch(hero.textContent, /Mini Game/);
  } finally { dom.window.close(); }
});

test('introduction paragraphs use the same body type and spacing', () => {
  const dom = new JSDOM(read('index.html'));
  try {
    const style = dom.window.document.createElement('style');
    style.textContent = read('assets/css/styles.css');
    dom.window.document.head.append(style);
    const description = dom.window.getComputedStyle(dom.window.document.querySelector('.intro-description'));
    const bio = dom.window.getComputedStyle(dom.window.document.querySelector('.bio'));
    assert.equal(description.fontSize, '12.75px');
    assert.equal(description.fontSize, bio.fontSize);
    assert.equal(description.fontWeight, bio.fontWeight);
    assert.equal(description.marginBottom, '18px');
    assert.equal(description.marginBottom, bio.marginBottom);
  } finally { dom.window.close(); }
});

test('every paper has its summary and real local figure in a closed, working disclosure', () => {
  const dom = new JSDOM(read('research.html'));
  try {
    const papers = [...dom.window.document.querySelectorAll('article.paper')];
    assert.equal(papers.length, 8);
    for (const paper of papers) {
      const details = paper.querySelector('details.paper-details');
      assert.ok(details);
      assert.equal(details.open, false);
      assert.equal(details.querySelector('summary').textContent, 'Overview');
      assert.equal(paper.querySelector('.paper-main .summary'), null);
      const overview = details.querySelector('.paper-overview');
      assert.deepEqual([...overview.children].map(node => node.className), ['paper-figure', 'summary']);
      assert.ok(overview.querySelector(':scope > .summary'));
      assert.ok(overview.querySelector(':scope > figure.paper-figure'));
      assert.equal(details.querySelector('figcaption'), null);
      const img = details.querySelector('figure img');
      assert.ok(img.alt);
      assert.ok(fs.existsSync(path.join(__dirname, '..', img.getAttribute('src'))));
      const png = fs.readFileSync(path.join(__dirname, '..', img.getAttribute('src')));
      assert.equal(png.toString('ascii', 1, 4), 'PNG');
      const width = png.readUInt32BE(16);
      const height = png.readUInt32BE(20);
      assert.equal(Number(img.getAttribute('width')), width);
      assert.equal(Number(img.getAttribute('height')), height);
      assert.equal(overview.dataset.figureLayout, width / height >= 1.5 ? 'stacked' : 'side-by-side');
      const zoom = img.closest('a.figure-zoom');
      assert.equal(zoom.getAttribute('href'), img.getAttribute('src'));
      assert.equal(zoom.target, '_blank');
      assert.match(zoom.rel, /noopener/);
      assert.match(zoom.getAttribute('aria-label'), /Open full-size figure:/);
      details.querySelector('summary').click();
      assert.equal(details.open, true);
      details.querySelector('summary').click();
      assert.equal(details.open, false);
      assert.ok(details.querySelector('.summary').textContent.trim().length > 80);
    }
    for (const venue of dom.window.document.querySelectorAll('#negation .venue, #vla-rl .venue')) {
      assert.equal(venue.textContent, 'Preprint (under review)');
    }
  } finally { dom.window.close(); }
});

test('contact is a single inline invitation below the introduction and above profile links', () => {
  const dom = new JSDOM(read('index.html'));
  try {
    const contact = dom.window.document.querySelector('#contact');
    assert.equal(contact.tagName, 'P');
    assert.equal(contact.closest('section').id, 'home');
    assert.ok(contact.previousElementSibling.classList.contains('bio'));
    assert.ok(contact.nextElementSibling.classList.contains('link-row'));
    assert.equal(dom.window.document.querySelectorAll('a[href^="mailto:"]').length, 1);
    assert.equal(dom.window.document.querySelector('main > section#contact'), null);
    assert.equal(contact.querySelector('form, input, textarea, button'), null);
    assert.equal(contact.querySelector('a').getAttribute('href'), 'mailto:elijah0430@snu.ac.kr');
    assert.equal(contact.textContent.trim(),
      'Feel free to reach out at elijah0430@snu.ac.kr.');
  } finally { dom.window.close(); }
});

test('the homepage footer shows the date without copyright text or a separator', () => {
  const dom = new JSDOM(read('index.html'));
  try {
    const footer = dom.window.document.querySelector('footer');
    const style = dom.window.document.createElement('style');
    style.textContent = read('assets/css/styles.css');
    dom.window.document.head.append(style);
    assert.equal(dom.window.getComputedStyle(footer).borderTopWidth, '0px');
    const date = footer.querySelector('.site-updated time');
    assert.equal(date.textContent, '2026-10-09');
    assert.equal(date.getAttribute('datetime'), date.textContent);
    assert.match(footer.textContent, /Last updated:/);
    assert.doesNotMatch(footer.textContent, /©/);
  } finally { dom.window.close(); }
});

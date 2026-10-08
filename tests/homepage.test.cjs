const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('news uses complete publication titles without duplicate years', () => {
  const home = new JSDOM(read('index.html'));
  const research = new JSDOM(read('research.html'));
  try {
    const titles = new Set([...research.window.document.querySelectorAll('#publications .paper h3')]
      .map(node => node.textContent.trim()));
    const news = home.window.document.querySelector('#news');
    assert.equal(news.querySelector('time'), null);
    assert.equal(news.querySelectorAll('.entry').length, 4);
    for (const title of news.querySelectorAll('.entry em')) {
      assert.ok(titles.has(title.textContent.trim()), title.textContent);
    }
  } finally {
    home.window.close();
    research.window.close();
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

test('portrait framing and introduction retain the original image and past affiliation', () => {
  const dom = new JSDOM(read('index.html'));
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelector('.portrait-frame .portrait').getAttribute('src'), 'assets/img/profile.jpg?v=2');
    const advisor = doc.querySelector('.advisor');
    assert.match(advisor.textContent, /Prof\. Yohan Jo in the Human-Oriented Intelligence Lab\./);
    assert.equal(advisor.querySelector('a').href, 'https://yohanjo.github.io/');
    assert.match(advisor.textContent, /Previously worked with CL_NLP Lab\./);
  } finally {
    dom.window.close();
  }
});

test('shared typography matches the CV while keeping code fonts and visible focus states', () => {
  const shared = read('assets/css/styles.css');
  const blog = read('assets/css/blog.css');
  assert.match(shared, /--font-main: "Times New Roman", Times, serif/);
  assert.match(read('scripts/cv.css'), /"Times New Roman", Times, serif/);
  assert.match(shared, /--font-code: Consolas, "Courier New", monospace/);
  assert.doesNotMatch(shared + blog, /(?:box-shadow|text-shadow|drop-shadow)\s*[:(]/);
  assert.match(blog, /\.editor-source:focus-within\s*\{\s*outline:/);
  for (const file of ['index.html', 'research.html', 'blog.html', 'game.html']) {
    assert.match(read(file), /styles\.css\?v=20261008-clean/);
  }
});

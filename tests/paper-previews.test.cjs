const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function setup(t, before = () => {}) {
  const dom = new JSDOM(read('index.html'), { runScripts: 'outside-only', url: 'https://example.com/index.html' });
  t.after(() => dom.window.close());
  const doc = dom.window.document;
  before(doc);
  dom.window.eval(read('assets/js/paper-previews.js'));
  return { window: dom.window, doc, preview: doc.querySelector('#paper-preview'),
    link: doc.querySelector('.research-directions a[href="#negation"]') };
}

function pointer(window, target, type, pointerType = 'mouse') {
  const event = new window.Event(type);
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
}

test('citation previews read the actual paper title, venue and figure without changing the publication', t => {
  const { window, doc, preview, link } = setup(t);
  const paper = doc.querySelector('#negation');
  const original = paper.outerHTML;
  assert.equal(preview.hidden, true);
  pointer(window, link, 'pointerenter');
  assert.equal(preview.hidden, false);
  assert.equal(preview.getAttribute('role'), 'tooltip');
  assert.equal(link.getAttribute('aria-describedby'), preview.id);
  assert.equal(preview.querySelector('strong').textContent, `[4] ${paper.querySelector('h3').textContent}`);
  assert.equal(preview.querySelector('p').textContent, paper.querySelector('.venue').textContent);
  assert.equal(preview.querySelector('img').src, paper.querySelector('.paper-figure img').src);
  assert.equal(paper.outerHTML, original);
  assert.equal(preview.querySelector('a, button'), null);
});

test('keyboard focus shows the preview and Escape dismisses it without moving focus', t => {
  const { window, preview, link } = setup(t);
  link.focus();
  assert.equal(preview.hidden, false);
  link.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(preview.hidden, true);
  assert.equal(link.getAttribute('aria-describedby'), null);
  assert.equal(window.document.activeElement, link);
  link.blur();
  link.focus();
  assert.equal(preview.hidden, false);
  link.blur();
  assert.equal(preview.hidden, true);
});

test('the preview remains hoverable across the gap and closes after leaving both surfaces', async t => {
  const { window, preview, link } = setup(t);
  pointer(window, link, 'pointerenter');
  pointer(window, link, 'pointerleave');
  pointer(window, preview, 'pointerenter');
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(preview.hidden, false);
  pointer(window, preview, 'pointerleave');
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(preview.hidden, true);
});

test('clicks expand and focus the paper while modified clicks keep native navigation', t => {
  const { window, doc, preview, link } = setup(t);
  const details = doc.querySelector('#negation details');
  link.addEventListener('click', event => event.preventDefault());
  link.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
  assert.equal(details.open, false);
  link.focus();
  link.click();
  assert.equal(preview.hidden, true);
  assert.equal(details.open, true);
  assert.equal(doc.activeElement.id, 'negation');
  assert.equal(link.getAttribute('href'), '#negation');
});

test('touch goes directly to the paper without a sticky hover preview', t => {
  const { window, doc, preview, link } = setup(t);
  pointer(window, link, 'pointerenter', 'touch');
  pointer(window, link, 'pointerdown', 'touch');
  link.focus();
  assert.equal(preview.hidden, true);
  link.addEventListener('click', event => event.preventDefault());
  link.click();
  assert.equal(doc.querySelector('#negation details').open, true);
});

test('paper navigation does not retain an outline while citation keyboard focus stays visible', t => {
  const { window, doc, link } = setup(t);
  const style = doc.createElement('style');
  style.textContent = read('assets/css/styles.css');
  doc.head.append(style);
  link.addEventListener('click', event => event.preventDefault());
  link.click();
  const paper = doc.querySelector('#negation');
  assert.equal(doc.activeElement, paper);
  assert.equal(window.getComputedStyle(paper).outline, 'none');
  assert.doesNotMatch(style.textContent, /\.paper:target\s*\{/);
  assert.match(style.textContent, /\.paper-citation:focus-visible\s*\{\s*outline: 2px solid/);
});

test('numbers and accessible names follow the selected list order', t => {
  const { link } = setup(t, doc => {
    const list = doc.querySelector('#selected-publications .paper-list');
    list.prepend(doc.querySelector('#negation').parentElement);
  });
  assert.equal(link.textContent, '[1]');
  assert.match(link.getAttribute('aria-label'), /^Selected publication 1: How Do LLMs/);
});

test('resize and scrolling dismiss the preview; missing targets leave normal links alone', t => {
  const { window, doc, preview, link } = setup(t);
  pointer(window, link, 'pointerenter');
  window.dispatchEvent(new window.Event('resize'));
  assert.equal(preview.hidden, true);
  pointer(window, link, 'pointerenter');
  doc.dispatchEvent(new window.Event('scroll'));
  assert.equal(preview.hidden, true);
  const missing = setup(t, page => page.querySelector('#negation').remove());
  pointer(missing.window, missing.link, 'pointerenter');
  assert.equal(missing.preview.hidden, true);
  assert.equal(missing.link.getAttribute('href'), '#negation');
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const ids = ['home', 'research-interests', 'selected-publications', 'education', 'awards', 'teaching', 'services', 'experience'];

function setup(t, { compact = false, reduced = false, scrollY = 0 } = {}) {
  const dom = new JSDOM(read('index.html'), { runScripts: 'outside-only', url: 'https://example.com/index.html' });
  t.after(() => dom.window.close());
  const { window } = dom;
  const doc = window.document;
  doc.documentElement.classList.add('js');
  window.innerHeight = 800;
  window.scrollY = scrollY;
  Object.defineProperty(doc.documentElement, 'scrollHeight', { value: 4500, configurable: true });
  const positions = Object.fromEntries(ids.map((id, index) => [id, 100 + index * 500]));
  const scrolls = [];
  const frames = new Map();
  let nextFrame = 0;
  const compactQuery = { matches: compact };
  window.matchMedia = query => query.includes('reduced-motion') ? { matches: reduced } : compactQuery;
  window.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); };
  doc.querySelector('.site-header').getBoundingClientRect = () => ({ bottom: 68 });
  doc.querySelector('[data-toc-toggle]').getBoundingClientRect = () => ({ bottom: compactQuery.matches ? 112 : 0 });
  for (const id of ids) {
    const section = doc.getElementById(id);
    section.getBoundingClientRect = () => ({ top: positions[id] - window.scrollY });
    section.scrollIntoView = options => scrolls.push({ id, ...options });
  }
  let resize;
  window.ResizeObserver = class {
    constructor(callback) { resize = callback; }
    observe() {}
  };
  window.eval(read('assets/js/page-toc.js'));
  const nav = doc.querySelector('[data-page-toc]');
  return { window, doc, nav, positions, scrolls, frames, flush, resize: () => { resize(); flush(); }, compactQuery,
    toggle: nav.querySelector('[data-toc-toggle]'),
    current: () => {
      const active = nav.querySelectorAll('[aria-current="location"]');
      assert.equal(active.length, 1);
      return active[0].hash.slice(1);
    },
    scroll: y => { window.scrollY = y; window.dispatchEvent(new window.Event('scroll')); flush(); },
  };
}

test('table of contents uses real local anchors in reading order and is independent of primary navigation', t => {
  const { doc, nav, current } = setup(t);
  assert.equal(nav.getAttribute('aria-label'), 'Page sections');
  assert.equal(nav.querySelector('a[href="#selected-publications"]').textContent, 'Selected Papers');
  assert.doesNotMatch(nav.textContent, /On this page/i);
  assert.equal(nav.querySelector('.toc-label'), null);
  assert.equal(nav.querySelector('[data-toc-toggle]').getAttribute('aria-label'), 'Choose section');
  assert.equal(nav.querySelector('[data-toc-toggle]').getAttribute('aria-describedby'), 'toc-current');
  assert.deepEqual([...nav.querySelectorAll('a')].map(a => a.hash.slice(1)), ids);
  assert.equal(current(), 'home');
  assert.equal(doc.querySelector('.nav-links [aria-current="page"]').textContent, 'Home');
  assert.ok(doc.querySelector('script[src="assets/js/page-toc.js?v=20261018"]'));
  for (const link of nav.querySelectorAll('a')) assert.ok(doc.querySelector(link.getAttribute('href')));
});

test('scrolling in both directions highlights one section without changing focus or history', t => {
  const { window, doc, scroll, current, nav } = setup(t);
  const citation = doc.querySelector('.paper-citation');
  citation.focus();
  scroll(510);
  assert.equal(current(), 'research-interests');
  scroll(1520);
  assert.equal(current(), 'education');
  assert.equal(nav.querySelector('[data-toc-current]').textContent, 'Education');
  scroll(1050);
  assert.equal(current(), 'selected-publications');
  scroll(0);
  assert.equal(current(), 'home');
  assert.equal(doc.activeElement, citation);
  assert.equal(window.location.hash, '');
  assert.equal(window.history.length, 1);
});

test('a short final section is highlighted when reaching the bottom', t => {
  const { positions, scroll, current } = setup(t);
  positions.experience = 4250;
  scroll(3700);
  assert.equal(current(), 'experience');
});

test('compact navigation accounts for the extra sticky bar', t => {
  const { current, scroll } = setup(t, { compact: true });
  scroll(475);
  assert.equal(current(), 'research-interests');
});

test('initial restored scroll position and layout changes are reflected in the highlight', t => {
  const { window, doc, positions, current, resize, flush } = setup(t, { scrollY: 1550 });
  assert.equal(current(), 'education');
  positions.education += 400;
  resize();
  assert.equal(current(), 'selected-publications');
  positions.education -= 400;
  doc.querySelector('.paper-details').dispatchEvent(new window.Event('toggle'));
  flush();
  assert.equal(current(), 'education');
  positions.education += 400;
  doc.querySelector('.paper-figure img').dispatchEvent(new window.Event('load'));
  flush();
  assert.equal(current(), 'selected-publications');
});

test('clicking navigates, focuses the target and expands Experiences without a persistent focus decoration', t => {
  const { window, doc, nav, toggle, scrolls } = setup(t, { compact: true });
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  nav.querySelector('a[href="#experience"]').click();
  assert.equal(window.location.hash, '#experience');
  assert.equal(doc.querySelector('#experience > details').open, true);
  assert.equal(doc.activeElement.id, 'experience');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(nav.hasAttribute('data-expanded'), false);
  assert.deepEqual(scrolls, [{ id: 'experience', behavior: 'smooth', block: 'start' }]);
  const length = window.history.length;
  nav.querySelector('a[href="#experience"]').click();
  assert.equal(window.history.length, length);
  toggle.focus();
  assert.equal(doc.querySelector('#experience').hasAttribute('tabindex'), false);
  assert.equal(doc.querySelector('#experience').classList.contains('toc-destination'), false);
  assert.match(read('assets/css/styles.css'), /\.toc-destination:focus\s*\{\s*outline: none;/);
});

test('modified clicks keep native navigation and do not expand sections', t => {
  const { window, doc, nav, scrolls } = setup(t);
  const link = nav.querySelector('a[href="#experience"]');
  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true, ...modifiers });
    // Prevent jsdom navigation only after the handler under test has run.
    link.addEventListener('click', e => { assert.equal(e.defaultPrevented, false); e.preventDefault(); }, { once: true });
    link.dispatchEvent(event);
  }
  assert.equal(doc.querySelector('#experience > details').open, false);
  assert.equal(scrolls.length, 0);
});

test('reduced motion disables animated navigation', t => {
  const { nav, scrolls } = setup(t, { reduced: true });
  nav.querySelector('a[href="#awards"]').click();
  assert.equal(scrolls[0].behavior, 'auto');
});

test('compact menu closes with Escape, outside click and resize', t => {
  const { window, doc, nav, toggle } = setup(t, { compact: true });
  toggle.click();
  nav.querySelector('a').focus();
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(nav.hasAttribute('data-expanded'), false);
  assert.equal(doc.activeElement, toggle);
  toggle.click();
  doc.querySelector('h1').click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  toggle.click();
  window.dispatchEvent(new window.Event('resize'));
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('scroll events are coalesced into one animation frame', t => {
  const { window, frames, flush } = setup(t);
  for (let i = 0; i < 10; i++) window.dispatchEvent(new window.Event('scroll'));
  assert.equal(frames.size, 1);
  flush();
  assert.equal(frames.size, 0);
});

test('pages without a table of contents remain unaffected', t => {
  const dom = new JSDOM('<main>Other page</main>', { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  assert.doesNotThrow(() => dom.window.eval(read('assets/js/page-toc.js')));
});

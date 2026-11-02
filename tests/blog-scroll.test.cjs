const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

async function editor() {
  const dom = new JSDOM(read('blog.html'), { url: 'https://local.test/blog.html#write', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.scrollTo = () => {};
  window.fetch = async () => ({ ok: true, status: 200, text: async () => '[]' });
  window.localStorage.setItem('jongwon-blog-session', JSON.stringify({ access_token: 'test-only', expires_at: Date.now() / 1000 + 3600 }));
  window.localStorage.setItem('jongwon-blog-draft-v1:new', JSON.stringify({ title: 'Scroll test', body: '# Heading\n\nA paragraph.', savedAt: Date.now() }));
  for (const script of ['assets/vendor/marked/marked.umd.js', 'assets/vendor/dompurify/purify.min.js', 'assets/vendor/katex/katex.min.js', 'assets/js/blog-markdown.js', 'assets/js/blog.js']) window.eval(read(script));
  await new Promise(resolve => setTimeout(resolve, 0));
  const source = window.document.querySelector('#post-body');
  const preview = window.document.querySelector('[data-editor-preview-panel]');
  const dimensions = { source: 1200, preview: 2700 };
  for (const [name, element] of Object.entries({ source, preview })) {
    Object.defineProperty(element, 'scrollHeight', { get: () => dimensions[name] });
    Object.defineProperty(element, 'clientHeight', { get: () => 200 });
  }
  const mode = name => window.document.querySelector(`[data-editor-mode="${name}"]`).click();
  const scroll = (element, top) => { element.scrollTop = top; element.dispatchEvent(new window.Event('scroll')); };
  mode('split');
  return { window, source, preview, dimensions, mode, scroll, close: () => window.close() };
}

test('Split follows either pane at the middle, start, and end of unequal scroll ranges', async () => {
  const app = await editor();
  try {
    const { source, preview, scroll } = app;
    scroll(source, 400);
    assert.equal(preview.scrollTop, 1000);
    // Browsers deliver a separate event for the position applied to the other pane.
    preview.dispatchEvent(new app.window.Event('scroll'));
    assert.equal(source.scrollTop, 400);
    scroll(preview, 1500);
    assert.equal(source.scrollTop, 600);
    source.dispatchEvent(new app.window.Event('scroll'));
    scroll(source, 1000);
    assert.equal(preview.scrollTop, 2500);
    scroll(preview, 0);
    assert.equal(source.scrollTop, 0);
  } finally { app.close(); }
});

test('Split stays aligned after editing changes the rendered preview height', async () => {
  const app = await editor();
  try {
    app.scroll(app.preview, 1500);
    assert.equal(app.source.scrollTop, 600);
    app.dimensions.preview = 4200;
    app.source.value += '\n\n## Another section\n\nMore text.';
    app.source.dispatchEvent(new app.window.Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(app.source.scrollTop, 600);
    assert.equal(app.preview.scrollTop, 2400);
    assert.equal(app.preview.querySelector('h2').textContent, 'Another section');
    app.preview.dispatchEvent(new app.window.Event('scroll'));
    assert.equal(app.source.scrollTop, 600);
  } finally { app.close(); }
});

test('single-pane modes scroll independently and short content stays at the top', async () => {
  const app = await editor();
  try {
    app.scroll(app.source, 400);
    app.mode('source');
    app.scroll(app.source, 800);
    assert.equal(app.preview.scrollTop, 1000);
    app.mode('preview');
    app.scroll(app.preview, 2000);
    assert.equal(app.source.scrollTop, 800);
    app.mode('split');
    assert.equal(app.preview.scrollTop, 2000);
    app.dimensions.source = 200;
    app.scroll(app.source, 0);
    assert.equal(app.preview.scrollTop, 0);
    app.dimensions.preview = 200;
    app.dimensions.source = 1200;
    app.scroll(app.source, 500);
    assert.equal(app.preview.scrollTop, 0);
  } finally { app.close(); }
});

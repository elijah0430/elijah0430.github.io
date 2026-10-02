const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const scripts = ['assets/vendor/marked/marked.umd.js', 'assets/vendor/dompurify/purify.min.js', 'assets/vendor/katex/katex.min.js', 'assets/js/blog-markdown.js'].map(read);

function renderer() {
  const dom = new JSDOM('<!doctype html><div id="output"></div>', { runScripts: 'outside-only' });
  scripts.forEach((script) => dom.window.eval(script));
  const node = dom.window.document.getElementById('output');
  return { dom, node, render: (source) => dom.window.BlogMarkdown.render(node, source) };
}

test('renders Markdown and math without consuming LaTeX underscores or matrix breaks', () => {
  const { dom, node, render } = renderer();
  const result = render(String.raw`## Notes

**Bold**, $x_i^2$, and \(\theta\).

$$
\begin{aligned}
a &= \frac{1}{n}\sum_{i=1}^{n} x_i \\
b &= \begin{bmatrix} a & b \\ c & d \end{bmatrix}
\end{aligned}
$$

\[ \mathbb{E}_{x \sim p}[f(x)] \]

- An item with $\alpha$.
`);
  assert.equal(result.mathErrors, 0);
  assert.equal(node.querySelectorAll('.katex').length, 5);
  assert.equal(node.querySelectorAll('.katex-display').length, 2);
  assert.equal(node.querySelector('strong').textContent, 'Bold');
  assert.equal(node.querySelector('h2').textContent, 'Notes');
  dom.window.close();
});

test('keeps math delimiters in code and ordinary dollar amounts literal', () => {
  const { dom, node, render } = renderer();
  render('`$x$`\n\n```tex\n$$x_i$$\n```\n\nCosts $10 and $20. Escaped: \\$5.');
  assert.equal(node.querySelectorAll('.katex').length, 0);
  assert.equal(node.querySelector('pre code').textContent.trim(), '$$x_i$$');
  assert.match(node.textContent, /Costs \$10 and \$20/);
  dom.window.close();
});

test('does not execute HTML, unsafe links, or trusted KaTeX commands', () => {
  const { dom, node, render } = renderer();
  render('<img src=x onerror="alert(1)"><script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n$\\href{javascript:alert(1)}{click}$\n\n$\\htmlClass{evil}{x}$');
  assert.equal(node.querySelector('script, [onerror], .evil'), null);
  assert.equal(node.querySelector('a[href^="javascript:"]'), null);
  assert.equal(node.querySelector('img'), null);
  dom.window.close();
});

test('shows invalid math as editable text and preserves surrounding writing', () => {
  const { dom, node, render } = renderer();
  const result = render('Before\n\n$$\\frac{a$$\n\nAfter');
  assert.equal(result.mathErrors, 1);
  assert.equal(node.querySelector('.math-error').textContent, '\\frac{a');
  assert.match(node.textContent, /Before/);
  assert.match(node.textContent, /After/);
  dom.window.close();
});

const session = { access_token: 'local-test-only', refresh_token: 'local-test-refresh', expires_at: Date.now() / 1000 + 3600 };
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(setImmediate); };

async function editor({ saved = {}, hash = '', posts = [], storageFailure = false } = {}) {
  const dom = new JSDOM(read('blog.html'), { url: `https://blog.test/blog.html${hash}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.scrollTo = () => {};
  window.matchMedia = () => ({ matches: false });
  window.localStorage.setItem('jongwon-blog-session', JSON.stringify(session));
  Object.entries(saved).forEach(([key, value]) => window.localStorage.setItem(key, value));
  if (storageFailure) window.Storage.prototype.setItem = () => { throw new Error('quota'); };
  const calls = [];
  window.fetch = async (url, options = {}) => {
    calls.push({ url, ...options });
    let data = url.includes('blog_comments') ? [] : posts;
    if (url.includes('grant_type=refresh_token')) data = { ...session, expires_in: 3600 };
    if (options.method === 'POST' && url.includes('/blog_posts')) {
      data = [{ ...JSON.parse(options.body), id: 'test-post', published_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
      posts.push(...data);
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(data) };
  };
  scripts.forEach((script) => window.eval(script));
  window.eval(read('assets/js/blog.js'));
  await flush();
  const form = window.document.querySelector('[data-blog-editor-form]');
  function type(field, value) {
    form.elements.namedItem(field).value = value;
    form.elements.namedItem(field).dispatchEvent(new window.Event('input', { bubbles: true }));
  }
  return { dom, window, form, calls, type };
}

test('automatically saves all fields privately after typing, and reload restores editor and draft', async () => {
  const first = await editor({ hash: '#write' });
  first.type('title', 'A Korean note 한글');
  first.type('summary', 'A summary');
  first.type('body', 'An equation $x_i$');
  await new Promise((resolve) => setTimeout(resolve, 750));
  const draft = first.window.localStorage.getItem('jongwon-blog-draft-v1:new');
  assert.equal(JSON.parse(draft).body, 'An equation $x_i$');
  assert.equal(first.calls.filter((call) => call.method === 'POST').length, 0);
  assert.match(first.window.document.querySelector('[data-draft-status]').textContent, /Saved/);
  first.dom.window.close();
  const next = await editor({ hash: '#write', saved: { 'jongwon-blog-draft-v1:new': draft } });
  assert.equal(next.form.elements.title.value, 'A Korean note 한글');
  assert.equal(next.form.elements.summary.value, 'A summary');
  assert.equal(next.form.elements.body.value, 'An equation $x_i$');
  assert.equal(next.window.document.querySelector('[data-blog-editor]').hidden, false);
  next.dom.window.close();
});

test('flushes unsaved typing on pagehide and isolates edit drafts from new posts', async () => {
  const post = { id: 'existing', slug: 'existing', title: 'Existing', body: 'Original', published_at: '2026-01-01', updated_at: '2026-01-01' };
  const app = await editor({ hash: '#edit/existing', posts: [post] });
  app.type('body', 'Edited $a$');
  app.window.dispatchEvent(new app.window.Event('pagehide'));
  assert.equal(JSON.parse(app.window.localStorage.getItem('jongwon-blog-draft-v1:existing')).body, 'Edited $a$');
  assert.equal(app.window.localStorage.getItem('jongwon-blog-draft-v1:new'), null);
  app.dom.window.close();
});

test('refreshes expired authentication and keeps the saved draft', async () => {
  const draft = JSON.stringify({ title: 'Recovered', summary: '', body: 'Draft text', savedAt: Date.now() });
  const app = await editor({ hash: '#write', saved: {
    'jongwon-blog-session': JSON.stringify({ ...session, expires_at: 1 }),
    'jongwon-blog-draft-v1:new': draft,
  } });
  assert.equal(app.form.elements.title.value, 'Recovered');
  assert.equal(app.calls.filter((call) => call.url.includes('grant_type=refresh_token')).length, 1);
  app.dom.window.close();
});

test('returning from a restored edit opens the original post and retains its draft', async () => {
  const post = { id: 'existing', slug: 'existing', title: 'Existing', body: 'Original', published_at: '2026-01-01', updated_at: '2026-01-01' };
  const app = await editor({ hash: '#edit/existing', posts: [post] });
  app.type('body', 'Unpublished revision');
  app.window.document.querySelector('[data-editor-cancel]').click();
  await flush();
  assert.equal(app.window.location.hash, '#post/existing');
  assert.equal(JSON.parse(app.window.localStorage.getItem('jongwon-blog-draft-v1:existing')).body, 'Unpublished revision');
  assert.equal(app.window.document.querySelector('[data-blog-post-body]').textContent.trim(), 'Original');
  app.dom.window.close();
});

test('reports unavailable storage instead of claiming the draft was saved', async () => {
  const app = await editor({ hash: '#write', storageFailure: true });
  app.type('body', 'Do not lose this');
  const unload = new app.window.Event('beforeunload', { cancelable: true });
  app.window.dispatchEvent(unload);
  assert.match(app.window.document.querySelector('[data-draft-status]').textContent, /Autosave unavailable/);
  assert.equal(unload.defaultPrevented, true);
  assert.equal(app.form.elements.body.value, 'Do not lose this');
  app.dom.window.close();
});

test('publishes only on submission, preserves source, and removes the published draft', async () => {
  const app = await editor({ hash: '#write' });
  app.type('title', 'Published test');
  app.type('body', '## Hello\n\n$$x_i^2$$');
  app.form.dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  const saves = app.calls.filter((call) => call.method === 'POST' && call.url.includes('/blog_posts'));
  assert.equal(saves.length, 1);
  assert.equal(JSON.parse(saves[0].body).body, '## Hello\n\n$$x_i^2$$');
  assert.equal(app.window.localStorage.getItem('jongwon-blog-draft-v1:new'), null);
  assert.equal(app.window.document.querySelector('[data-blog-post-view]').hidden, false);
  assert.equal(app.window.document.querySelectorAll('[data-blog-post-body] .katex').length, 1);
  app.dom.window.close();
});

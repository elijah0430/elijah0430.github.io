const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const scripts = ['assets/vendor/marked/marked.umd.js', 'assets/vendor/dompurify/purify.min.js', 'assets/vendor/katex/katex.min.js', 'assets/js/blog-markdown.js', 'assets/js/blog-editor.js'].map(read);
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(setImmediate); };

function setup() {
  const dom = new JSDOM('<!doctype html><div id="editor"></div><div id="rendered"></div>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.scrollTo = () => {};
  window.Range.prototype.getClientRects = () => [];
  window.Range.prototype.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
  scripts.forEach(script => window.eval(script));
  let source = '';
  const api = window.BlogEditor.create({ element: window.document.querySelector('#editor'),
    onChange: value => { source = value; }, onEquation() {}, onError: error => { throw error; } });
  const rendered = window.document.querySelector('#rendered');
  return { dom, window, api, rendered, get source() { return source; },
    render() { window.BlogMarkdown.render(rendered, api.editor.getMarkdown()); return rendered; },
    close() { api.destroy(); window.close(); } };
}

const toggleSource = String.raw`Before

::::toggle Derivation

Hidden **content** and $x_i$.

:::toggle Nested

$$
\begin{bmatrix} a & b \\ c & d \end{bmatrix}
$$

:::

::::

After`;

test('loads and round-trips nested editable toggles with math', () => {
  const app = setup();
  app.api.load(toggleSource);
  assert.equal(app.window.document.querySelectorAll('[data-type="details"]').length, 2);
  assert.equal(app.window.document.querySelectorAll('.editor-math').length, 2);
  const result = app.render();
  assert.equal(result.querySelectorAll('details').length, 2);
  assert.equal(result.querySelector('summary').textContent, 'Derivation');
  assert.equal(result.querySelectorAll('.katex').length, 2);
  assert.match(result.textContent, /Hidden content/);
  assert.match(result.textContent, /Before/);
  assert.match(result.textContent, /After/);
  const roundTrip = app.api.editor.getMarkdown();
  app.api.load(roundTrip);
  assert.equal(app.api.editor.getMarkdown(), roundTrip);
  app.close();
});

test('folds while editing without dropping hidden text and can unwrap with undo', () => {
  const app = setup();
  app.api.load('Preserve this paragraph.');
  app.api.editor.commands.setTextSelection(2);
  app.api.toggle();
  assert.equal(app.api.editor.getJSON().content[0].type, 'details');
  assert.match(app.source, /Preserve this paragraph/);
  const button = app.window.document.querySelector('[data-type="details"] > button');
  button.click();
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.match(app.source, /Preserve this paragraph/);
  button.click();
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  app.api.editor.commands.setTextSelection(2);
  app.api.unwrap();
  assert.equal(app.api.editor.getJSON().content.some(node => node.type === 'details'), false);
  assert.match(app.source, /Preserve this paragraph/);
  app.api.format('undo');
  assert.equal(app.api.editor.getJSON().content[0].type, 'details');
  app.close();
});

test('imports legacy Markdown tables, lists, code and math safely', () => {
  const app = setup();
  app.api.load(String.raw`# Heading

**bold** and *italic* and \(x_i\).

| A | B |
| - | - |
| one | two |

- First
- Second

~~~tex
$literal$
~~~

<img src=x onerror=alert(1)>

[bad](javascript:alert(1))`);
  const result = app.render();
  assert.equal(result.querySelectorAll('.katex').length, 1);
  assert.equal(result.querySelectorAll('table').length, 1);
  assert.match(result.querySelector('pre code').textContent, /\$literal\$/);
  assert.equal(result.querySelector('script, [onerror], a[href^="javascript:"], img'), null);
  assert.equal(result.querySelector('h1').textContent, 'Heading');
  app.close();
});

test('toggle-like code stays code and unfinished toggles keep their text', () => {
  const app = setup();
  const source = ':::toggle Outer\n\n```md\n:::toggle Not real\n::: \n```\n\nContent\n\n:::\n\n:::toggle Unfinished\nKeep this';
  app.window.BlogMarkdown.render(app.rendered, source);
  assert.equal(app.rendered.querySelectorAll('details').length, 1);
  assert.match(app.rendered.querySelector('pre').textContent, /Not real/);
  assert.match(app.rendered.textContent, /Unfinished/);
  assert.match(app.rendered.textContent, /Keep this/);
  app.close();
});

test('new equations are editable and Markdown serialization keeps LaTeX', () => {
  const app = setup();
  app.api.load('Math: ');
  app.api.editor.commands.setTextSelection(7);
  app.api.equation('x_i^2', false);
  assert.match(app.source, /\$x_i\^2\$/);
  let position;
  app.api.editor.state.doc.descendants((node, pos) => { if (node.type.name === 'inlineMath') position = pos; });
  app.api.equation('\\frac{a}{b}', false, position);
  assert.match(app.source, /\\frac\{a\}\{b\}/);
  assert.equal(app.render().querySelectorAll('.katex').length, 1);
  app.close();
});

test('loading a different post clears undo history', () => {
  const app = setup();
  app.api.load('First post');
  app.api.editor.commands.insertContent('Unsaved first post');
  app.api.load('Second post');
  app.api.format('undo');
  assert.equal(app.api.editor.getText(), 'Second post');
  app.close();
});

test('toggle titles retain formatting and math without allowing raw HTML', () => {
  const app = setup();
  app.api.load(':::toggle **Important** $x^2$ <img src=x onerror=alert(1)>\n\nDetails.\n\n:::');
  const result = app.render();
  assert.equal(result.querySelector('summary strong').textContent, 'Important');
  assert.equal(result.querySelectorAll('summary .katex').length, 1);
  assert.equal(result.querySelector('img, [onerror]'), null);
  assert.match(result.querySelector('summary').textContent, /<img/);
  app.close();
});

test('returning to unchanged Write mode preserves undo history', () => {
  const app = setup();
  app.api.load('Original');
  app.api.editor.commands.insertContent('Added ');
  const source = app.source;
  app.api.load(source);
  app.api.format('undo');
  assert.equal(app.api.editor.getText(), 'Original');
  app.close();
});

test('checklist states survive direct editing and Markdown round trips', () => {
  const app = setup();
  app.api.load('- [x] Finished\n- [ ] Pending\n- Ordinary bullet');
  const source = app.api.editor.getMarkdown();
  assert.match(source, /\[x\] Finished/);
  assert.match(source, /\[ \] Pending/);
  assert.doesNotMatch(source, /\[ \] Ordinary/);
  app.api.load(source);
  assert.equal(app.api.editor.getMarkdown(), source);
  app.close();
});

test('can continue outside a toggle without losing the folded content', () => {
  const app = setup();
  app.api.load(':::toggle Title\n\nBody stays here.\n\n:::');
  app.api.editor.commands.setTextSelection(2);
  app.api.exitToggle();
  app.api.editor.commands.insertContent('Outside');
  const result = app.render();
  assert.match(result.querySelector('details').textContent, /Body stays here/);
  assert.doesNotMatch(result.querySelector('details').textContent, /Outside/);
  assert.match(result.textContent, /Outside/);
  app.close();
});

test('footnotes number by reference order and round-trip rich text, math, and unused definitions', () => {
  const app = setup();
  app.api.load('First[^b], then[^a], again[^b].\n\n[^a]: **Second** with $x_i$.\n\n[^b]: First line\n    continued\n\n    Another paragraph.\n\n[^unused]: Keep this for later.');
  assert.deepEqual([...app.window.document.querySelectorAll('.editor-footnote-ref')].map(ref => ref.textContent), ['1', '2', '1']);
  assert.equal(app.window.document.querySelectorAll('.editor-unused-footnote').length, 1);
  const source = app.api.editor.getMarkdown();
  assert.match(source, /\[\^unused\]: Keep this for later/);
  assert.equal((source.match(/\[\^b\]:/g) || []).length, 1);
  app.api.load(source, true);
  assert.equal(app.api.editor.getMarkdown(), source);
  const result = app.render();
  assert.equal(result.querySelectorAll('.blog-footnotes li').length, 2);
  assert.match(result.querySelector('[data-blog-note="1"]').textContent, /First line\s*continued\s*Another paragraph/);
  assert.equal(result.querySelector('[data-blog-note="2"] strong').textContent, 'Second');
  assert.equal(result.querySelectorAll('.blog-footnotes .katex').length, 1);
  assert.equal(result.querySelectorAll('[data-blog-note="1"] .footnote-backlink').length, 2);
  app.close();
});

test('footnote navigation leaves the blog route intact and opens folded return targets', () => {
  const app = setup();
  app.window.HTMLElement.prototype.scrollIntoView = () => {};
  app.window.BlogMarkdown.render(app.rendered, ':::toggle Hidden\n\nText[^one].\n\n:::\n\n[^one]: Note with [source](https://example.com).');
  const originalLocation = app.window.location.href;
  const ref = app.rendered.querySelector('.blog-footnote-ref a');
  const note = app.rendered.querySelector('[data-blog-note]');
  assert.equal(ref.hash, '#' + note.id);
  ref.click();
  assert.equal(app.window.document.activeElement, note);
  app.rendered.querySelector('.footnote-backlink').click();
  assert.equal(app.rendered.querySelector('details').open, true);
  assert.equal(app.window.document.activeElement, ref);
  assert.equal(app.window.location.href, originalLocation);
  const other = app.window.document.createElement('div');
  app.window.document.body.append(other);
  app.window.BlogMarkdown.render(other, 'Other[^one].\n\n[^one]: Different note.');
  assert.notEqual(other.querySelector('[data-blog-note]').id, note.id);
  app.close();
});

test('footnotes respect code, escaped references, missing definitions, and HTML safety', () => {
  const app = setup();
  app.window.BlogMarkdown.render(app.rendered, 'Code `[^a]`, escaped \\[^a], missing[^missing].\n\n```md\n[^example]: Not a definition\n```\n\nReal[^a].\n\n[^a]: <img src=x onerror=alert(1)> [bad](javascript:alert(1))');
  assert.equal(app.rendered.querySelectorAll('.blog-footnote-ref').length, 1);
  assert.match(app.rendered.textContent, /missing\[\^missing\]/);
  assert.match(app.rendered.querySelector('code').textContent, /\[\^a\]/);
  assert.match(app.rendered.querySelector('pre').textContent, /Not a definition/);
  assert.equal(app.rendered.querySelector('img, script, [onerror], a[href^="javascript:"]'), null);
  app.close();
});

test('adding, editing, removing, and undoing footnotes preserves the surrounding text', () => {
  const app = setup();
  app.api.load('Original text');
  app.api.editor.commands.setTextSelection({ from: 1, to: 9 });
  app.api.footnote('First note.');
  assert.match(app.source, /Original\[\^note-1\] text/);
  app.api.editor.commands.setTextSelection(1);
  app.api.footnote('Earlier note.');
  assert.deepEqual([...app.window.document.querySelectorAll('.editor-footnote-ref')].map(ref => ref.textContent), ['1', '2']);
  let pos;
  app.api.editor.state.doc.descendants((node, at) => { if (node.type.name === 'footnote' && node.attrs.id === 'note-1') pos = at; });
  app.api.footnote('Updated $x_i$.', pos);
  assert.match(app.source, /\[\^note-1\]: Updated \$x_i\$\./);
  app.api.removeFootnote(1);
  assert.doesNotMatch(app.source, /Earlier note/);
  assert.equal(app.window.document.querySelector('.editor-footnote-ref').textContent, '1');
  app.api.format('undo');
  assert.match(app.source, /Earlier note/);
  assert.equal(app.window.document.querySelectorAll('.editor-footnote-ref').length, 2);
  app.close();
});

test('editing a reused footnote updates every occurrence with one definition', () => {
  const app = setup();
  app.api.load('One[^a], two[^a].\n\n[^a]: Original note.');
  let pos;
  app.api.editor.state.doc.descendants((node, at) => { if (node.type.name === 'footnote') pos = at; });
  app.api.footnote('Changed.', pos);
  const bodies = [];
  app.api.editor.state.doc.descendants(node => { if (node.type.name === 'footnote') bodies.push(node.attrs.body); });
  assert.deepEqual(bodies, ['Changed.', 'Changed.']);
  assert.equal((app.source.match(/\[\^a\]: Changed\./g) || []).length, 1);
  app.close();
});

test('full app autosaves rich toggles, restores them, and publishes only explicitly', async () => {
  const dom = new JSDOM(read('blog.html'), { url: 'https://local.test/blog.html#write', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.scrollTo = () => {};
  window.matchMedia = () => ({ matches: false });
  window.Range.prototype.getClientRects = () => [];
  window.Range.prototype.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  window.localStorage.setItem('jongwon-blog-session', JSON.stringify({ access_token: 'test-only', expires_at: Date.now() / 1000 + 3600 }));
  window.localStorage.setItem('jongwon-blog-draft-v1:new', JSON.stringify({ title: 'Restored', summary: '', body: toggleSource, savedAt: Date.now() }));
  const calls = [];
  const posts = [];
  window.fetch = async (url, options = {}) => {
    calls.push({ url, ...options });
    let data = url.includes('blog_comments') ? [] : posts;
    if (options.method === 'POST') { data = [{ ...JSON.parse(options.body), id: 'test', updated_at: new Date().toISOString() }]; posts.push(...data); }
    return { ok: true, status: 200, text: async () => JSON.stringify(data) };
  };
  scripts.forEach(script => window.eval(script));
  const create = window.BlogEditor.create;
  let api;
  window.BlogEditor = { create(options) { api = create(options); return api; } };
  window.eval(read('assets/js/blog.js'));
  await flush();
  assert.equal(window.document.querySelector('[data-editor-workspace]').dataset.mode, 'write');
  assert.equal(window.document.querySelectorAll('[data-type="details"]').length, 2);
  // Opening an existing draft must not normalize/overwrite its original source.
  assert.equal(window.document.querySelector('#post-body').value, toggleSource);
  api.editor.commands.insertContent('한글 입력 ');
  window.document.querySelector('[data-insert-footnote]').click();
  window.document.querySelector('[data-footnote-input]').value = '설명과 $x_i$.';
  window.document.querySelector('[data-footnote-form]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(window.document.querySelector('[data-footnote-dialog]').open, false);
  await new Promise(resolve => setTimeout(resolve, 750));
  const draft = JSON.parse(window.localStorage.getItem('jongwon-blog-draft-v1:new'));
  assert.match(draft.body, /한글 입력/);
  assert.match(draft.body, /Hidden/);
  assert.match(draft.body, /\[\^note-1\]: 설명과 \$x_i\$\./);
  assert.equal(calls.filter(call => call.method === 'POST').length, 0);
  window.document.querySelector('[data-editor-mode="source"]').click();
  window.document.querySelector('[data-editor-mode="write"]').click();
  assert.equal(window.document.querySelectorAll('[data-type="details"]').length, 2);
  assert.equal(window.document.querySelectorAll('.editor-footnote-ref').length, 1);
  window.document.querySelector('[data-blog-editor-form]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  const saves = calls.filter(call => call.method === 'POST');
  assert.equal(saves.length, 1);
  assert.match(JSON.parse(saves[0].body).body, /Hidden/);
  assert.equal(window.document.querySelectorAll('[data-blog-post-body] details').length, 2);
  assert.equal(window.document.querySelectorAll('[data-blog-post-body] .blog-footnotes li').length, 1);
  assert.equal(window.localStorage.getItem('jongwon-blog-draft-v1:new'), null);
  api.destroy(); window.close();
});

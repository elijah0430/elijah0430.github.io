const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const storageKey = 'jongwon-blog-editor-layout-v1';

function setup({ saved, width = 1400, storageFailure = false } = {}) {
  const dom = new JSDOM(read('blog.html'), { url: 'https://layout.test', runScripts: 'outside-only' });
  const { window } = dom;
  window.innerWidth = width;
  if (saved) window.localStorage.setItem(storageKey, saved);
  if (storageFailure) {
    window.Storage.prototype.getItem = () => { throw new Error('blocked'); };
    window.Storage.prototype.setItem = () => { throw new Error('blocked'); };
  }
  const doc = window.document;
  const app = doc.querySelector('[data-blog-app]');
  const workspace = doc.querySelector('[data-editor-workspace]');
  workspace.dataset.mode = 'split';
  workspace.getBoundingClientRect = () => ({ left: 100, width: 1000, height: parseFloat(workspace.style.height) || 480 });
  doc.querySelector('#post-body').value = 'Keep **Markdown** and $x_i$.';
  window.eval(read('assets/js/blog-layout.js'));
  const layout = window.BlogLayout.create({ app, workspace });
  const select = attr => doc.querySelector(`[data-${attr}]`);
  const input = (attr, value) => {
    select(attr).value = String(value);
    select(attr).dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  const key = (attr, key, shiftKey = false) => select(attr).dispatchEvent(new window.KeyboardEvent('keydown', { key, shiftKey, cancelable: true }));
  const pointer = (target, type, x, y, id = 1) => {
    const event = new window.MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pointerId', { value: id });
    target.dispatchEvent(event);
  };
  return { window, doc, app, workspace, layout, select, input, key, pointer, saved: () => JSON.parse(window.localStorage.getItem(storageKey)) };
}

test('sliders resize, persist preferences separately, and reset without touching writing', () => {
  const app = setup();
  app.input('editor-width', 1300);
  app.input('editor-height', 800);
  assert.equal(app.app.style.getPropertyValue('--editor-page-width'), '1300px');
  assert.equal(app.app.hasAttribute('data-custom-width'), true);
  assert.equal(app.workspace.style.height, '800px');
  assert.equal(app.select('editor-height-handle').getAttribute('aria-valuenow'), '800');
  assert.deepEqual(app.saved(), { width: 1300, height: 800, split: 50 });
  assert.equal(app.doc.querySelector('#post-body').value, 'Keep **Markdown** and $x_i$.');
  assert.equal(app.window.localStorage.length, 1);
  app.select('editor-size-reset').click();
  assert.equal(app.workspace.style.height, '');
  assert.equal(app.workspace.hasAttribute('data-custom-height'), false);
  assert.equal(app.app.hasAttribute('data-custom-width'), false);
  assert.equal(app.select('editor-height-value').textContent, 'Auto');
  assert.deepEqual(app.saved(), { width: null, height: null, split: 50 });
  app.window.close();
});

test('pointer resizing clamps bounds, ignores other pointers, and cleans up on cancel or blur', () => {
  const app = setup();
  app.pointer(app.select('editor-divider'), 'pointerdown', 600, 400);
  app.pointer(app.doc, 'pointermove', 700, 400, 2);
  assert.equal(app.workspace.style.getPropertyValue('--editor-left'), '50fr');
  app.pointer(app.doc, 'pointermove', 700, 400);
  assert.equal(app.workspace.style.getPropertyValue('--editor-left'), '60fr');
  assert.equal(app.workspace.style.getPropertyValue('--editor-right'), '40fr');
  app.pointer(app.doc, 'pointermove', 3000, 400);
  app.pointer(app.doc, 'pointercancel', 3000, 400);
  assert.equal(app.saved().split, 75);
  assert.equal(app.doc.documentElement.classList.contains('editor-resizing'), false);
  app.pointer(app.select('editor-height-handle'), 'pointerdown', 600, 700);
  app.pointer(app.doc, 'pointermove', 600, 820);
  assert.equal(app.workspace.style.height, '600px');
  app.window.dispatchEvent(new app.window.Event('blur'));
  assert.equal(app.saved().height, 600);
  assert.equal(app.select('editor-height-handle').classList.contains('is-resizing'), false);
  app.pointer(app.doc, 'pointermove', 600, 2000);
  assert.equal(app.workspace.style.height, '600px');
  app.window.close();
});

test('keyboard resizing and double-click reset work on both handles', () => {
  const app = setup();
  app.key('editor-divider', 'ArrowLeft');
  assert.equal(app.saved().split, 48);
  app.key('editor-divider', 'ArrowRight', true);
  assert.equal(app.saved().split, 58);
  app.key('editor-divider', 'Home');
  assert.equal(app.saved().split, 25);
  app.key('editor-height-handle', 'ArrowDown');
  assert.equal(app.saved().height, 520);
  app.key('editor-height-handle', 'End');
  assert.equal(app.saved().height, 1600);
  app.key('editor-height-handle', 'Home');
  assert.equal(app.saved().height, 320);
  for (const name of ['editor-divider', 'editor-height-handle']) app.select(name).dispatchEvent(new app.window.MouseEvent('dblclick'));
  assert.equal(app.saved().split, 50);
  assert.equal(app.saved().height, null);
  app.window.close();
});

test('saved dimensions survive modes and mobile clamping without overwriting desktop preferences', () => {
  const app = setup({ saved: JSON.stringify({ width: 1300, height: 400, split: 60 }) });
  app.window.innerWidth = 390;
  app.window.dispatchEvent(new app.window.Event('resize'));
  assert.equal(app.select('editor-divider').hidden, true);
  assert.equal(app.select('editor-width').disabled, true);
  assert.equal(app.select('editor-width').value, '366');
  assert.equal(app.workspace.style.height, '640px');
  assert.equal(app.select('editor-height-handle').getAttribute('aria-valuemin'), '640');
  app.workspace.dataset.mode = 'write';
  app.layout.update();
  assert.equal(app.workspace.style.height, '400px');
  app.window.innerWidth = 1400;
  app.workspace.dataset.mode = 'split';
  app.window.dispatchEvent(new app.window.Event('resize'));
  assert.equal(app.select('editor-divider').hidden, false);
  assert.equal(app.select('editor-width').value, '1300');
  assert.deepEqual(app.saved(), { width: 1300, height: 400, split: 60 });
  app.window.close();
});

test('invalid or unavailable storage cannot break editor resizing', () => {
  for (const options of [{ saved: '{bad' }, { saved: '{"width":"1200","height":{},"split":999}' }, { storageFailure: true }]) {
    const app = setup(options);
    assert.equal(app.app.hasAttribute('data-custom-width'), false);
    assert.equal(app.workspace.style.height, '');
    app.input('editor-height', 700);
    assert.equal(app.workspace.style.height, '700px');
    app.window.close();
  }
});

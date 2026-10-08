const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

function game({ width = 760, height = 360, random = 0.9 } = {}) {
  const root = path.join(__dirname, '..');
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'game.html'), 'utf8'), {
    url: 'http://runner.test/game.html', runScripts: 'outside-only',
  });
  const { window } = dom;
  const doc = window.document;
  const canvas = doc.querySelector('canvas');
  const frameCallbacks = new Map();
  let frameId = 0;
  let time = 0;
  window.matchMedia = () => ({ matches: false });
  window.fetch = async () => ({ ok: true, json: async () => [] });
  window.Math.random = () => random;
  window.requestAnimationFrame = callback => { frameCallbacks.set(++frameId, callback); return frameId; };
  window.cancelAnimationFrame = id => frameCallbacks.delete(id);
  Object.defineProperties(canvas, { clientWidth: { value: width }, clientHeight: { value: height } });
  canvas.getBoundingClientRect = () => ({ width, height });
  const shapes = [];
  const ctx = new Proxy({
    clearRect: () => { shapes.length = 0; },
    fillRect: (x, y, width, height) => shapes.push({ color: ctx.fillStyle, x, y, width, height }),
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  canvas.getContext = () => ctx;
  window.eval(fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8'));
  const select = attr => doc.querySelector(`[data-${attr}]`);
  const step = (frames = 1, frameMs = 1000 / 60) => {
    for (let frame = 0; frame < frames; frame++) {
      time += frameMs;
      const callbacks = [...frameCallbacks.values()];
      frameCallbacks.clear();
      callbacks.forEach(callback => callback(time));
    }
  };
  const key = (type, key) => doc.dispatchEvent(new window.KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
  const pointer = type => select('runner-duck').dispatchEvent(new window.Event(type));
  const ended = () => !select('score-form').hidden;
  const obstacles = () => shapes.filter(shape => shape.color === '#9b4f45');
  return { window, select, step, key, pointer, ended, obstacles, close: () => window.close() };
}

for (const [label, width, height] of [['desktop', 760, 360], ['phone', 360, 240]]) {
  for (const frameMs of [1000 / 60, 1000 / 30]) {
    test(`${label} at ${Math.round(1000 / frameMs)} fps: an overhead obstacle hits a standing kiwi`, () => {
      const app = game({ width, height });
      try {
        app.select('runner-start').click();
        app.step(Math.ceil(5 * 1000 / frameMs), frameMs);
        assert.equal(app.ended(), true, 'The visible head must collide, not pass through the obstacle.');
      } finally { app.close(); }
    });

    test(`${label} at ${Math.round(1000 / frameMs)} fps: holding down clears the same overhead obstacles`, () => {
      const app = game({ width, height });
      try {
        app.select('runner-start').click();
        app.key('keydown', 'ArrowDown');
        app.step(Math.ceil(8 * 1000 / frameMs), frameMs);
        assert.equal(app.ended(), false);
        assert.ok(Number(app.select('runner-distance').textContent) > 100);
      } finally { app.close(); }
    });
  }
}

test('releasing duck underneath an overhead obstacle causes a collision', () => {
  const app = game();
  try {
    app.select('runner-start').click();
    app.pointer('pointerdown');
    for (let frame = 0; frame < 300 && !app.obstacles().some(shape => shape.x < 105 && shape.x + shape.width > 116); frame++) app.step();
    assert.ok(app.obstacles().some(shape => shape.x < 105 && shape.x + shape.width > 116));
    assert.equal(app.ended(), false);
    app.pointer('pointerup');
    app.step();
    assert.equal(app.ended(), true);
  } finally { app.close(); }
});

test('ducking does not bypass a ground obstacle', () => {
  const app = game({ random: 0.4 });
  try {
    app.select('runner-start').click();
    app.pointer('pointerdown');
    app.step(300);
    assert.equal(app.ended(), true);
  } finally { app.close(); }
});

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
  doc.documentElement.style.setProperty('--text', '#202124');
  const canvas = doc.querySelector('[data-runner-canvas]');
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
  doc.querySelectorAll('[data-bird-preview]').forEach(preview => {
    preview.getContext = () => ({ fillRect() {} });
  });
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
  const key = (type, key, options = {}) => (options.target || doc).dispatchEvent(new window.KeyboardEvent(type, { key, bubbles: true, cancelable: true, ...options }));
  const pointer = type => select('runner-duck').dispatchEvent(new window.Event(type));
  const ended = () => !select('score-form').hidden;
  const obstacles = () => shapes.filter(shape => shape.color === '#9b4f45');
  const groundObstacles = () => shapes.filter(shape => shape.color === '#202124');
  const choose = id => doc.querySelector(`[data-runner-bird][value="${id}"]`).click();
  const plumage = { kiwi: '#382d24', sparrow: '#53382d', owl: '#443c54', penguin: '#243b50' };
  const birdTop = id => Math.min(...shapes.filter(shape => shape.color === plumage[id]).map(shape => shape.y));
  const boardColor = () => shapes[0].color;
  return { window, select, step, key, pointer, ended, obstacles, groundObstacles, choose, birdTop, boardColor, close: () => window.close() };
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

test('four accessible bird choices update the preview and start label without starting a run', () => {
  const app = game();
  try {
    const radios = [...app.window.document.querySelectorAll('[data-runner-bird]')];
    assert.deepEqual(radios.map(input => input.value), ['kiwi', 'sparrow', 'owl', 'penguin']);
    assert.ok(radios.every(input => input.type === 'radio' && input.labels.length === 1));
    assert.equal(radios.filter(input => input.checked).length, 1);
    for (const id of ['sparrow', 'owl', 'penguin', 'kiwi']) {
      app.choose(id);
      const name = id[0].toUpperCase() + id.slice(1);
      assert.equal(app.select('runner-bird-name').textContent, name);
      assert.equal(app.select('runner-start').textContent, `Start as ${name}`);
      assert.ok(Number.isFinite(app.birdTop(id)), 'The selected bird is drawn on the board.');
      assert.equal(app.select('runner-picker').disabled, false);
      app.step(20);
      assert.equal(app.select('runner-distance').textContent, '0');
    }
  } finally { app.close(); }
});

for (const id of ['kiwi', 'sparrow', 'owl', 'penguin']) {
  for (const [label, width, height] of [['desktop', 760, 360], ['phone', 360, 240]]) {
    for (const frameMs of [1000 / 60, 1000 / 30]) {
      test(`${id}, ${label}, ${Math.round(1000 / frameMs)} fps: standing collides and ducking clears overheads`, () => {
        for (const duck of [false, true]) {
          const app = game({ width, height });
          try {
            app.choose(id);
            app.select('runner-start').click();
            if (duck) app.key('keydown', 'ArrowDown');
            app.step(Math.ceil(6 * 1000 / frameMs), frameMs);
            assert.equal(app.ended(), !duck);
          } finally { app.close(); }
        }
      });
    }
  }

  test(`${id}: cannot switch during a run, but can switch after game over and restart`, () => {
    const app = game();
    try {
      app.choose(id);
      app.select('runner-start').click();
      assert.equal(app.window.document.activeElement, app.select('runner-canvas'));
      assert.equal(app.select('runner-picker').disabled, true);
      const alternate = id === 'kiwi' ? 'owl' : 'kiwi';
      app.choose(alternate);
      assert.equal(app.window.document.querySelector('[data-runner-bird]:checked').value, id);
      app.step(300);
      assert.equal(app.ended(), true);
      assert.equal(app.select('runner-picker').disabled, false);
      app.choose(alternate);
      app.select('runner-start').click();
      assert.equal(app.ended(), false);
      assert.equal(app.select('runner-score').textContent, '0');
      assert.ok(Number.isFinite(app.birdTop(alternate)));
    } finally { app.close(); }
  });

  for (const width of [320, 760]) {
    for (const frameMs of [1000 / 60, 1000 / 30]) {
      test(`${id}, width ${width}, ${Math.round(1000 / frameMs)} fps: can jump the largest ground block`, () => {
        const app = game({ width, height: width < 600 ? 240 : 360 });
        try {
          app.choose(id);
          app.select('runner-start').click();
          // First obstacle is ground-level, with near-maximum height and width.
          let calls = 0;
          app.window.Math.random = () => ++calls === 1 ? 0.4 : 0.999;
          const jumpAt = id === 'penguin' ? 160 : 180;
          for (let frame = 0; frame < 300 && !app.groundObstacles().some(block => block.x < jumpAt); frame++) app.step(1, frameMs);
          assert.ok(app.groundObstacles().some(block => block.height > 61 && block.width > 39));
          app.key('keydown', ' ');
          for (let frame = 0; frame < 100 && !app.groundObstacles().some(block => block.x + block.width < 85) && !app.ended(); frame++) app.step(1, frameMs);
          assert.equal(app.ended(), false);
          assert.ok(app.groundObstacles().some(block => block.x + block.width < 85));
        } finally { app.close(); }
      });
    }
  }
}

function jumpProfile(id, extraJump = false, options = {}) {
  const app = game(options);
  try {
    app.choose(id);
    app.select('runner-start').click();
    app.step(2);
    const standing = app.birdTop(id);
    app.key('keydown', ' ');
    let highest = standing;
    let flightFrames = 0;
    for (let frame = 0; frame < 100; frame++) {
      if (extraJump && frame === 16) app.key('keydown', ' ');
      app.step();
      const top = app.birdTop(id);
      highest = Math.min(highest, top);
      if (frame > 0 && top >= standing) { flightFrames = frame + 1; break; }
    }
    return { height: standing - highest, flightFrames, highest };
  } finally { app.close(); }
}

test('bird characteristics change actual jump height and airtime', () => {
  const kiwi = jumpProfile('kiwi');
  const sparrow = jumpProfile('sparrow');
  const doubleJump = jumpProfile('sparrow', true);
  const owl = jumpProfile('owl');
  const penguin = jumpProfile('penguin');
  assert.ok(sparrow.height < kiwi.height);
  assert.ok(doubleJump.height > sparrow.height + 20);
  assert.ok(doubleJump.flightFrames > sparrow.flightFrames);
  assert.ok(owl.flightFrames > kiwi.flightFrames);
  assert.ok(penguin.height < kiwi.height);
  assert.ok(penguin.flightFrames < kiwi.flightFrames);
  assert.deepEqual(jumpProfile('kiwi', true), kiwi, 'Kiwi has only one jump.');
  assert.deepEqual(jumpProfile('owl', true), owl, 'Owl has only one jump.');
  assert.deepEqual(jumpProfile('penguin', true), penguin, 'Penguin has only one jump.');
  assert.ok(jumpProfile('sparrow', true, { width: 360, height: 240 }).highest >= 8);
});

test('Sparrow gets exactly one air jump, and held keys do not consume it', () => {
  const app = game();
  try {
    app.choose('sparrow');
    app.select('runner-start').click();
    app.step(2);
    app.key('keydown', ' ');
    app.step(20);
    const nearApex = app.birdTop('sparrow');
    app.key('keydown', ' ', { repeat: true });
    app.step(4);
    assert.ok(app.birdTop('sparrow') >= nearApex, 'Repeating key events do not trigger an air jump.');
    app.key('keydown', ' ');
    app.step(16);
    const secondApex = app.birdTop('sparrow');
    app.key('keydown', ' ');
    app.step(8);
    assert.ok(app.birdTop('sparrow') >= secondApex, 'A third jump must not be possible.');
    app.step(40);
    const grounded = app.birdTop('sparrow');
    app.select('runner-jump').click();
    app.step(5);
    assert.ok(app.birdTop('sparrow') < grounded, 'Landing restores jump availability.');
  } finally { app.close(); }
});

test('touch controls double-jump, drop into a duck, and release on cancellation', () => {
  const app = game();
  try {
    app.choose('sparrow');
    app.select('runner-start').click();
    app.step(2);
    const standing = app.birdTop('sparrow');
    app.select('runner-canvas').dispatchEvent(new app.window.Event('pointerdown'));
    app.step(20);
    const firstApex = app.birdTop('sparrow');
    app.select('runner-jump').click();
    app.step(10);
    assert.ok(app.birdTop('sparrow') < firstApex);
    app.pointer('pointerdown');
    app.step(20);
    assert.ok(app.birdTop('sparrow') > standing, 'Holding duck through landing uses the low pose.');
    app.pointer('pointercancel');
    app.step();
    assert.equal(app.birdTop('sparrow'), standing);
  } finally { app.close(); }
});

test('keyboard users can hold the Duck button, and choosing a bird does not jump', () => {
  const app = game();
  try {
    app.key('keydown', ' ', { target: app.select('runner-bird') });
    assert.equal(app.select('runner-picker').disabled, false);
    app.select('runner-start').click();
    app.step(2);
    const standing = app.birdTop('kiwi');
    app.key('keydown', ' ', { target: app.select('runner-duck') });
    app.step();
    assert.ok(app.birdTop('kiwi') > standing);
    app.key('keyup', ' ', { target: app.select('runner-duck') });
    app.step();
    assert.equal(app.birdTop('kiwi'), standing);
  } finally { app.close(); }
});

test('the idle game board redraws immediately when the color theme changes', () => {
  const app = game();
  try {
    app.window.document.documentElement.style.setProperty('--surface', '#172635');
    app.select('theme-toggle').click();
    assert.equal(app.boardColor(), '#172635');
  } finally { app.close(); }
});

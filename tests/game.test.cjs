const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Run the real game logic with a tiny DOM/canvas stand-in; no browser dependency.
function game({ width = 1280, height = 800 } = {}) {
  const elements = new Map();
  const listeners = {};
  const store = new Map();
  const noop = () => {};
  const context2d = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: noop });
      return noop;
    },
  });
  const document = {
    hidden: false,
    getElementById(id) { return elements.get(id); },
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
  };
  function element(id) {
    return {
      id, hidden: false, style: {}, textContent: '', clientWidth: width, clientHeight: height,
      classList: { add: noop, remove: noop, toggle: noop },
      setAttribute: noop, setPointerCapture: noop, getContext: () => context2d,
      focus() { document.activeElement = this; },
      addEventListener: noop, closest: () => null,
      querySelectorAll: () => [],
    };
  }
  const html = fs.readFileSync(`${__dirname}/../index.html`, 'utf8');
  for (const match of html.matchAll(/id="([^"]+)"/g)) elements.set(match[1], element(match[1]));
  document.body = element('body');
  const window = {
    innerWidth: width, innerHeight: height, devicePixelRatio: 2,
    matchMedia: () => ({ matches: false }),
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
  };
  const sandbox = {
    window, document, navigator: { userAgent: 'test' },
    Image: class { complete = true; naturalWidth = 606; },
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) },
    fetch: async () => ({ json: async () => ({ record: 0 }) }),
    requestAnimationFrame: noop,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(`${__dirname}/../game.js`, 'utf8'), sandbox);
  return {
    run: code => vm.runInContext(code, sandbox), elements, store, window,
    event(name, details = {}) {
      const event = { code: '', repeat: false, preventDefault: noop, target: elements.get('gameCanvas'), ...details };
      for (const listener of listeners[name] || []) listener(event);
    },
  };
}

function settle(g, steps = 240) {
  for (let i = 0; i < steps; i++) g.run('gameTime += 1000 / 60; updatePhysics(1000 / 60);');
}

test('a fully charged opening jump reaches and settles on the first platform', () => {
  const g = game();
  g.run('startRun(); beginCharge(); gameTime += 600; releaseJump();');
  settle(g);
  assert.equal(g.run('currentLandIndex'), 1);
  assert.equal(g.run('figure.grounded'), true);
  assert.equal(g.run('gameOver'), false);
  assert.equal(g.run('consecutiveSafeLandings'), 1);
  assert.equal(g.store.get('slipland_personal'), '1');
});

test('space charges and releases without autorepeat resetting the charge', () => {
  const g = game();
  g.run('startRun();');
  g.event('keydown', { code: 'Space' });
  g.run('gameTime += 600;');
  g.event('keydown', { code: 'Space', repeat: true });
  assert.equal(g.run('getCharge()'), 1);
  g.event('keyup', { code: 'Space' });
  assert.equal(g.run('figure.grounded'), false);
  assert.ok(g.run('figure.vx') > 500);
});

test('pause freezes physics and charge; resuming cannot fire a stale jump', () => {
  const g = game();
  g.run('startRun(); beginCharge(); gameTime += 200; setPaused(true);');
  const x = g.run('figure.x');
  const time = g.run('gameTime');
  g.run('gameLoop(100000);');
  assert.equal(g.run('figure.x'), x);
  assert.equal(g.run('gameTime'), time);
  assert.equal(g.run('isPointerDown'), false);
  g.run('setPaused(false); releaseJump();');
  assert.equal(g.run('figure.grounded'), true);
});

test('large frame gaps are capped and hiding the tab pauses', () => {
  const g = game();
  g.run('startRun(); lastTime = 1; gameLoop(100000);');
  assert.equal(g.run('gameTime'), 50);
  g.event('blur');
  assert.equal(g.run('paused'), true);
});

test('a quick edge save has enough range to cross the gap', () => {
  const g = game();
  g.run(`startRun(); lands[1].friction = 0.55;
    figure.x = lands[0].xEnd - 25;
    figure.teeterState = { edge: 'right', startTime: gameTime };
    beginCharge(); releaseJump();`);
  settle(g);
  assert.equal(g.run('currentLandIndex'), 1);
  assert.equal(g.run('gameOver'), false);
  assert.equal(g.run('figure.grounded'), true);
});

test('the course extends before the player runs out of platforms', () => {
  const g = game();
  g.run(`startRun(); currentLandIndex = 23;
    const next = lands[24]; figure.x = next.xStart + 80;
    figure.y = next.y - FIGURE_RADIUS - 1;
    figure.grounded = false; figure.vx = 0; figure.vy = 100;
    updatePhysics(16);`);
  assert.equal(g.run('currentLandIndex'), 24);
  assert.ok(g.run('lands.length') > 25);
  assert.equal(g.run('lands[25].xStart - lands[24].xEnd'), 140);
});

test('only the initiating pointer can release a jump', () => {
  const g = game();
  g.run(`startRun(); handlePointerDown({button:0, pointerId:1, preventDefault(){}});
    gameTime += 600;
    handlePointerUp({pointerId:2, preventDefault(){}});`);
  assert.equal(g.run('figure.grounded'), true);
  g.run('handlePointerUp({pointerId:1, preventDefault(){}});');
  assert.equal(g.run('figure.grounded'), false);
});

test('cancelling a pointer does not launch; retry resets state and keeps the record', () => {
  const g = game();
  g.run('startRun(); beginCharge(); gameTime += 600; handlePointerCancel(); releaseJump();');
  assert.equal(g.run('figure.grounded'), true);
  g.run('personalRecord = 8; bestLands = 3; currentLandIndex = 3; finishRun();');
  assert.equal(g.elements.get('resultOverlay').hidden, false);
  g.run('startRun();');
  assert.equal(g.run('currentLandIndex'), 0);
  assert.equal(g.run('personalRecord'), 8);
  assert.equal(g.run('gameOver'), false);
  assert.equal(g.elements.get('resultOverlay').hidden, true);
});

test('viewport scaling preserves the arc and shows the next platform on phones', () => {
  for (const [width, height] of [[390, 844], [667, 375], [1440, 900]]) {
    const g = game({ width, height });
    g.run('startRun(); render(); beginCharge(); gameTime += 300; render();');
    assert.ok(g.run('WORLD_WIDTH') >= 850);
    assert.ok(g.run('lands[1].xStart < WORLD_WIDTH'));
    const scale = g.run('getViewMetrics().scale');
    assert.ok(Math.abs(g.run('getViewMetrics().offsetY + lands[0].y * getViewMetrics().scale') - height * 0.74) < 1);
    assert.ok(scale > 0);
  }
});

test('going home resets the title scene and blocks gameplay input', () => {
  const g = game();
  g.run('startRun(); figure.x = 2000; goHome();');
  assert.equal(g.run('cameraX'), 0);
  assert.equal(g.run('beginCharge()'), false);
  assert.equal(g.elements.get('instructionsOverlay').hidden, false);
  assert.equal(g.elements.get('gameHud').hidden, true);
});

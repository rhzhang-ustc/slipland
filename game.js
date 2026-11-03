// Constants - Angry Birds style: fixed angle launch
const GRAVITY = 1200;
const LAUNCH_ANGLE = (45 * Math.PI) / 180; // 45 degrees, Angry Birds style parabola
const MIN_LAUNCH_SPEED = 280;
const MAX_LAUNCH_SPEED = 720;
const MAX_PRESS_MS = 600;
const FIGURE_RADIUS = 20;
const WORLD_HEIGHT = 600;
const PLATFORM_HEIGHT = 30;
const FRICTION_DISPLAY_THRESHOLD = 0.05;
const LAND_WIDTH = 350;
const JUMP_GAP = 140;
const NUM_LANDS = 25;
const PHYSICS_SUBSTEPS = 4; // prevent tunneling through platforms
const VX_DANGER = 300; // horizontal speed threshold for contact quality
const LANDING_EFFECT_MS = 280;
const SKID_MS = 150;
const WOBBLE_AMPLITUDE = 8;
const WOBBLE_FREQ = 0.02;

// Materials: friction, visual, failureStyle, teeterMs, wobbleMultiplier
const MATERIALS = {
  ice: { frictionMin: 0.30, frictionMax: 0.45, lengthBias: 1.0, fill: '#a8d8ea', stroke: '#7eb8d4', texture: 'none', cue: 'sparkle', failureStyle: 'slide', teeterMs: 600, wobbleMultiplier: 1.4, edgeBounceVy: 0.9, edgeBounceVx: 1.0 },
  wood: { frictionMin: 0.40, frictionMax: 0.55, lengthBias: 1.0, fill: '#c4a77d', stroke: '#a08050', texture: 'stripes', cue: 'none', failureStyle: 'tip', teeterMs: 900, wobbleMultiplier: 1.0, edgeBounceVy: 1.0, edgeBounceVx: 1.0 },
  rubber: { frictionMin: 0.78, frictionMax: 0.95, lengthBias: 0.9, fill: '#91a789', stroke: '#657d61', texture: 'dots', cue: 'sheen', failureStyle: 'grip', teeterMs: 1200, wobbleMultiplier: 0.6, edgeBounceVy: 1.3, edgeBounceVx: 1.2 },
  metal: { frictionMin: 0.35, frictionMax: 0.50, lengthBias: 1.0, fill: '#aabcc9', stroke: '#738c9c', texture: 'none', cue: 'none', failureStyle: 'sharp', teeterMs: 700, wobbleMultiplier: 1.1, edgeBounceVy: 0.8, edgeBounceVx: 1.3 },
  sandpaper: { frictionMin: 0.80, frictionMax: 0.95, lengthBias: 0.67, fill: '#8b7355', stroke: '#6b5340', texture: 'dots', cue: 'dust', failureStyle: 'grip', teeterMs: 1100, wobbleMultiplier: 0.8, edgeBounceVy: 1.1, edgeBounceVx: 1.0 },
  plastic: { frictionMin: 0.50, frictionMax: 0.65, lengthBias: 0.95, fill: '#ddd18e', stroke: '#ad9f58', texture: 'none', cue: 'none', failureStyle: 'bounce', teeterMs: 850, wobbleMultiplier: 1.2, edgeBounceVy: 1.2, edgeBounceVx: 1.1 },
};
const MATERIAL_NAMES = Object.keys(MATERIALS);
const MATERIAL_HINTS = { ice: 'Slippery!', rubber: 'Stable!' };

// World record: set to your Firebase Realtime Database URL (e.g. https://PROJECT-default-rtdb.firebaseio.com) for live sync
const FIREBASE_DB_URL = '';
const HINT_DISPLAY_MS = 1800;

// Audio - material-specific landing sounds. iOS Safari doesn't support OGG; use MP3 fallbacks.
const _ogg = { rubber: 'sounds/rubber.ogg', wood: 'sounds/wood.ogg', plastic: 'sounds/plastic.ogg' };
const _mp3 = { rubber: 'sounds/punch1.mp3', wood: 'sounds/punch1.mp3', plastic: 'sounds/click1.mp3' };
const MATERIAL_SOUNDS = {
  rubber: 'sounds/rubber.ogg', ice: 'sounds/chime2.mp3', wood: 'sounds/wood.ogg',
  metal: 'sounds/bling2.mp3', sandpaper: 'sounds/slide2.mp3', plastic: 'sounds/plastic.ogg',
};
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
function getSoundUrl(material) {
  if (isIOS && _ogg[material]) return _mp3[material];
  return MATERIAL_SOUNDS[material];
}
let audioContext = null;
let audioLoading = null;
let soundMuted = false;
try { soundMuted = localStorage.getItem('slipland_muted') === 'true'; } catch (_) {}
const soundBuffers = {};
function unlockAudio() {
  if (audioContext) {
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try { audioContext = new AudioContextClass(); } catch (_) { return; }
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  const buf = audioContext.createBuffer(1, 1, 22050);
  const src = audioContext.createBufferSource();
  src.buffer = buf;
  src.connect(audioContext.destination);
  src.start(0);
}
async function initAudio() {
  if (!audioContext || soundMuted) return;
  if (audioLoading) return audioLoading;
  audioLoading = Promise.allSettled(Object.keys(MATERIAL_SOUNDS).map(async (material) => {
    if (soundBuffers[material]) return;
    const res = await fetch(getSoundUrl(material));
    const arr = await res.arrayBuffer();
    soundBuffers[material] = await audioContext.decodeAudioData(arr);
  })).then(loadGooseSound).finally(() => { audioLoading = null; });
  return audioLoading;
}
function playLandingSound(material, contactQuality = 1) {
  if (soundMuted) return;
  try {
    if (!audioContext) initAudio();
    if (!audioContext) return;
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
      return;
    }
    const buf = soundBuffers[material];
    if (!buf) return;
    const src = audioContext.createBufferSource();
    src.buffer = buf;
    const gain = audioContext.createGain();
    let vol = material === 'sandpaper' ? 0.7 : 0.4;
    vol *= 0.6 + 0.5 * contactQuality;
    const playbackRate = 0.9 + 0.2 * contactQuality;
    src.playbackRate.setValueAtTime(playbackRate, audioContext.currentTime);
    gain.gain.setValueAtTime(vol, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    src.connect(gain);
    gain.connect(audioContext.destination);
    src.start(audioContext.currentTime);
  } catch (_) {}
}
async function loadGooseSound() {
  if (!audioContext || soundBuffers['goose']) return;
  try {
    const res = await fetch('sounds/805297__jahjahjahjah__goose-honk.mp3');
    const arr = await res.arrayBuffer();
    soundBuffers['goose'] = await audioContext.decodeAudioData(arr);
  } catch (_) {}
}
function playGooseSound() {
  if (soundMuted) return;
  try {
    if (!audioContext) unlockAudio();
    if (!audioContext) return;
    loadGooseSound();
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
      return;
    }
    const buf = soundBuffers['goose'];
    if (!buf) return;
    const src = audioContext.createBufferSource();
    src.buffer = buf;
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.5, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.7);
    src.connect(gain);
    gain.connect(audioContext.destination);
    src.start(audioContext.currentTime);
  } catch (_) {}
}

function playFallOffSound(material) {
  if (soundMuted) return;
  try {
    if (!audioContext) initAudio();
    if (!audioContext) return;
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
      return;
    }
    const buf = soundBuffers[material];
    if (!buf) return;
    const src = audioContext.createBufferSource();
    src.buffer = buf;
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.35, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
    src.playbackRate.setValueAtTime(0.75, audioContext.currentTime);
    src.connect(gain);
    gain.connect(audioContext.destination);
    src.start(audioContext.currentTime);
  } catch (_) {}
}

function triggerLandingVibration(contactQuality, sliding, material = 'wood') {
  if (!('vibrate' in navigator)) return;
  const mat = MATERIALS[material];
  const dur = contactQuality < 0.5 ? 1.3 : contactQuality < 0.8 ? 1.0 : 0.8;
  const patterns = {
    ice: [60 * dur, 40],                          // long cool buzz
    wood: [30, 80, 30],                           // two short taps
    rubber: [50 * dur],                           // deep soft pulse
    metal: [15, 40, 15, 60, 15],                  // sharp double pulse
    sandpaper: [20, 30, 20, 30, 20, 30],          // rough gritty pattern
    plastic: [25, 50, 25, 50],                    // light bouncy pulse
  };
  const p = patterns[material] || patterns.wood;
  if (sliding) navigator.vibrate([15, 30, 15]);
  else navigator.vibrate(p);
}
function triggerFallOffVibration(material) {
  if (!('vibrate' in navigator)) return;
  const fallPatterns = {
    ice: [40, 60, 40],
    wood: [25, 70, 25],
    rubber: [35, 80],
    metal: [20, 50, 20, 50],
    sandpaper: [25, 35, 25, 35],
    plastic: [30, 60, 30],
  };
  navigator.vibrate(fallPatterns[material] || fallPatterns.wood);
}

// DOM
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gooseImg = new Image();
gooseImg.src = 'images/goose.png';

// World dimensions (width derived from aspect ratio)
let WORLD_WIDTH = 400;

// Game state
const TEETER_NEAR_EDGE = FIGURE_RADIUS + 15;
const TEETER_VX_THRESHOLD = 15;
const PANIC_JUMP_MULT = 0.85;

let figure = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  grounded: true,
  sliding: false,
  landingEffect: null,
  teeterState: null,
  interactionState: 'stable',
};
let lands = [];
let gameOver = false;
let lastTime = 0;
let animationId = null;
let cameraX = 0;
let currentLandIndex = 0;
let bestLands = 0;
let personalRecord = 0;
let worldRecord = null;
let consecutiveSafeLandings = 0;
let lastStreakAtGameOver = 0;
let landedMaterials = new Set();
let hintDisplay = null;
let isPointerDown = false;
let pressStartTime = 0;
let activePointerId = null;
let keyboardCharging = false;
let paused = false;
let gameTime = 0;
let pendingSafeLanding = false;
let runStarted = false;
let recordAtRunStart = 0;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ui = Object.fromEntries([
  'instructionsOverlay', 'instructionsPlayBtn', 'gameHud', 'scoreValue', 'bestValue',
  'streakValue', 'surfaceValue', 'surfaceStatus', 'chargeLabel', 'chargeValue', 'chargeFill',
  'playHint', 'resultOverlay', 'resultScore', 'resultBest', 'resultTitle', 'resultEyebrow',
  'resultMessage', 'retryBtn', 'pauseOverlay', 'pauseBtn', 'resumeBtn', 'soundBtn',
].map(id => [id, document.getElementById(id)]));

function getViewMetrics() {
  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;
  const scale = Math.min(width / 850, height / WORLD_HEIGHT);
  return { width, height, scale, offsetY: height * 0.74 - 500 * scale };
}

function appendLands(count) {
  let x = lands.length ? lands[lands.length - 1].xEnd + JUMP_GAP : 40;
  for (let i = 0; i < count; i++) {
    const index = lands.length;
    const isStart = index === 0;
    // Introduce a neutral surface before the fully mixed course.
    const material = isStart ? 'rubber' : index === 1 ? 'wood' : MATERIAL_NAMES[Math.floor(Math.random() * MATERIAL_NAMES.length)];
    const mat = MATERIALS[material];
    const width = isStart ? LAND_WIDTH : LAND_WIDTH * mat.lengthBias;
    lands.push({ xStart: x, xEnd: x + width, y: WORLD_HEIGHT - 100,
      friction: index === 1 ? mat.frictionMax : mat.frictionMin + Math.random() * (mat.frictionMax - mat.frictionMin),
      material, isStart, height: PLATFORM_HEIGHT, index });
    x += width + JUMP_GAP;
  }
}

function getCurrentLand() {
  return lands[currentLandIndex] || null;
}

function initGame() {
  const view = getViewMetrics();
  WORLD_WIDTH = view.width / view.scale;
  lands = [];
  appendLands(NUM_LANDS);

  const land0 = lands[0];
  figure = {
    x: land0.xStart + (land0.xEnd - land0.xStart) / 2,
    y: land0.y - FIGURE_RADIUS,
    vx: 0,
    vy: 0,
    grounded: true,
    sliding: false,
    landingEffect: null,
    teeterState: null,
    interactionState: 'stable',
  };

  cameraX = 0;
  currentLandIndex = 0;
  bestLands = 0;
  consecutiveSafeLandings = 0;
  lastStreakAtGameOver = 0;
  landedMaterials = new Set();
  hintDisplay = null;
  gameOver = false;
  isPointerDown = false;
  activePointerId = null;
  keyboardCharging = false;
  pendingSafeLanding = false;
  runStarted = false;
  recordAtRunStart = personalRecord;
  gameTime = 0;
  lastTime = 0;
  ui.resultOverlay.hidden = true;
}

function beginCharge() {
  if (gameOver || paused || !instructionsDismissed || !figure.grounded || isPointerDown) return false;
  unlockAudio();
  initAudio();
  isPointerDown = true;
  pressStartTime = gameTime;
  return true;
}

function getCharge() {
  return Math.max(0, Math.min((gameTime - pressStartTime) / MAX_PRESS_MS, 1));
}

function getLaunchSpeed(charge) {
  const t = figure.teeterState ? Math.max(charge, 0.85) : charge;
  return (MIN_LAUNCH_SPEED + t * (MAX_LAUNCH_SPEED - MIN_LAUNCH_SPEED)) * (figure.teeterState ? PANIC_JUMP_MULT : 1);
}

function handlePointerDown(e) {
  if (e.button !== 0 || activePointerId !== null || keyboardCharging) return;
  e.preventDefault();
  if (!beginCharge()) return;
  activePointerId = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
}

function trackEvent(name, params = {}) {
  if (typeof gtag === 'function') gtag('event', name, params);
}

function releaseJump() {
  if (!isPointerDown) return;
  isPointerDown = false;
  if (gameOver || paused || !instructionsDismissed || !figure.grounded) return;
  if (!runStarted) { trackEvent('game_start'); runStarted = true; }
  if (pendingSafeLanding) { consecutiveSafeLandings = 0; pendingSafeLanding = false; }
  const launchSpeed = getLaunchSpeed(getCharge());
  figure.vx = launchSpeed * Math.cos(LAUNCH_ANGLE);
  figure.vy = -launchSpeed * Math.sin(LAUNCH_ANGLE);
  figure.grounded = false;
  figure.sliding = false;
  figure.teeterState = null;
}

function handlePointerUp(e) {
  if (e.pointerId !== activePointerId) return;
  e.preventDefault();
  activePointerId = null;
  releaseJump();
}

function handlePointerCancel() {
  isPointerDown = false;
  activePointerId = null;
  keyboardCharging = false;
}

const EDGE_BOUNCE_VY = -140;
const EDGE_BOUNCE_VX = 50;
const LEFT_EDGE_BOUNCE_VY = -180;
const LEFT_EDGE_BOUNCE_VX = 120;

function checkSlidOff() {
  if (!figure.grounded) return;

  const land = getCurrentLand();
  if (!land) return;

  const mat = MATERIALS[land.material] || {};
  const vyMult = mat.edgeBounceVy ?? 1;
  const vxMult = mat.edgeBounceVx ?? 1;

  if (figure.x - FIGURE_RADIUS < land.xStart) {
    if (figure.teeterState?.edge === 'left') return;
    figure.vy = EDGE_BOUNCE_VY * vyMult;
    figure.vx -= EDGE_BOUNCE_VX * vxMult;
    figure.grounded = false;
    figure.teeterState = null;
    playFallOffSound(land.material);
    triggerFallOffVibration(land.material);
  } else if (figure.x + FIGURE_RADIUS > land.xEnd) {
    if (figure.teeterState?.edge === 'right') return;
    figure.vy = EDGE_BOUNCE_VY * vyMult;
    figure.vx += EDGE_BOUNCE_VX * vxMult;
    figure.grounded = false;
    figure.teeterState = null;
    playFallOffSound(land.material);
    triggerFallOffVibration(land.material);
  }
}

function updatePhysics(dt) {
  if (gameOver || paused || !instructionsDismissed) return;

  cameraX = Math.max(0, figure.x - WORLD_WIDTH * 0.35);

  const dtSec = dt / 1000;
  const subDt = dtSec / PHYSICS_SUBSTEPS;

  for (let step = 0; step < PHYSICS_SUBSTEPS; step++) {
    if (!figure.grounded) {
      const prevY = figure.y;
      const prevBottom = prevY + FIGURE_RADIUS;

      figure.vy += GRAVITY * subDt;
      figure.y += figure.vy * subDt;
      figure.x += figure.vx * subDt;

      const currentLand = lands[currentLandIndex];
      const nextLand = lands[currentLandIndex + 1];
      const figureBottom = figure.y + FIGURE_RADIUS;

      for (const land of [currentLand, nextLand].filter(Boolean)) {
        const groundY = land.y;
        const crossedDown =
          prevBottom < groundY && figureBottom >= groundY && figure.vy >= 0;
        const withinX =
          figure.x >= land.xStart && figure.x <= land.xEnd;

        if (crossedDown && withinX) {
          const landingVx = figure.vx;
          figure.y = groundY - FIGURE_RADIUS;
          figure.vy = 0;
          figure.x = Math.max(land.xStart + FIGURE_RADIUS,
            Math.min(land.xEnd - FIGURE_RADIUS, figure.x));
          figure.grounded = true;
          const contactQuality = Math.max(0, Math.min(1, 1 - Math.abs(landingVx) / VX_DANGER));
          figure.landingEffect = { startTime: gameTime, landingVx, contactQuality, material: land.material };
          if (land === nextLand) {
            currentLandIndex++;
            if (lands.length - currentLandIndex < 8) appendLands(16);
            if (currentLandIndex > 0 && currentLandIndex % 10 === 0) playGooseSound();
            bestLands = Math.max(bestLands, currentLandIndex);
            if (bestLands > personalRecord) {
              personalRecord = bestLands;
              try { localStorage.setItem('slipland_personal', String(personalRecord)); } catch (_) {}
            }
            pendingSafeLanding = true;
          }
          figure.sliding = Math.abs(figure.vx) > FRICTION_DISPLAY_THRESHOLD;
          const avx = Math.abs(figure.vx);
          figure.interactionState = avx > 80 ? 'sliding' : avx > 15 ? 'incipient' : 'stable';
          if (!landedMaterials.has(land.material) && MATERIAL_HINTS[land.material]) {
            landedMaterials.add(land.material);
            hintDisplay = { text: MATERIAL_HINTS[land.material], startTime: gameTime };
          }
          playLandingSound(land.material, contactQuality);
          triggerLandingVibration(contactQuality, figure.sliding, land.material);
          break;
        }
        const leftEdgeGraze = land === nextLand && crossedDown &&
          figure.x < land.xStart && figure.x + FIGURE_RADIUS > land.xStart;
        if (leftEdgeGraze) {
          figure.y = groundY - FIGURE_RADIUS;
          figure.vy = LEFT_EDGE_BOUNCE_VY;
          figure.vx = LEFT_EDGE_BOUNCE_VX;
          break;
        }
      }

      if (!figure.grounded && figure.y + FIGURE_RADIUS > WORLD_HEIGHT) {
        finishRun();
        break;
      }
    } else {
      const land = getCurrentLand();
      if (land && Math.abs(figure.vx) > 0.01) {
        const frictionDecel = land.friction * GRAVITY;
        const dv = frictionDecel * subDt;
        if (figure.vx > 0) {
          figure.vx = Math.max(0, figure.vx - dv);
        } else {
          figure.vx = Math.min(0, figure.vx + dv);
        }
        figure.x += figure.vx * subDt;
        figure.sliding = Math.abs(figure.vx) > FRICTION_DISPLAY_THRESHOLD;
        const avx = Math.abs(figure.vx);
        if (avx > 80) figure.interactionState = 'sliding';
        else if (avx > 15) figure.interactionState = 'incipient';
        else figure.interactionState = 'stable';
      } else {
        figure.sliding = false;
        figure.interactionState = 'stable';
      }
    }
  }

  const land = getCurrentLand();
  if (figure.grounded && land) {
    const mat = MATERIALS[land.material];
    const teeterMs = mat?.teeterMs ?? 900;
    if (figure.teeterState) {
      const elapsed = gameTime - figure.teeterState.startTime;
      if (elapsed > teeterMs) {
        const nudge = figure.teeterState.edge === 'right' ? 1 : -1;
        figure.vx = nudge * 80;
        figure.vy = 0;
        figure.grounded = false;
        playFallOffSound(land.material);
        triggerFallOffVibration(land.material);
        figure.teeterState = null;
      }
    } else if (Math.abs(figure.vx) < TEETER_VX_THRESHOLD) {
      const nearRight = land.xEnd - figure.x <= TEETER_NEAR_EDGE;
      const nearLeft = figure.x - land.xStart <= TEETER_NEAR_EDGE;
      const edge = nearRight && (figure.x > land.xStart + (land.xEnd - land.xStart) / 2) ? 'right' : nearLeft ? 'left' : null;
      if (edge) figure.teeterState = { edge, startTime: gameTime };
    } else {
      figure.teeterState = null;
    }
  }

  checkSlidOff();
  if (pendingSafeLanding && figure.grounded && !figure.teeterState && Math.abs(figure.vx) < TEETER_VX_THRESHOLD) {
    consecutiveSafeLandings++;
    pendingSafeLanding = false;
  }
  if (!figure.grounded && isPointerDown) handlePointerCancel();
}

function drawBackground(displayW, displayH) {
  ctx.fillStyle = '#eeeadd';
  ctx.fillRect(0, 0, displayW, displayH);
  // A quiet paper grain, fixed in place so it never flickers.
  ctx.fillStyle = '#6b654211';
  for (let i = 0; i < 900; i++) {
    const x = ((i * 157 + i * i * 13) % 2003) / 2003 * displayW;
    const y = ((i * 89 + i * i * 7) % 1999) / 1999 * displayH;
    ctx.fillRect(x, y, 1, 1);
  }

  const sunX = displayW * 0.82;
  const sunY = displayH * 0.25;
  const sunR = Math.min(40, displayW * 0.065);
  ctx.fillStyle = '#d9a082';
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#bd896841';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sunX + 3, sunY - 2, sunR + 5, 0, Math.PI * 2);
  ctx.stroke();

  // Simple pencil clouds and distant rolling ground.
  ctx.strokeStyle = '#7d8d783a';
  ctx.lineWidth = 1.2;
  for (const [nx, ny, size] of [[0.15, 0.29, 0.9], [0.88, 0.45, 0.7], [0.64, 0.12, 0.5]]) {
    const x = nx * displayW - (cameraX * 0.02) % (displayW * 0.2);
    const y = ny * displayH;
    ctx.beginPath();
    ctx.moveTo(x - 50 * size, y);
    ctx.bezierCurveTo(x - 50 * size, y - 18 * size, x - 28 * size, y - 22 * size, x - 18 * size, y - 14 * size);
    ctx.bezierCurveTo(x - 10 * size, y - 48 * size, x + 30 * size, y - 35 * size, x + 30 * size, y - 15 * size);
    ctx.bezierCurveTo(x + 55 * size, y - 20 * size, x + 64 * size, y, x + 48 * size, y + 2);
    ctx.stroke();
  }
  for (let layer = 0; layer < 3; layer++) {
    ctx.fillStyle = ['#cbd5c7', '#b4c3ad', '#98ad91'][layer];
    ctx.beginPath();
    ctx.moveTo(0, displayH);
    for (let x = 0; x <= displayW + 8; x += 8) {
      const worldX = x + cameraX * (0.04 + layer * 0.04);
      const y = displayH * (0.65 + layer * 0.12) + Math.sin(worldX * 0.004 + layer * 2) * displayH * 0.055 + Math.cos(worldX * 0.009) * displayH * 0.015;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(displayW, displayH);
    ctx.closePath();
    ctx.fill();
  }
}

function drawTrajectory(scale, offsetY) {
  if (!isPointerDown || !figure.grounded || gameOver) return;
  const speed = getLaunchSpeed(getCharge());
  const vx = speed * Math.cos(LAUNCH_ANGLE);
  const vy = -speed * Math.sin(LAUNCH_ANGLE);
  const flightTime = -2 * vy / GRAVITY;
  for (let i = 1; i <= 24; i++) {
    const time = i / 24 * flightTime;
    const x = (figure.x + vx * time - cameraX) * scale;
    const y = (figure.y + vy * time + 0.5 * GRAVITY * time * time) * scale + offsetY;
    ctx.fillStyle = `rgba(72, 81, 58, ${0.3 + (1 - i / 24) * 0.6})`;
    ctx.beginPath();
    ctx.arc(x, y, i === 24 ? 4 : 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}

function render() {
  const view = getViewMetrics();
  const { width: displayW, height: displayH, scale: scaleX, offsetY } = view;
  const scaleY = scaleX;
  drawBackground(displayW, displayH);
  drawTrajectory(scaleX, offsetY);
  if (instructionsDismissed) updateHud();

  for (const land of lands) {
    const sx = (land.xStart - cameraX) * scaleX;
    const sy = land.y * scaleY + offsetY;
    const sw = (land.xEnd - land.xStart) * scaleX;
    const sh = Math.max(12, land.height * scaleY);
    if (sx + sw < 0 || sx > displayW) continue;
    const mat = MATERIALS[land.material];
    const radius = Math.min(5, sh * 0.25);
    ctx.fillStyle = '#303b3229';
    roundRect(sx + 2, sy + 7, sw, sh, radius);
    ctx.fill();
    ctx.fillStyle = mat.fill;
    roundRect(sx, sy, sw, sh, radius);
    ctx.fill();
    ctx.strokeStyle = '#465140';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.save();
    ctx.clip();
    if (mat.texture === 'stripes') {
      ctx.strokeStyle = '#71594066';
      ctx.lineWidth = 1;
      for (let ox = 10; ox < sw; ox += 23) {
        ctx.beginPath();ctx.moveTo(sx + ox, sy);ctx.lineTo(sx + ox + 6, sy + sh);ctx.stroke();
      }
    } else if (mat.texture === 'dots') {
      ctx.fillStyle = mat.stroke;
      for (let ox = 5; ox < sw; ox += 9) {
        for (let oy = 6; oy < sh; oy += 8) {
          ctx.beginPath();ctx.arc(sx + ox, sy + oy, 0.8, 0, Math.PI * 2);ctx.fill();
        }
      }
    } else if (land.material === 'ice') {
      ctx.strokeStyle = '#e9ffff80';ctx.lineWidth = 2;
      for (let ox = 25; ox < sw; ox += 65) {
        ctx.beginPath();ctx.moveTo(sx + ox, sy);ctx.lineTo(sx + ox - 15, sy + sh);ctx.stroke();
      }
    }
    ctx.fillStyle = '#ffffff30';
    ctx.fillRect(sx, sy, sw, 3);
    ctx.fillStyle = '#00000018';
    ctx.fillRect(sx, sy + sh - 4, sw, 4);
    ctx.restore();
    ctx.fillStyle = '#465640';
    ctx.font = `${Math.max(8, Math.min(10, displayW / 100))}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(`${String(land.index).padStart(2, '0')} / ${land.isStart ? 'START' : land.material.toUpperCase()}`, sx + 3, sy + sh + 24);
  }

  let fx = (figure.x - cameraX) * scaleX;
  let fy = figure.y * scaleY + offsetY;
  const fr = FIGURE_RADIUS * Math.min(scaleX, scaleY);

  // Landing wobble, teeter, skid, and material-specific visuals
  if (figure.landingEffect && !reducedMotion) {
    const elapsed = gameTime - figure.landingEffect.startTime;
    if (elapsed > LANDING_EFFECT_MS) {
      figure.landingEffect = null;
    } else {
      const q = figure.landingEffect.contactQuality;
      const mat = MATERIALS[figure.landingEffect.material] || {};
      const wobbleMult = mat.wobbleMultiplier ?? 1;
      const wobbleAmp = WOBBLE_AMPLITUDE * (1 - q) * wobbleMult * Math.min(scaleX, scaleY) / 20;
      const offsetY = wobbleAmp * Math.sin(elapsed * WOBBLE_FREQ);
      fy += offsetY;
      if (figure.interactionState === 'incipient' && elapsed < 100) {
        const teeterAmp = 4 * Math.min(scaleX, scaleY) / 20;
        const dir = figure.landingEffect.landingVx > 0 ? 1 : -1;
        fx += dir * teeterAmp * Math.sin(elapsed * 0.06);
      }
      if (q < 0.7 && elapsed < SKID_MS) {
        const dir = figure.landingEffect.landingVx > 0 ? -1 : 1;
        ctx.strokeStyle = 'rgba(255, 200, 100, 0.8)';
        ctx.lineWidth = 2;
        for (let i = 1; i <= 4; i++) {
          const len = 8 + i * 4;
          const off = i * 6;
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.lineTo(fx + dir * len, fy + off);
          ctx.stroke();
        }
      }
      if (q < 0.5 && elapsed < 120) {
        const m = figure.landingEffect.material;
        const burstColors = { ice: 'rgba(168, 216, 234, 0.6)', sandpaper: 'rgba(139, 115, 85, 0.5)', metal: 'rgba(255, 255, 255, 0.4)', plastic: 'rgba(255, 217, 61, 0.5)', wood: 'rgba(196, 167, 125, 0.5)', rubber: 'rgba(45, 45, 45, 0.4)' };
        ctx.fillStyle = burstColors[m] || 'rgba(255, 200, 100, 0.4)';
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 + elapsed * 0.02;
          const r = 4 + i * 3 + (1 - q) * 10;
          ctx.beginPath();
          ctx.arc(fx + Math.cos(angle) * r, fy + Math.sin(angle) * r, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  const figColor = !figure.grounded ? '#4ecdc4'
    : figure.teeterState ? '#ff6b6b'
    : figure.interactionState === 'sliding' ? '#e94560'
    : figure.interactionState === 'incipient' ? '#ffb347'
    : '#4ecdc4';
  let figCenterY = fy;
  let figTop = fy - fr;
  if (gooseImg.complete && gooseImg.naturalWidth) {
    const size = fr * 4.2;
    const groundY = fy + fr;
    figCenterY = groundY - size / 2;
    figTop = figCenterY - size / 2;
    ctx.save();
    ctx.translate(fx, figCenterY);
    if (!reducedMotion) {
      if (!figure.grounded) ctx.rotate(Math.max(-0.18, Math.min(0.2, figure.vy * 0.0004)));
      if (figure.teeterState) ctx.rotate(Math.sin(gameTime * 0.025) * 0.12);
      if (isPointerDown) ctx.scale(1 + getCharge() * 0.08, 1 - getCharge() * 0.08);
    }
    if (figure.vx < -5) ctx.scale(-1, 1);
    ctx.drawImage(gooseImg, -size / 2, -size / 2, size, size);
    ctx.restore();
  } else {
    ctx.fillStyle = figColor;
    ctx.beginPath();
    ctx.arc(fx, fy, fr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2d4059';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (figure.teeterState) {
    ctx.fillStyle = '#354531';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('QUICK, TAP!', fx, figTop - 16);
  }

  if (hintDisplay) {
    const elapsed = gameTime - hintDisplay.startTime;
    if (elapsed > HINT_DISPLAY_MS) {
      hintDisplay = null;
    } else {
      const alpha = elapsed < 300 ? elapsed / 300 : elapsed > HINT_DISPLAY_MS - 400 ? (HINT_DISPLAY_MS - elapsed) / 400 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#354531';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(hintDisplay.text, displayW / 2, displayH / 2 - 60);
      ctx.restore();
    }
  }

  if (isPointerDown && figure.grounded) {
    const t = getCharge();
    const barWidth = 40;
    ctx.fillStyle = '#35453126';
    roundRect(fx - barWidth / 2, figTop - 15, barWidth, 4, 2);
    ctx.fill();
    if (t > 0) {
      ctx.fillStyle = t > 0.85 ? '#bf663f' : '#62744d';
      roundRect(fx - barWidth / 2, figTop - 15, barWidth * t, 4, 2);
      ctx.fill();
    }
  }
}

function updateHud() {
  ui.scoreValue.textContent = String(currentLandIndex).padStart(2, '0');
  ui.bestValue.textContent = String(personalRecord).padStart(2, '0');
  ui.streakValue.textContent = consecutiveSafeLandings > 1 ? `${consecutiveSafeLandings} SAFE LANDINGS` : '';
  const land = getCurrentLand();
  const state = figure.teeterState ? 'On the edge · tap to save!' : !figure.grounded ? 'In the air · trust the arc' : land?.isStart ? 'Start · steady ground' : `${land.material.charAt(0).toUpperCase() + land.material.slice(1)} · ${figure.sliding ? 'sliding' : 'settled'}`;
  ui.surfaceValue.textContent = state;
  ui.surfaceStatus.style.color = figure.teeterState ? '#9b4829' : '#54634c';
  const charge = isPointerDown ? getCharge() : 0;
  ui.chargeValue.textContent = `${Math.round(charge * 100)}%`;
  ui.chargeFill.style.width = `${charge * 100}%`;
  ui.chargeFill.style.background = charge > 0.85 ? '#b95e38' : '#718255';
  ui.chargeLabel.textContent = figure.teeterState ? 'quick, tap!' : !figure.grounded ? 'airborne' : isPointerDown ? 'release to jump' : 'hold to charge';
}

function finishRun() {
  lastStreakAtGameOver = consecutiveSafeLandings;
  gameOver = true;
  handlePointerCancel();
  trackEvent('game_over', { score: bestLands });
  if (bestLands > (worldRecord ?? 0)) {
    trackEvent('world_record_beaten', { score: bestLands, previous_record: worldRecord ?? 0 });
    submitWorldRecord(bestLands);
  }
  const newBest = bestLands > recordAtRunStart;
  ui.resultEyebrow.textContent = newBest ? 'NEW BEST!' : 'OOPS.';
  ui.resultTitle.textContent = newBest ? 'Nice run.' : 'Slipped away.';
  ui.resultMessage.textContent = lastStreakAtGameOver > 1 ? `${lastStreakAtGameOver} safe landings in a row. Nicely done.` : bestLands === 0 ? 'Hold a little longer. Follow the dotted arc.' : 'Another go?';
  ui.resultScore.textContent = bestLands;
  ui.resultBest.textContent = personalRecord;
  ui.resultOverlay.hidden = false;
  ui.pauseBtn.hidden = true;
  ui.retryBtn.focus({ preventScroll: true });
}

function startRun() {
  initGame();
  paused = false;
  instructionsDismissed = true;
  document.body.classList.remove('at-home');
  canvas.tabIndex = 0;
  ui.instructionsOverlay.hidden = true;
  ui.pauseOverlay.hidden = true;
  ui.gameHud.hidden = false;
  ui.pauseBtn.hidden = false;
  unlockAudio();
  initAudio();
  canvas.focus({ preventScroll: true });
}

function goHome() {
  handlePointerCancel();
  instructionsDismissed = false;
  document.body.classList.add('at-home');
  canvas.tabIndex = -1;
  initGame();
  paused = false;
  ui.instructionsOverlay.hidden = false;
  ui.resultOverlay.hidden = true;
  ui.pauseOverlay.hidden = true;
  ui.gameHud.hidden = true;
  ui.pauseBtn.hidden = true;
  ui.instructionsPlayBtn.focus({ preventScroll: true });
}

function setPaused(value) {
  if (!instructionsDismissed || gameOver) return;
  paused = value;
  handlePointerCancel();
  lastTime = 0;
  ui.pauseOverlay.hidden = !value;
  if (value) ui.resumeBtn.focus({ preventScroll: true });
  else canvas.focus({ preventScroll: true });
}

function gameLoop(timestamp) {
  const dt = Math.min(lastTime ? timestamp - lastTime : 16, 50);
  lastTime = timestamp;
  if (instructionsDismissed && !paused && !gameOver && !document.hidden) {
    gameTime += dt;
    updatePhysics(dt);
  }
  if (!document.hidden) render();
  animationId = requestAnimationFrame(gameLoop);
}

function handleResize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const view = getViewMetrics();
  WORLD_WIDTH = view.width / view.scale;
  cameraX = Math.max(0, figure.x - WORLD_WIDTH * 0.35);
}

let instructionsDismissed = false;

function updateSoundButton() {
  ui.soundBtn.classList.toggle('muted', soundMuted);
  ui.soundBtn.setAttribute('aria-pressed', String(soundMuted));
  ui.soundBtn.setAttribute('aria-label', soundMuted ? 'Unmute sound' : 'Mute sound');
  ui.soundBtn.title = soundMuted ? 'Unmute sound' : 'Mute sound';
}

function setupInput() {
  canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
  canvas.addEventListener('pointerup', handlePointerUp, { passive: false });
  canvas.addEventListener('pointercancel', handlePointerCancel);
  canvas.addEventListener('lostpointercapture', () => { if (activePointerId !== null) handlePointerCancel(); });
  ui.instructionsPlayBtn.addEventListener('click', startRun);
  ui.retryBtn.addEventListener('click', startRun);
  ui.pauseBtn.addEventListener('click', () => setPaused(true));
  ui.resumeBtn.addEventListener('click', () => setPaused(false));
  for (const id of ['homeBtn', 'resultHomeBtn', 'pauseHomeBtn']) {
    document.getElementById(id).addEventListener('click', e => { e.preventDefault(); goHome(); });
  }
  ui.soundBtn.addEventListener('click', () => {
    soundMuted = !soundMuted;
    try { localStorage.setItem('slipland_muted', String(soundMuted)); } catch (_) {}
    updateSoundButton();
    if (!soundMuted) { unlockAudio(); initAudio(); }
  });
  updateSoundButton();

  document.addEventListener('keydown', e => {
    if (e.code === 'Tab') {
      const dialog = !ui.pauseOverlay.hidden ? ui.pauseOverlay : !ui.resultOverlay.hidden ? ui.resultOverlay : null;
      if (dialog) {
        const buttons = [...dialog.querySelectorAll('button')];
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === 'Escape' && instructionsDismissed && !gameOver) { e.preventDefault(); setPaused(!paused); return; }
    if (e.target.closest?.('button, a, input, textarea')) return;
    if (e.code === 'Enter' && gameOver) { e.preventDefault(); startRun(); return; }
    if (e.code === 'Space' && instructionsDismissed && !paused && !gameOver) {
      e.preventDefault();
      if (activePointerId === null) keyboardCharging = beginCharge();
    }
  });
  document.addEventListener('keyup', e => {
    if (e.code !== 'Space' || !keyboardCharging) return;
    e.preventDefault();
    keyboardCharging = false;
    releaseJump();
  });
  window.addEventListener('blur', () => setPaused(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
}

function fetchWorldRecord() {
  if (FIREBASE_DB_URL) {
    const url = FIREBASE_DB_URL.replace(/\/$/, '') + '/worldRecord.json';
    fetch(url).then(r => r.json()).then(v => {
      if (typeof v === 'number' && v >= 0) worldRecord = v;
      else if (v?.record != null) worldRecord = v.record;
    }).catch(() => {});
  } else {
    fetch('world-record.json').then(r => r.json()).then(d => { if (d?.record != null) worldRecord = d.record; }).catch(() => {});
  }
}

function submitWorldRecord(score) {
  if (!FIREBASE_DB_URL || score <= (worldRecord ?? 0)) return;
  const url = FIREBASE_DB_URL.replace(/\/$/, '') + '/worldRecord.json';
  fetch(url).then(r => r.json()).then(current => {
    const cur = typeof current === 'number' ? current : (current?.record ?? 0);
    if (score > cur) {
      return fetch(url, { method: 'PUT', body: JSON.stringify(score), headers: { 'Content-Type': 'application/json' } })
        .then(res => res.json())
        .then(v => { worldRecord = typeof v === 'number' ? v : v?.record ?? worldRecord; });
    }
  }).catch(() => {});
}

function loadRecords() {
  try {
    const p = parseInt(localStorage.getItem('slipland_personal'), 10);
    if (Number.isFinite(p) && p >= 0) personalRecord = p;
  } catch (_) {}
  fetchWorldRecord();
  if (FIREBASE_DB_URL) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fetchWorldRecord();
    });
  }
}

function start() {
  loadRecords();
  handleResize();
  window.addEventListener('resize', handleResize);
  setupInput();
  canvas.tabIndex = -1;
  initGame();
  lastTime = 0;
  requestAnimationFrame(gameLoop);
}

start();

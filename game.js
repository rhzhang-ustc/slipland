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
  rubber: { frictionMin: 0.78, frictionMax: 0.95, lengthBias: 0.9, fill: '#2d2d2d', stroke: '#1a1a1a', texture: 'dots', cue: 'sheen', failureStyle: 'grip', teeterMs: 1200, wobbleMultiplier: 0.6, edgeBounceVy: 1.3, edgeBounceVx: 1.2 },
  metal: { frictionMin: 0.35, frictionMax: 0.50, lengthBias: 1.0, fill: '#7b8c9a', stroke: '#5a6a78', texture: 'none', cue: 'none', failureStyle: 'sharp', teeterMs: 700, wobbleMultiplier: 1.1, edgeBounceVy: 0.8, edgeBounceVx: 1.3 },
  sandpaper: { frictionMin: 0.80, frictionMax: 0.95, lengthBias: 0.67, fill: '#8b7355', stroke: '#6b5340', texture: 'dots', cue: 'dust', failureStyle: 'grip', teeterMs: 1100, wobbleMultiplier: 0.8, edgeBounceVy: 1.1, edgeBounceVx: 1.0 },
  plastic: { frictionMin: 0.50, frictionMax: 0.65, lengthBias: 0.95, fill: '#ffd93d', stroke: '#e6c235', texture: 'none', cue: 'none', failureStyle: 'bounce', teeterMs: 850, wobbleMultiplier: 1.2, edgeBounceVy: 1.2, edgeBounceVx: 1.1 },
};
const MATERIAL_NAMES = Object.keys(MATERIALS);
const MATERIAL_HINTS = { ice: 'Slippery!', rubber: 'Stable!' };

// Starfield for starry background (normalized 0-1 coords)
const STAR_POSITIONS = [
  [0.05, 0.15], [0.18, 0.28], [0.28, 0.08], [0.42, 0.18], [0.58, 0.32], [0.72, 0.12],
  [0.88, 0.22], [0.95, 0.42], [0.08, 0.65], [0.35, 0.78], [0.62, 0.88], [0.78, 0.72],
  [0.22, 0.48], [0.88, 0.62], [0.12, 0.35], [0.52, 0.55], [0.68, 0.42], [0.35, 0.12],
];

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
const soundBuffers = {};
function unlockAudio() {
  if (audioContext) return;
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  const buf = audioContext.createBuffer(1, 1, 22050);
  const src = audioContext.createBufferSource();
  src.buffer = buf;
  src.connect(audioContext.destination);
  src.start(0);
}
async function initAudio() {
  if (!audioContext) return;
  try {
    for (const material of Object.keys(MATERIAL_SOUNDS)) {
      if (soundBuffers[material]) continue;
      const url = getSoundUrl(material);
      const res = await fetch(url);
      const arr = await res.arrayBuffer();
      soundBuffers[material] = await audioContext.decodeAudioData(arr);
    }
    await loadGooseSound();
  } catch (_) {}
}
function playLandingSound(material, contactQuality = 1) {
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
const PANIC_JUMP_MULT = 0.6;

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
let pressScreenX = 0;
let pressScreenY = 0;

function getCurrentLand() {
  return lands[currentLandIndex] || null;
}

function initGame() {
  const cw = canvas.clientWidth || window.innerWidth;
  const ch = canvas.clientHeight || window.innerHeight;
  const aspect = cw / ch;
  const minAspect = 0.85;
  WORLD_WIDTH = Math.max(WORLD_HEIGHT * aspect, WORLD_HEIGHT * minAspect) || WORLD_HEIGHT * 1.5;

  lands = [];
  const baseY = WORLD_HEIGHT - 100;
  let x = 40;

  for (let i = 0; i < NUM_LANDS; i++) {
    const gap = i === 0 ? 0 : JUMP_GAP;
    x += gap;
    const isStart = i === 0;
    const matName = isStart ? 'rubber' : MATERIAL_NAMES[Math.floor(Math.random() * MATERIAL_NAMES.length)];
    const mat = MATERIALS[matName];
    const friction = mat.frictionMin + Math.random() * (mat.frictionMax - mat.frictionMin);

    lands.push({
      xStart: x,
      xEnd: x + LAND_WIDTH,
      y: baseY,
      friction,
      material: matName,
      isStart,
      height: PLATFORM_HEIGHT,
      index: i,
    });
    x += LAND_WIDTH;
  }

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
}

function worldToScreen(x, y) {
  const scaleX = canvas.width / WORLD_WIDTH;
  const scaleY = canvas.height / WORLD_HEIGHT;
  return {
    x: x * scaleX,
    y: y * scaleY,
  };
}

function screenToWorld(screenX, screenY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = WORLD_WIDTH / canvas.width;
  const scaleY = WORLD_HEIGHT / canvas.height;
  const canvasX = screenX - rect.left;
  const canvasY = screenY - rect.top;
  return {
    x: canvasX * scaleX,
    y: canvasY * scaleY,
  };
}

function handlePointerDown(e) {
  if (gameOver) return;
  if (!instructionsDismissed) return;
  e.preventDefault();
  unlockAudio();
  initAudio();
  if (!figure.grounded) return;

  isPointerDown = true;
  pressStartTime = performance.now();
  pressScreenX = e.clientX;
  pressScreenY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
}

function trackEvent(name, params = {}) {
  if (typeof gtag === 'function') gtag('event', name, params);
}

function handlePointerUp(e) {
  e.preventDefault();
  if (!isPointerDown) return;
  isPointerDown = false;

  if (gameOver || !instructionsDismissed) return;
  if (!figure.grounded && !figure.teeterState) return;

  if (currentLandIndex === 0) trackEvent('game_start');
  const pressDuration = Math.min(performance.now() - pressStartTime, MAX_PRESS_MS);
  const t = pressDuration / MAX_PRESS_MS;
  const mult = figure.teeterState ? PANIC_JUMP_MULT : 1;
  const launchSpeed = (MIN_LAUNCH_SPEED + t * (MAX_LAUNCH_SPEED - MIN_LAUNCH_SPEED)) * mult;

  figure.vx = launchSpeed * Math.cos(LAUNCH_ANGLE);
  figure.vy = -launchSpeed * Math.sin(LAUNCH_ANGLE);
  figure.grounded = false;
  figure.teeterState = null;
}

function handlePointerCancel(e) {
  isPointerDown = false;
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
  if (gameOver) return;

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
          figure.landingEffect = { startTime: performance.now(), landingVx, contactQuality, material: land.material };
          if (land === nextLand) {
            currentLandIndex++;
            if (currentLandIndex > 0 && currentLandIndex % 10 === 0) playGooseSound();
            bestLands = Math.max(bestLands, currentLandIndex);
            if (bestLands > personalRecord) {
              personalRecord = bestLands;
              try { localStorage.setItem('slipland_personal', String(personalRecord)); } catch (_) {}
            }
            if (Math.abs(landingVx) < 15) {
              consecutiveSafeLandings++;
            } else {
              consecutiveSafeLandings = 0;
            }
          } else {
            consecutiveSafeLandings = 0;
          }
          figure.sliding = Math.abs(figure.vx) > FRICTION_DISPLAY_THRESHOLD;
          const avx = Math.abs(figure.vx);
          figure.interactionState = avx > 80 ? 'sliding' : avx > 15 ? 'incipient' : 'stable';
          if (!landedMaterials.has(land.material) && MATERIAL_HINTS[land.material]) {
            landedMaterials.add(land.material);
            hintDisplay = { text: MATERIAL_HINTS[land.material], startTime: performance.now() };
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
        lastStreakAtGameOver = consecutiveSafeLandings;
        gameOver = true;
        trackEvent('game_over', { score: bestLands });
        if (bestLands > (worldRecord ?? 0)) {
          trackEvent('world_record_beaten', { score: bestLands, previous_record: worldRecord ?? 0 });
          submitWorldRecord(bestLands);
        }
        consecutiveSafeLandings = 0;
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
      const elapsed = performance.now() - figure.teeterState.startTime;
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
      if (edge) figure.teeterState = { edge, startTime: performance.now() };
    } else {
      figure.teeterState = null;
    }
  }

  checkSlidOff();
}

function drawStarryBackground(displayW, displayH) {
  const grad = ctx.createLinearGradient(0, 0, 0, displayH);
  grad.addColorStop(0, '#1a1a3e');
  grad.addColorStop(0.35, '#16213e');
  grad.addColorStop(0.7, '#0f3460');
  grad.addColorStop(1, '#1a1a3e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, displayW, displayH);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  for (const [nx, ny] of STAR_POSITIONS) {
    const px = nx * displayW;
    const py = ny * displayH;
    ctx.beginPath();
    ctx.arc(px, py, 1.5, 0, Math.PI * 2);
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
  const displayW = canvas.clientWidth || window.innerWidth;
  const displayH = canvas.clientHeight || window.innerHeight;
  const scaleX = displayW / WORLD_WIDTH;
  const scaleY = displayH / WORLD_HEIGHT;

  drawStarryBackground(displayW, displayH);

  const pad = 12;
  const land = getCurrentLand();
  const showMaterial = figure.grounded && land && !land.isStart;
  const hudH = 48 + (showMaterial ? 16 : 0) + (consecutiveSafeLandings > 1 ? 16 : 0);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(pad, pad, 140, hudH);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad, pad, 140, hudH);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Lands: ${currentLandIndex}`, pad + 16, pad + 22);
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#b0b0b0';
  ctx.fillText(`Best: ${bestLands}`, pad + 16, pad + 42);

  const recordW = 120;
  const recordH = 32;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(displayW - pad - recordW, pad, recordW, recordH);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.strokeRect(displayW - pad - recordW, pad, recordW, recordH);
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#e8e8e8';
  ctx.fillText(`Personal: ${personalRecord}`, displayW - pad - 16, pad + 22);
  ctx.textAlign = 'left';
  let y = pad + 42;
  if (showMaterial) {
    y += 16;
    const label = land.material.charAt(0).toUpperCase() + land.material.slice(1);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillText(`${label} μ${land.friction.toFixed(2)}`, pad + 16, y);
  }
  if (consecutiveSafeLandings > 1) {
    y += 16;
    ctx.fillStyle = '#7bed9f';
    ctx.fillText(`Streak: ${consecutiveSafeLandings}`, pad + 16, y);
  }

  for (const land of lands) {
    const sx = (land.xStart - cameraX) * scaleX;
    const sy = land.y * scaleY;
    const sw = (land.xEnd - land.xStart) * scaleX;
    const sh = land.height * scaleY;

    if (sx + sw < 0 || sx > displayW) continue;

    const mat = MATERIALS[land.material];
    const radius = Math.min(8, sh * 0.35);
    if (land.isStart) {
      ctx.fillStyle = '#27ae60';
      roundRect(sx, sy, sw, sh, radius);
      ctx.fill();
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.shadowColor = '#f1c40f';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = '#f1c40f';
      ctx.lineWidth = 2;
      roundRect(sx, sy, sw, sh, radius);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(sx + 2, sy + 2, sw - 4, Math.max(4, sh * 0.35));
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('START', sx + sw / 2, sy - 80);
    } else {
    ctx.fillStyle = mat.fill;
    roundRect(sx, sy, sw, sh, radius);
    ctx.fill();
    if (mat.texture === 'stripes') {
      ctx.strokeStyle = mat.stroke;
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      const spacing = Math.max(8, Math.floor(sw / 20));
      for (let ox = spacing; ox < sw; ox += spacing) {
        ctx.beginPath();
        ctx.moveTo(sx + ox, sy + 1);
        ctx.lineTo(sx + ox, sy + sh - 1);
        ctx.stroke();
      }
    } else if (mat.texture === 'dots') {
      ctx.fillStyle = mat.stroke;
      for (let ox = 4; ox < sw; ox += 16) {
        for (let oy = 4; oy < sh; oy += 16) {
          ctx.beginPath();
          ctx.arc(sx + ox, sy + oy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    if (mat.cue === 'sparkle') {
      const t = performance.now() * 0.003;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6 + 0.2 * Math.sin(t))';
      for (let i = 0; i < 8; i++) {
        const px = sx + 15 + (i * 37 % (sw - 20));
        const py = sy + 8 + (i * 23 % (sh - 12));
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (mat.cue === 'sheen') {
      const grad = ctx.createLinearGradient(sx, sy, sx + sw * 0.4, sy + sh);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(sx, sy, sw, sh);
    } else if (mat.cue === 'dust') {
      ctx.fillStyle = 'rgba(139, 115, 85, 0.25)';
      for (let i = 0; i < 12; i++) {
        const px = sx + 8 + (i * 31 % Math.max(1, sw - 16));
        const py = sy + 4 + (i * 19 % Math.max(1, sh - 8));
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(sx + 4, sy + 4, sw - 8, Math.max(4, sh * 0.22));
    ctx.strokeStyle = mat.stroke;
    ctx.lineWidth = 2;
    roundRect(sx, sy, sw, sh, radius);
    ctx.stroke();

    const label = land.material.charAt(0).toUpperCase() + land.material.slice(1);
    ctx.fillStyle = '#e8e8e8';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, sx + sw / 2, sy - 8);
    }
  }

  let fx = (figure.x - cameraX) * scaleX;
  let fy = figure.y * scaleY;
  const fr = FIGURE_RADIUS * Math.min(scaleX, scaleY);

  // Landing wobble, teeter, skid, and material-specific visuals
  if (figure.landingEffect) {
    const elapsed = performance.now() - figure.landingEffect.startTime;
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
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAP!', fx, figTop - 16);
  }

  if (hintDisplay) {
    const elapsed = performance.now() - hintDisplay.startTime;
    if (elapsed > HINT_DISPLAY_MS) {
      hintDisplay = null;
    } else {
      const alpha = elapsed < 300 ? elapsed / 300 : elapsed > HINT_DISPLAY_MS - 400 ? (HINT_DISPLAY_MS - elapsed) / 400 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(hintDisplay.text, displayW / 2, displayH / 2 - 60);
      ctx.restore();
    }
  }

  if (isPointerDown && figure.grounded && !figure.sliding) {
    const pressDuration = Math.min(performance.now() - pressStartTime, MAX_PRESS_MS);
    const t = pressDuration / MAX_PRESS_MS;

    const arcRadius = 50 + t * 70;
    const arcSpan = Math.PI * 0.5;
    const canvasLaunch = -LAUNCH_ANGLE;
    const startAngle = canvasLaunch - arcSpan / 2;
    const endAngle = canvasLaunch + arcSpan / 2;

    ctx.save();
    ctx.translate(fx, figCenterY);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, arcRadius, startAngle, endAngle);
    ctx.stroke();

    ctx.strokeStyle = t > 0.7 ? '#ff9500' : t > 0.4 ? '#7bed9f' : '#4ecdc4';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, arcRadius, startAngle, startAngle + t * arcSpan);
    ctx.stroke();

    ctx.restore();

    const rect = canvas.getBoundingClientRect();
    const pressX = pressScreenX - rect.left;
    const pressY = pressScreenY - rect.top;
    ctx.fillStyle = t > 0.7 ? 'rgba(255, 149, 0, 0.6)' : 'rgba(78, 205, 196, 0.6)';
    ctx.beginPath();
    ctx.arc(pressX, pressY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = t > 0.7 ? '#ff9500' : '#4ecdc4';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (gameOver) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, displayW, displayH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over', displayW / 2, displayH / 2 - 40);

    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#e8e8e8';
    ctx.fillText(`Lands reached: ${currentLandIndex}`, displayW / 2, displayH / 2 - 10);
    ctx.fillText(`Best: ${bestLands}`, displayW / 2, displayH / 2 + 15);
    const restartY = lastStreakAtGameOver > 1 ? 65 : 50;
    if (lastStreakAtGameOver > 1) {
      ctx.fillText(`Streak: ${lastStreakAtGameOver}`, displayW / 2, displayH / 2 + 40);
    }

    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#b0b0b0';
    ctx.fillText('Tap to restart', displayW / 2, displayH / 2 + restartY);
  }
}

function gameLoop(timestamp) {
  const dt = lastTime ? timestamp - lastTime : 16;
  lastTime = timestamp;

  updatePhysics(dt);
  render();

  animationId = requestAnimationFrame(gameLoop);
}

function handleResize() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;

  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const aspect = w / h;
  const minAspect = 0.85;
  WORLD_WIDTH = Math.max(WORLD_HEIGHT * aspect, WORLD_HEIGHT * minAspect);
}

let instructionsDismissed = false;

function setupInput() {
  canvas.addEventListener('pointerdown', handlePointerDown, {
    passive: false,
  });
  canvas.addEventListener('pointerup', handlePointerUp, { passive: false });
  canvas.addEventListener('pointercancel', handlePointerCancel, {
    passive: false,
  });
  canvas.addEventListener('pointerleave', handlePointerCancel);

  canvas.addEventListener('click', (e) => {
    if (gameOver) {
      unlockAudio();
      initGame();
    }
  });

  const playBtn = document.getElementById('instructionsPlayBtn');
  const overlay = document.getElementById('instructionsOverlay');
  if (playBtn && overlay) {
    playBtn.addEventListener('click', () => {
      overlay.classList.add('hidden');
      instructionsDismissed = true;
      unlockAudio();
    });
  }
}

function updatePlayOverlay() {
  const overlay = document.getElementById('playOverlay');
  if (!overlay) return;
  const isMobile = window.innerWidth < 768 || 'ontouchstart' in window;
  const isPortrait = window.innerHeight > window.innerWidth;
  if (!isMobile || !isPortrait) {
    overlay.classList.add('hidden');
    return;
  }
  overlay.classList.remove('hidden');
}

function setupPlayOverlay() {
  updatePlayOverlay();
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
    if (!isNaN(p)) personalRecord = p;
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
  window.addEventListener('resize', () => {
    handleResize();
    updatePlayOverlay();
  });
  setupPlayOverlay();
  setupInput();
  initGame();
  lastTime = 0;
  requestAnimationFrame(gameLoop);
}

start();

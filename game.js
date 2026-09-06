'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#9e9e9e', // N - tuerca (gris metal)
  '#ff7043', // power-up: bomba
  '#ffee58', // power-up: rayo
  '#ab47bc', // power-up: tinte
  '#26c6da', // power-up: gravedad
  '#80d8ff', // power-up: congelar
];

const NUT = 8;

// ---- Temas visuales / skins ----
const SKIN_STORAGE_KEY = 'tetris.skin';

const SKIN_PALETTES = {
  retro: [...COLORS],
  neon: [
    null,
    '#00e5ff', // I
    '#ffea00', // O
    '#e040fb', // T
    '#00e676', // S
    '#ff1744', // Z
    '#2979ff', // J
    '#ff9100', // L
    '#b0bec5', // N
    '#ff6d00', // power-up: bomba
    '#ffff00', // power-up: rayo
    '#d500f9', // power-up: tinte
    '#00e5ff', // power-up: gravedad
    '#18ffff', // power-up: congelar
  ],
  pastel: [
    null,
    '#a8d8ea', // I
    '#fff3b0', // O
    '#d5aaff', // T
    '#b8e6b8', // S
    '#ffb3ba', // Z
    '#bae1ff', // J
    '#ffdfba', // L
    '#d3d3d3', // N
    '#ffcc99', // power-up: bomba
    '#fff2a8', // power-up: rayo
    '#e0b3ff', // power-up: tinte
    '#a8e6e6', // power-up: gravedad
    '#c2f0f0', // power-up: congelar
  ],
  pixel: [...COLORS],
};

function loadStoredSkin() {
  try {
    const stored = localStorage.getItem(SKIN_STORAGE_KEY);
    return SKIN_PALETTES[stored] ? stored : 'retro';
  } catch {
    return 'retro';
  }
}

let currentSkin = loadStoredSkin();

const POWERUPS = [
  { code: 9,  key: 'bomb',    name: 'BOMBA',    icon: '💣' },
  { code: 10, key: 'bolt',    name: 'RAYO',     icon: '⚡' },
  { code: 11, key: 'dye',     name: 'TINTE',    icon: '🎨' },
  { code: 12, key: 'gravity', name: 'GRAVEDAD', icon: '⬇️' },
  { code: 13, key: 'freeze',  name: 'CONGELAR', icon: '❄️' },
];
const POWERUP_BY_CODE = new Map(POWERUPS.map(p => [p.code, p]));
const FREEZE_DURATION = 5000; // ms
const LINES_PER_POWERUP = 5;

function isPowerUp(type) {
  return type >= 9;
}

function powerUpOf(type) {
  return POWERUP_BY_CODE.get(type);
}

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (anillo 3x3 con hueco central)
  [[9]],   // power-up: bomba
  [[10]],  // power-up: rayo
  [[11]],  // power-up: tinte
  [[12]],  // power-up: gravedad
  [[13]],  // power-up: congelar
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const powerUpEl = document.getElementById('powerup');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let linesSincePowerUp, pendingPowerUp, freezeRemaining, activePowerUpName;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPowerUpPiece() {
  const powerUp = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
  const shape = PIECES[powerUp.code].map(row => [...row]);
  return { type: powerUp.code, shape, x: Math.floor(COLS / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    linesSincePowerUp += cleared;
    if (linesSincePowerUp >= LINES_PER_POWERUP) {
      linesSincePowerUp -= LINES_PER_POWERUP;
      pendingPowerUp = true;
    }
    updateHUD();
  }
}

function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    const values = [];
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c]) values.push(board[r][c]);
    }
    for (let r = ROWS - 1; r >= 0; r--) {
      board[r][c] = values.length ? values.pop() : 0;
    }
  }
}

function clearCells(cells) {
  let cleared = 0;
  for (const [r, c] of cells) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
    if (board[r][c]) {
      board[r][c] = 0;
      cleared++;
    }
  }
  if (cleared) score += cleared * 10 * level;
  return cleared;
}

function applyPowerUp(type, x, y) {
  const powerUp = powerUpOf(type);
  if (!powerUp) return;
  switch (powerUp.key) {
    case 'bomb': {
      const cells = [];
      for (let r = y - 1; r <= y + 1; r++)
        for (let c = x - 1; c <= x + 1; c++)
          cells.push([r, c]);
      clearCells(cells);
      applyGravity();
      break;
    }
    case 'bolt': {
      const cells = [];
      for (let c = 0; c < COLS; c++) cells.push([y, c]);
      for (let r = 0; r < ROWS; r++) cells.push([r, x]);
      clearCells(cells);
      applyGravity();
      break;
    }
    case 'dye': {
      const counts = new Array(9).fill(0);
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (board[r][c]) counts[board[r][c]]++;
      let target = 0, best = 0;
      for (let v = 1; v <= 8; v++) {
        if (counts[v] > best) { best = counts[v]; target = v; }
      }
      if (target) {
        const cells = [];
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++)
            if (board[r][c] === target) cells.push([r, c]);
        clearCells(cells);
        applyGravity();
      }
      break;
    }
    case 'gravity':
      applyGravity();
      break;
    case 'freeze':
      freezeRemaining = FREEZE_DURATION;
      break;
  }
  activePowerUpName = powerUp.name;
  updateHUD();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (isPowerUp(current.type)) {
    applyPowerUp(current.type, current.x, Math.max(0, current.y));
  } else {
    merge();
  }
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  if (pendingPowerUp) {
    pendingPowerUp = false;
    next = randomPowerUpPiece();
  } else {
    next = randomPiece();
  }
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  if (freezeRemaining > 0) {
    powerUpEl.textContent = `❄️ ${(freezeRemaining / 1000).toFixed(1)}s`;
  } else {
    powerUpEl.textContent = activePowerUpName ?? '—';
  }
}

function getSkinColor(colorIndex) {
  const palette = SKIN_PALETTES[currentSkin] || SKIN_PALETTES.retro;
  return palette[colorIndex] || COLORS[colorIndex];
}

function drawRoundedRectPath(context, x, y, w, h, r) {
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(x, y, w, h, r);
    return;
  }
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.arcTo(x + w, y, x + w, y + r, r);
  context.lineTo(x + w, y + h - r);
  context.arcTo(x + w, y + h, x + w - r, y + h, r);
  context.lineTo(x + r, y + h);
  context.arcTo(x, y + h, x, y + h - r, r);
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  context.closePath();
}

function drawPixelPattern(context, x, y, size) {
  const cells = 4;
  const cell = size / cells;
  context.save();
  context.globalAlpha *= 0.15;
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      context.fillStyle = (r + c) % 2 === 0 ? '#000000' : '#ffffff';
      context.fillRect(x + c * cell, y + r * cell, cell, cell);
    }
  }
  context.restore();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = getSkinColor(colorIndex);
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  context.globalAlpha = alpha ?? 1;

  switch (currentSkin) {
    case 'neon': {
      context.shadowBlur = size * 0.5;
      context.shadowColor = color;
      context.fillStyle = color;
      context.fillRect(px, py, s, s);
      context.shadowBlur = 0;
      context.fillStyle = 'rgba(255,255,255,0.18)';
      context.fillRect(px, py, s, 4);
      break;
    }
    case 'pastel': {
      const radius = Math.min(6, s / 4);
      context.fillStyle = color;
      drawRoundedRectPath(context, px, py, s, s, radius);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.25)';
      drawRoundedRectPath(context, px, py, s, Math.min(6, s), radius);
      context.fill();
      break;
    }
    case 'pixel': {
      context.fillStyle = color;
      context.fillRect(px, py, s, s);
      drawPixelPattern(context, px, py, s);
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px, py, s, 4);
      break;
    }
    default: {
      // retro (comportamiento original)
      context.fillStyle = color;
      context.fillRect(px, py, s, s);
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px, py, s, 4);
      break;
    }
  }

  // limpieza de estado del canvas para no contaminar el resto del frame
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
  context.globalAlpha = 1;
}

function drawNutHole(context, x, y, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.strokeStyle = getSkinColor(NUT);
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x * size + size / 2, y * size + size / 2, size * 0.3, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;
}

function drawPowerUpIcon(context, x, y, type, size, alpha) {
  const powerUp = powerUpOf(type);
  if (!powerUp) return;
  context.globalAlpha = alpha ?? 1;
  context.font = `${size * 0.6}px serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(powerUp.icon, x * size + size / 2, y * size + size / 2 + 1);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
  if (current.type === NUT) drawNutHole(ctx, current.x + 1, gy + 1, BLOCK, 0.2);
  if (isPowerUp(current.type)) drawPowerUpIcon(ctx, current.x, gy, current.type, BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.type === NUT) drawNutHole(ctx, current.x + 1, current.y + 1, BLOCK);
  if (isPowerUp(current.type)) drawPowerUpIcon(ctx, current.x, current.y, current.type, BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.type === NUT) drawNutHole(nextCtx, offX + 1, offY + 1, NB);
  if (isPowerUp(next.type)) drawPowerUpIcon(nextCtx, offX, offY, next.type, NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  animId = null;
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  if (freezeRemaining > 0) {
    freezeRemaining = Math.max(0, freezeRemaining - dt);
    updateHUD();
  } else {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  linesSincePowerUp = 0;
  pendingPowerUp = false;
  freezeRemaining = 0;
  activePowerUpName = null;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeToggle.addEventListener('change', () => {
  document.body.classList.toggle('light-theme', themeToggle.checked);
});

function applySkinBodyClass() {
  document.body.classList.remove('skin-neon', 'skin-pastel', 'skin-pixel');
  if (currentSkin !== 'retro') {
    document.body.classList.add(`skin-${currentSkin}`);
  }
}

if (skinSelect) {
  skinSelect.value = currentSkin;
  applySkinBodyClass();
  skinSelect.addEventListener('change', () => {
    currentSkin = SKIN_PALETTES[skinSelect.value] ? skinSelect.value : 'retro';
    try {
      localStorage.setItem(SKIN_STORAGE_KEY, currentSkin);
    } catch {
      // localStorage no disponible; el skin se mantiene solo en memoria
    }
    applySkinBodyClass();
  });
} else {
  applySkinBodyClass();
}

init();

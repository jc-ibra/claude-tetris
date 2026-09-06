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

const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const startHighscoresList = document.getElementById('start-highscores-list');
const startBestComboEl = document.getElementById('start-best-combo');
const startMaxLinesEl = document.getElementById('start-max-lines');
const resetScoresStartBtn = document.getElementById('reset-scores-start');

const overlayHighscoreForm = document.getElementById('overlay-highscore-form');
const playerNameInput = document.getElementById('player-name');
const saveScoreBtn = document.getElementById('save-score-btn');
const overlayHighscoresList = document.getElementById('overlay-highscores-list');
const overlayBestComboEl = document.getElementById('overlay-best-combo');
const overlayMaxLinesEl = document.getElementById('overlay-max-lines');
const resetScoresBtn = document.getElementById('reset-scores');

const HIGHSCORES_KEY = 'tetris.highscores';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let linesSincePowerUp, pendingPowerUp, freezeRemaining, activePowerUpName;
// Criterio de combo: cada bloqueo de pieza que limpia al menos 1 línea suma 1 al combo
// actual; un bloqueo que no limpia ninguna línea lo reinicia a 0. `maxComboThisGame`
// guarda el pico de la partida en curso para compararlo contra el histórico al game over.
let combo, maxComboThisGame, maxLinesThisGame;

function defaultHighScores() {
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function loadHighScores() {
  try {
    const raw = localStorage.getItem(HIGHSCORES_KEY);
    if (!raw) return defaultHighScores();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return defaultHighScores();
    const scores = Array.isArray(data.scores)
      ? data.scores
          .filter(s => s && typeof s.score === 'number' && Number.isFinite(s.score))
          .map(s => ({
            name: typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 12) : 'JUGADOR',
            score: s.score,
            lines: Number.isFinite(s.lines) ? s.lines : 0,
            level: Number.isFinite(s.level) ? s.level : 1,
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
      : [];
    return {
      scores,
      bestCombo: Number.isFinite(data.bestCombo) ? data.bestCombo : 0,
      maxLines: Number.isFinite(data.maxLines) ? data.maxLines : 0,
    };
  } catch {
    return defaultHighScores();
  }
}

function saveHighScores(data) {
  try {
    localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(data));
  } catch {
    // localStorage no disponible (modo privado, cuota, etc.) — se ignora silenciosamente.
  }
}

function renderHighScoresView(data, listEl, comboEl, maxLinesEl, highlightEntry) {
  listEl.innerHTML = '';
  if (data.scores.length === 0) {
    const li = document.createElement('li');
    li.className = 'highscore-empty';
    li.textContent = 'Sin récords todavía';
    listEl.appendChild(li);
  } else {
    data.scores.forEach(entry => {
      const li = document.createElement('li');
      li.textContent = `${entry.name} — ${entry.score.toLocaleString()} pts (Nv.${entry.level} · ${entry.lines} líneas)`;
      if (
        highlightEntry &&
        entry.name === highlightEntry.name &&
        entry.score === highlightEntry.score &&
        entry.lines === highlightEntry.lines &&
        entry.level === highlightEntry.level
      ) {
        li.classList.add('highscore-highlight');
      }
      listEl.appendChild(li);
    });
  }
  if (comboEl) comboEl.textContent = data.bestCombo;
  if (maxLinesEl) maxLinesEl.textContent = data.maxLines;
}

function refreshAllHighScoreViews(highlightEntry) {
  // Una sola lectura de localStorage; ambas vistas (start screen y overlay) se
  // pintan a partir de los mismos datos para evitar parsear el JSON dos veces.
  const data = loadHighScores();
  renderHighScoresView(data, overlayHighscoresList, overlayBestComboEl, overlayMaxLinesEl, highlightEntry ?? null);
  renderHighScoresView(data, startHighscoresList, startBestComboEl, startMaxLinesEl, highlightEntry ?? null);
}

function resetHighScores() {
  try {
    localStorage.removeItem(HIGHSCORES_KEY);
  } catch {
    // ignorar
  }
  refreshAllHighScoreViews(null);
}

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
    combo++;
    maxComboThisGame = Math.max(maxComboThisGame, combo);
    maxLinesThisGame = Math.max(maxLinesThisGame, cleared);
    updateHUD();
  } else {
    combo = 0;
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawNutHole(context, x, y, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.strokeStyle = COLORS[NUT];
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

  const data = loadHighScores();
  data.bestCombo = Math.max(data.bestCombo, maxComboThisGame);
  data.maxLines = Math.max(data.maxLines, maxLinesThisGame);
  saveHighScores(data);

  const lowestTop = data.scores.length > 0 ? data.scores[data.scores.length - 1].score : -Infinity;
  const qualifies = score > 0 && (data.scores.length < 5 || score > lowestTop);

  if (qualifies) {
    overlayHighscoreForm.classList.remove('hidden');
    playerNameInput.value = '';
    setTimeout(() => playerNameInput.focus(), 50);
  } else {
    overlayHighscoreForm.classList.add('hidden');
  }

  refreshAllHighScoreViews(null);
  overlay.classList.remove('hidden');
}

function submitHighScore() {
  if (overlayHighscoreForm.classList.contains('hidden')) return;
  const raw = playerNameInput.value.trim();
  const name = (raw ? raw.slice(0, 12) : 'JUGADOR').toUpperCase();
  const data = loadHighScores(); // recargar por si los récords cambiaron (p.ej. reset) desde el game over
  const entry = { name, score, lines, level };
  data.scores.push(entry);
  data.scores.sort((a, b) => b.score - a.score);
  data.scores = data.scores.slice(0, 5);
  saveHighScores(data);
  overlayHighscoreForm.classList.add('hidden');
  refreshAllHighScoreViews(entry);
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
  combo = 0;
  maxComboThisGame = 0;
  maxLinesThisGame = 0;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  overlayHighscoreForm.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!current) return; // el juego aún no ha comenzado (pantalla de inicio)
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

startBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  init();
});

saveScoreBtn.addEventListener('click', submitHighScore);
playerNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') submitHighScore();
});

resetScoresBtn.addEventListener('click', resetHighScores);
resetScoresStartBtn.addEventListener('click', resetHighScores);

refreshAllHighScoreViews(null);

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page Tetris implementation in vanilla JavaScript (ES6+), HTML5 Canvas, and CSS. No dependencies, no build step, no package.json.

## Running the game

There is no build/lint/test tooling. To run:

```bash
open index.html            # macOS, just opens the file
# or, for a local server (needed if features require http:// origin):
python3 -m http.server 8000
npx serve .
```

Then visit `http://localhost:8000` if using a server. Changes to `game.js`, `index.html`, or `style.css` take effect on browser reload — no compilation step.

There are no automated tests. Verify changes by opening the game in a browser and playing it (movement, rotation, line clears, scoring, pause, game over/restart).

## Architecture

Three files, all logic lives in `game.js` (~300 lines):

- **`index.html`** — DOM structure: `<canvas id="board">` (300×600, the 10×20 board at `BLOCK=30`px/cell), a side panel (`score`/`lines`/`level` spans, `<canvas id="next-canvas">` for the next-piece preview), and a shared `#overlay` div used for both PAUSE and GAME OVER states.
- **`style.css`** — dark/retro arcade visual theme only; no layout logic that `game.js` depends on beyond element IDs.
- **`game.js`** — all game state and logic, structured around a `requestAnimationFrame` loop. Key pieces:
  - **Board model**: `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or a piece-type index `1–7` used to look up color in `COLORS`.
  - **Pieces**: `PIECES` defines the 7 tetrominoes as small square matrices. Rotation (`rotateCW`) is a transpose + row reversal, not per-piece rotation tables.
  - **Collision** (`collide`): checks board bounds and existing fixed blocks; used for movement, rotation, and ghost-piece projection.
  - **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` columns until one doesn't collide, else the rotation is discarded.
  - **Game loop** (`loop`): accumulates elapsed time (`dropAccum`) against `dropInterval`; when exceeded, advances the piece down one row or locks it. Redraws every frame regardless.
  - **Locking & line clears**: `lockPiece` → `merge` (bakes current piece into `board`) → `clearLines` (scans bottom-up, splices full rows, unshifts empty ones at top, updates score/level/speed) → `spawn` (promotes `next` to `current`, generates new `next`; if the new piece immediately collides, calls `endGame`).
  - **Scoring**: `LINE_SCORES = [0,100,300,500,800]` indexed by lines-cleared-at-once, multiplied by `level`. Hard drop adds 2 pts/row dropped; soft drop adds 1 pt/row.
  - **Level/speed**: level = `floor(lines/10)+1`; `dropInterval = max(100, 1000 - (level-1)*90)` ms.
  - **Rendering**: `draw()` clears and redraws grid, locked board, ghost piece (`ghostY()` projects current piece straight down, drawn at `globalAlpha=0.2`), then the current piece. `drawNext()` renders the preview canvas independently at a fixed 30px block size.
  - **Global mutable state**: nearly everything (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, timing vars) lives in module-level `let` bindings reset by `init()` — there is no encapsulation/class structure, so changes to one system (e.g. scoring) can have implicit dependencies on others (e.g. `updateHUD()` must be called manually after state changes).

## Tunable constants (in `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, initial `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, the `<canvas id="board">` `width`/`height` in `index.html` must be updated to match (`COLS×BLOCK` × `ROWS×BLOCK`).

'use client'

// Tetris — the "can a signal framework really drive a game loop?" onboarding
// showcase for BarefootJS.
//
// What it demonstrates:
//   - A game loop (self-scheduling setTimeout) mutating signals every tick.
//   - Document-level keyboard handling wired up in `onMount`.
//   - A derived `display` memo that overlays the falling piece on the settled
//     board, rendered as a reactive 10×20 grid (nested `.map`).
//   - All the game rules (collision, rotation, line-clears) live in ordinary
//     functions — only the JSX reads signals, so the reactive graph stays tiny.

import { createSignal, createMemo, onMount } from '@barefootjs/client'

const COLS = 10
const ROWS = 20

// Each tetromino is a list of rotation states; a rotation is its 4 filled
// cells as [col, row] inside a small box. Colours are keyed by piece index + 1
// (0 means empty) and mapped to `.t-c1`…`.t-c7` classes in the stylesheet.
type Cell = [number, number]
const SHAPES: Cell[][][] = [
  // I
  [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  // J
  [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  // L
  [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
  // O
  [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  // S
  [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  // T
  [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  // Z
  [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
]

type Piece = { type: number; rot: number; x: number; y: number }

function emptyBoard(): number[][] {
  return Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0))
}

function randomType(): number {
  return Math.floor(Math.random() * SHAPES.length)
}

export function Tetris() {
  const [board, setBoard] = createSignal<number[][]>(emptyBoard())
  const [piece, setPiece] = createSignal<Piece | null>(null)
  const [nextType, setNextType] = createSignal<number>(randomType())
  const [score, setScore] = createSignal(0)
  const [lines, setLines] = createSignal(0)
  const [level, setLevel] = createSignal(1)
  const [running, setRunning] = createSignal(false)
  const [paused, setPaused] = createSignal(false)
  const [gameOver, setGameOver] = createSignal(false)

  // Instance-scoped loop handle. The component init runs once per mount, so a
  // plain closure variable is the natural "ref" for the pending timer.
  let dropTimer: ReturnType<typeof setTimeout> | null = null

  // Collision test for a hypothetical piece placement.
  const collides = (b: number[][], type: number, rot: number, px: number, py: number): boolean => {
    for (const [cx, cy] of SHAPES[type][rot]) {
      const x = px + cx
      const y = py + cy
      if (x < 0 || x >= COLS || y >= ROWS) return true
      if (y >= 0 && b[y][x] !== 0) return true
    }
    return false
  }

  // Display grid = settled board with the active piece painted on top.
  const display = createMemo(() => {
    const grid = board().map((row) => row.slice())
    const p = piece()
    if (p) {
      for (const [cx, cy] of SHAPES[p.type][p.rot]) {
        const x = p.x + cx
        const y = p.y + cy
        if (y >= 0 && y < ROWS && x >= 0 && x < COLS) grid[y][x] = p.type + 1
      }
    }
    return grid
  })

  // Preview grid for the "next" piece, drawn in a fixed 4×4 box.
  const preview = createMemo(() => {
    const grid = Array.from({ length: 4 }, () => Array<number>(4).fill(0))
    for (const [cx, cy] of SHAPES[nextType()][0]) {
      grid[cy][cx] = nextType() + 1
    }
    return grid
  })

  const spawn = () => {
    const type = nextType()
    setNextType(randomType())
    const p: Piece = { type, rot: 0, x: 3, y: 0 }
    if (collides(board(), p.type, p.rot, p.x, p.y)) {
      // No room for a new piece — the stack reached the top.
      setPiece(null)
      setRunning(false)
      setGameOver(true)
      if (dropTimer) clearTimeout(dropTimer)
      return
    }
    setPiece(p)
  }

  // Merge the active piece into the board, clear full rows, and score.
  const lockPiece = () => {
    const p = piece()
    if (!p) return
    const b = board().map((row) => row.slice())
    for (const [cx, cy] of SHAPES[p.type][p.rot]) {
      const x = p.x + cx
      const y = p.y + cy
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) b[y][x] = p.type + 1
    }
    const kept = b.filter((row) => row.some((c) => c === 0))
    const cleared = ROWS - kept.length
    while (kept.length < ROWS) kept.unshift(Array<number>(COLS).fill(0))
    setBoard(kept)
    if (cleared > 0) {
      const points = [0, 100, 300, 500, 800][cleared] * level()
      const total = lines() + cleared
      setScore(score() + points)
      setLines(total)
      setLevel(Math.floor(total / 10) + 1)
    }
    spawn()
  }

  const tick = () => {
    const p = piece()
    if (!p) return
    if (!collides(board(), p.type, p.rot, p.x, p.y + 1)) {
      setPiece({ ...p, y: p.y + 1 })
    } else {
      lockPiece()
    }
  }

  // Self-scheduling loop: reschedules itself at the current level's speed so a
  // level-up speeds the fall without juggling multiple intervals.
  const scheduleDrop = () => {
    if (dropTimer) clearTimeout(dropTimer)
    if (!running() || paused() || gameOver()) return
    const speed = Math.max(90, 800 - (level() - 1) * 70)
    dropTimer = setTimeout(() => {
      tick()
      scheduleDrop()
    }, speed)
  }

  const move = (dx: number) => {
    const p = piece()
    if (!p || paused() || gameOver()) return
    if (!collides(board(), p.type, p.rot, p.x + dx, p.y)) {
      setPiece({ ...p, x: p.x + dx })
    }
  }

  const softDrop = () => {
    if (!running() || paused() || gameOver()) return
    tick()
    scheduleDrop()
  }

  const rotate = () => {
    const p = piece()
    if (!p || paused() || gameOver()) return
    const rot = (p.rot + 1) % 4
    // Basic wall-kick: try in place, then nudged left/right.
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collides(board(), p.type, rot, p.x + kick, p.y)) {
        setPiece({ ...p, rot, x: p.x + kick })
        return
      }
    }
  }

  const hardDrop = () => {
    const p = piece()
    if (!p || paused() || gameOver()) return
    let y = p.y
    while (!collides(board(), p.type, p.rot, p.x, y + 1)) y++
    setScore(score() + (y - p.y) * 2)
    setPiece({ ...p, y })
    lockPiece()
    scheduleDrop()
  }

  const start = () => {
    setBoard(emptyBoard())
    setScore(0)
    setLines(0)
    setLevel(1)
    setGameOver(false)
    setPaused(false)
    setNextType(randomType())
    setRunning(true)
    spawn()
    scheduleDrop()
  }

  const togglePause = () => {
    if (!running() || gameOver()) return
    setPaused(!paused())
    scheduleDrop()
  }

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!running() || gameOver()) return
      const k = e.key
      if (k === 'ArrowLeft') { move(-1); e.preventDefault() }
      else if (k === 'ArrowRight') { move(1); e.preventDefault() }
      else if (k === 'ArrowDown') { softDrop(); e.preventDefault() }
      else if (k === 'ArrowUp') { rotate(); e.preventDefault() }
      else if (k === ' ') { hardDrop(); e.preventDefault() }
      else if (k === 'p' || k === 'P') { togglePause() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (dropTimer) clearTimeout(dropTimer)
    }
  })

  return (
    <div className="tetris">
      <div className="t-main">
        <div className="t-board">
          {display().map((row, y) => (
            <div className="t-row" key={y}>
              {row.map((cell, x) => (
                <div className={`t-cell ${cell ? 't-c' + cell : 't-empty'}`} key={x} />
              ))}
            </div>
          ))}

          {gameOver() && (
            <div className="t-overlay">
              <p className="t-overlay-title">Game Over</p>
              <button className="t-btn t-btn-primary" onClick={start}>Play again</button>
            </div>
          )}
          {paused() && !gameOver() && (
            <div className="t-overlay">
              <p className="t-overlay-title">Paused</p>
              <button className="t-btn" onClick={togglePause}>Resume</button>
            </div>
          )}
          {!running() && !gameOver() && (
            <div className="t-overlay">
              <p className="t-overlay-title">BarefootJS Tetris</p>
              <button className="t-btn t-btn-primary" onClick={start}>Start</button>
            </div>
          )}
        </div>

        <aside className="t-side">
          <div className="t-panel">
            <span className="t-label">Score</span>
            <span className="t-value">{score()}</span>
          </div>
          <div className="t-panel">
            <span className="t-label">Lines</span>
            <span className="t-value">{lines()}</span>
          </div>
          <div className="t-panel">
            <span className="t-label">Level</span>
            <span className="t-value">{level()}</span>
          </div>
          <div className="t-panel">
            <span className="t-label">Next</span>
            <div className="t-preview">
              {preview().map((row, y) => (
                <div className="t-row" key={y}>
                  {row.map((cell, x) => (
                    <div className={`t-mini ${cell ? 't-c' + cell : 't-empty'}`} key={x} />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="t-controls">
            <button className="t-btn" onClick={togglePause}>{paused() ? 'Resume' : 'Pause'}</button>
            <button className="t-btn" onClick={start}>Restart</button>
          </div>
        </aside>
      </div>

      <p className="t-hint">
        ← → move · ↑ rotate · ↓ soft drop · Space hard drop · P pause
      </p>
    </div>
  )
}

export default Tetris

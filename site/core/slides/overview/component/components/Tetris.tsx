"use client"

import { batch, createEffect, createMemo, createSignal, onCleanup, onMount } from '@barefootjs/client'

const COLS = 10
const ROWS = 20

type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'
type Cell = string | null
type Offset = [number, number]

const COLORS: Record<PieceType, string> = {
  I: '#22d3ee',
  O: '#facc15',
  T: '#a855f7',
  S: '#22c55e',
  Z: '#ef4444',
  J: '#3b82f6',
  L: '#f97316',
}

const SHAPES: Record<PieceType, Offset[][]> = {
  I: [
    [[1, 0], [1, 1], [1, 2], [1, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 1], [1, 1], [2, 1], [3, 1]],
  ],
  O: [
    [[0, 1], [0, 2], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [1, 2]],
  ],
  T: [
    [[0, 1], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 1]],
    [[0, 1], [1, 0], [1, 1], [2, 1]],
  ],
  S: [
    [[0, 1], [0, 2], [1, 0], [1, 1]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [0, 2], [1, 0], [1, 1]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
  ],
  Z: [
    [[0, 0], [0, 1], [1, 1], [1, 2]],
    [[0, 2], [1, 1], [1, 2], [2, 1]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
    [[0, 2], [1, 1], [1, 2], [2, 1]],
  ],
  J: [
    [[0, 0], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 0], [2, 1]],
  ],
  L: [
    [[0, 2], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [1, 2], [2, 0]],
    [[0, 0], [0, 1], [1, 1], [2, 1]],
  ],
}

const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

function randomType(): PieceType {
  return PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)]
}

function emptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null as Cell))
}

type ActivePiece = { type: PieceType; rotation: number; row: number; col: number }

function spawnPiece(type: PieceType): ActivePiece {
  return { type, rotation: 0, row: 0, col: 3 }
}

function collides(board: Cell[][], type: PieceType, rotation: number, row: number, col: number): boolean {
  const cells = SHAPES[type][rotation]
  for (const [dr, dc] of cells) {
    const r = row + dr
    const c = col + dc
    if (c < 0 || c >= COLS || r >= ROWS) return true
    if (r >= 0 && board[r][c] !== null) return true
  }
  return false
}

function flatKey(r: number, c: number): string {
  return `${r}-${c}`
}

export function Tetris() {
  const [board, setBoard] = createSignal<Cell[][]>(emptyBoard())
  const [piece, setPiece] = createSignal<ActivePiece>(spawnPiece(randomType()))
  const [nextType, setNextType] = createSignal<PieceType>(randomType())
  const [score, setScore] = createSignal(0)
  const [lines, setLines] = createSignal(0)
  const [gameOver, setGameOver] = createSignal(false)

  const level = createMemo(() => Math.floor(lines() / 10) + 1)
  const speed = createMemo(() => Math.max(120, 700 - (level() - 1) * 60))

  const tryMove = (dr: number, dc: number): boolean => {
    const p = piece()
    const nr = p.row + dr
    const nc = p.col + dc
    if (collides(board(), p.type, p.rotation, nr, nc)) return false
    setPiece({ ...p, row: nr, col: nc })
    return true
  }

  const lockPiece = () => {
    const p = piece()
    const next = board().map((row) => row.slice())
    for (const [dr, dc] of SHAPES[p.type][p.rotation]) {
      const r = p.row + dr
      const c = p.col + dc
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) next[r][c] = COLORS[p.type]
    }

    let cleared = 0
    const kept = next.filter((row) => {
      const full = row.every((cell) => cell !== null)
      if (full) cleared += 1
      return !full
    })
    while (kept.length < ROWS) kept.unshift(Array.from({ length: COLS }, () => null as Cell))

    const gained = [0, 100, 300, 500, 800][cleared] * level()
    const upcoming = nextType()
    const fresh = spawnPiece(upcoming)
    const over = collides(kept, fresh.type, fresh.rotation, fresh.row, fresh.col)

    batch(() => {
      setBoard(kept)
      if (cleared > 0) {
        setLines((n) => n + cleared)
        setScore((s) => s + gained)
      }
      if (over) {
        setGameOver(true)
      } else {
        setPiece(fresh)
        setNextType(randomType())
      }
    })
  }

  const tick = () => {
    if (gameOver()) return
    if (!tryMove(1, 0)) lockPiece()
  }

  const moveLeft = () => { if (!gameOver()) tryMove(0, -1) }
  const moveRight = () => { if (!gameOver()) tryMove(0, 1) }
  const softDrop = () => {
    if (gameOver()) return
    if (!tryMove(1, 0)) lockPiece()
    else setScore((s) => s + 1)
  }
  const hardDrop = () => {
    if (gameOver()) return
    let dropped = 0
    while (tryMove(1, 0)) dropped += 1
    setScore((s) => s + dropped * 2)
    lockPiece()
  }
  const rotatePiece = () => {
    if (gameOver()) return
    const p = piece()
    const nextRotation = (p.rotation + 1) % 4
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collides(board(), p.type, nextRotation, p.row, p.col + kick)) {
        setPiece({ ...p, rotation: nextRotation, col: p.col + kick })
        return
      }
    }
  }

  const restart = () => {
    batch(() => {
      setBoard(emptyBoard())
      setPiece(spawnPiece(randomType()))
      setNextType(randomType())
      setScore(0)
      setLines(0)
      setGameOver(false)
    })
  }

  createEffect(() => {
    const ms = speed()
    const id = setInterval(tick, ms)
    onCleanup(() => clearInterval(id))
  })

  onMount(() => {
    const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'Enter'])
    const handleKeyDown = (e: KeyboardEvent) => {
      // Always swallow every game key while this component is mounted —
      // even when unused (e.g. Enter while playing, arrows during game
      // over) — so Peitho's own document-level keydown listener never
      // sees them. Peitho's `showSlide` re-injects the current slide's
      // HTML unconditionally, even when clamped to the same index, so a
      // leaked key would remount this component and silently wipe game
      // state instead of just failing to navigate.
      if (!GAME_KEYS.has(e.key)) return
      e.preventDefault()
      e.stopPropagation()
      if (gameOver()) {
        if (e.key === 'Enter') restart()
        return
      }
      if (e.key === 'ArrowLeft') moveLeft()
      else if (e.key === 'ArrowRight') moveRight()
      else if (e.key === 'ArrowDown') softDrop()
      else if (e.key === 'ArrowUp') rotatePiece()
      else if (e.key === ' ') hardDrop()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown, true))
  })

  const cells = createMemo(() => {
    const b = board()
    const p = piece()
    const overlay = new Set<string>()
    const overlayColor = COLORS[p.type]
    for (const [dr, dc] of SHAPES[p.type][p.rotation]) {
      const r = p.row + dr
      const c = p.col + dc
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) overlay.add(flatKey(r, c))
    }
    const out: { key: string; color: Cell }[] = []
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const key = flatKey(r, c)
        out.push({ key, color: overlay.has(key) ? overlayColor : b[r][c] })
      }
    }
    return out
  })

  const nextCells = createMemo(() => {
    const t = nextType()
    const shape = SHAPES[t][0]
    const filled = new Set(shape.map(([r, c]) => flatKey(r, c)))
    const out: { key: string; color: Cell }[] = []
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const key = flatKey(r, c)
        out.push({ key, color: filled.has(key) ? COLORS[t] : null })
      }
    }
    return out
  })

  return (
    <div className="tetris-app">
      <div className="tetris-board">
        {cells().map((cell) => (
          <div key={cell.key} className="tetris-cell" style={`background:${cell.color ?? 'transparent'}`}></div>
        ))}
      </div>
      <div className="tetris-side">
        <div className="tetris-panel">
          <div className="tetris-label">SCORE</div>
          <div className="tetris-value">{score()}</div>
        </div>
        <div className="tetris-panel">
          <div className="tetris-label">LINES</div>
          <div className="tetris-value">{lines()}</div>
        </div>
        <div className="tetris-panel">
          <div className="tetris-label">NEXT</div>
          <div className="tetris-next">
            {nextCells().map((cell) => (
              <div key={cell.key} className="tetris-cell" style={`background:${cell.color ?? 'transparent'}`}></div>
            ))}
          </div>
        </div>
        {gameOver() ? (
          <div className="tetris-gameover">
            GAME OVER
            <br />
            Press Enter to restart
          </div>
        ) : null}
      </div>
    </div>
  )
}

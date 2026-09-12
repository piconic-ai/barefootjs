"use client"

// "Every bullet is a DOM node."
//
// A retro arcade cabinet on the deck's black slide. Every sprite — every
// alien, bullet, spark and star — is one real DOM element driven by its own
// signals. Nothing is diffed and nothing is redrawn wholesale: an entity owns
// (x, y, o, frame) signals and is rendered by one <Sprite/> instance, so the
// compiler emits exactly one effect per element. Moving an entity re-runs that
// one effect and rewrites one `style`; animating it (the two-frame alien
// idle, the zig-zag bolt, the thruster flicker, the white pop of a kill) swaps
// one class through the SAME effect. The metrics in the bottom-left corner
// count all of it every 500 ms.
//
// The keyed `.map()` rows below hold COMPONENTS, not bare elements: a component
// row is rendered through the eager `mapArray` path, where the row body is its
// own reactive root. That is what makes `props.e.x()` a tracked read inside the
// row's own effect (an inlined element row is applied by the reconciler
// untracked, so a per-entity signal would never reach it). The array signals
// therefore only ever carry MEMBERSHIP — they are published when an entity
// spawns or dies, never to move one.

import { batch, createMemo, createSignal, onCleanup, onMount } from '@barefootjs/client'

const W = 1280
const H = 720
const SHIP_Y = 520
const SHIP_SPEED = 7.6
const SHOT_MS = 150
const MAX_SHOTS = 4
const STARS_FAR = 38
const STARS_NEAR = 22

const COLS = 10
const ROWS = 5
const ALIEN_COL = 74
const ALIEN_ROW = 42
const ALIEN_TOP = 212
const SWARM_LIMIT = 185
const ALIEN_FLOOR = 452
const UFO_LANE = 160
/** frames a killed alien stays on screen as the white pop */
const POP_FRAMES = 5

type Ent = {
  id: number
  kind: string
  /** the only reactive state an entity has: where it is, how bright, which frame */
  x: () => number
  setX: (v: number) => void
  y: () => number
  setY: (v: number) => void
  o: () => number
  setO: (v: number) => void
  fr: () => number
  setFr: (v: number) => void
  /** plain simulation fields — mutated in place, never rendered directly */
  vx: number
  vy: number
  life: number
  span: number
  hx: number
  hy: number
  pts: number
  state: number
  t: number
  sx: number
  sy: number
  dir: number
  dead: boolean
}

let seq = 0
/** survives a remount, so the cabinet remembers the best run of the session */
let hiScore = 0

function makeEnt(kind: string, x: number, y: number, o: number, fr: number): Ent {
  const [gx, sx] = createSignal(x)
  const [gy, sy] = createSignal(y)
  const [go, so] = createSignal(o)
  const [gf, sf] = createSignal(fr)
  seq += 1
  return {
    id: seq,
    kind,
    x: gx,
    setX: sx,
    y: gy,
    setY: sy,
    o: go,
    setO: so,
    fr: gf,
    setFr: sf,
    vx: 0,
    vy: 0,
    life: 0,
    span: 1,
    hx: x,
    hy: y,
    pts: 0,
    state: 0,
    t: 0,
    sx: x,
    sy: y,
    dir: 1,
    dead: false,
  }
}

function pad(n: number, w: number): string {
  let s = String(Math.max(0, Math.floor(n)))
  while (s.length < w) s = '0' + s
  return s
}

/**
 * One entity, one element, one effect. `px-<kind><frame>` picks the pixel art
 * out of the stylesheet; the transform places it. Both are written by the same
 * compiler-generated effect, and only when this entity's own signals change.
 */
function Sprite(props: { e: Ent }) {
  return <i className={`a-ent px-${props.e.kind}${props.e.fr()}`} style={`transform:translate3d(${props.e.x()}px,${props.e.y()}px,0);opacity:${props.e.o()}`}></i>
}

export function Arcade() {
  // membership signals — one per entity class, published on spawn/death only
  const [stars, setStars] = createSignal<Ent[]>([])
  const [aliens, setAliens] = createSignal<Ent[]>([])
  const [ufos, setUfos] = createSignal<Ent[]>([])
  const [bolts, setBolts] = createSignal<Ent[]>([])
  const [shots, setShots] = createSignal<Ent[]>([])
  const [ships, setShips] = createSignal<Ent[]>([])
  const [sparks, setSparks] = createSignal<Ent[]>([])

  // 'title' | 'play' | 'demo' | 'over'
  const [screen, setScreen] = createSignal('title')
  const [flash, setFlash] = createSignal(0)
  const [reduced, setReduced] = createSignal(false)

  // game UI
  const [score, setScore] = createSignal(0)
  const [hi, setHi] = createSignal(hiScore)
  const [wave, setWave] = createSignal(1)
  const [lives, setLives] = createSignal(3)

  // instrumentation
  const [fps, setFps] = createSignal(0)
  const [nodes, setNodes] = createSignal(0)
  const [writes, setWrites] = createSignal(0)

  const scoreText = createMemo(() => pad(score(), 6))
  const hiText = createMemo(() => pad(hi(), 6))
  const waveText = createMemo(() => pad(wave(), 2))
  const livesText = createMemo(() => pad(lives(), 1))
  const rootClass = createMemo(() => (reduced() ? 'arcade is-rm' : 'arcade'))
  const panelClass = createMemo(() => {
    const s = screen()
    if (s === 'title') return 'a-panel is-title'
    if (s === 'over') return 'a-panel is-over'
    return 'a-panel'
  })
  const demoClass = createMemo(() => (screen() === 'demo' ? 'a-demo is-on' : 'a-demo'))
  const keysClass = createMemo(() => (screen() === 'play' ? 'a-keys is-on' : 'a-keys'))

  const starList: Ent[] = []
  const alienList: Ent[] = []
  const ufoList: Ent[] = []
  const boltList: Ent[] = []
  const shotList: Ent[] = []
  const shipList: Ent[] = []
  const sparkList: Ent[] = []

  let starsDirty = false
  let aliensDirty = false
  let ufoDirty = false
  let boltsDirty = false
  let shotsDirty = false
  let shipsDirty = false
  let sparksDirty = false

  let writeCount = 0
  let frameAcc = 0
  let writeAcc = 0
  let lastSample = 0
  let last = 0
  let raf = 0
  let timer = 0
  let running = false

  let player: Ent | null = null
  let swarmX = 0
  let swarmY = 0
  let swarmDir = 1
  let alive = 0
  let invuln = 0
  let lastShot = 0
  let nextDive = 0
  let nextUfo = 0
  let overAt = 0
  let wasDemo = false
  let idleAt = 0
  let idleFrame = 0
  let boltAt = 0
  let boltFrame = 0
  let ufoAt = 0
  let ufoFrame = 0
  let thrustAt = 0
  let thrustFrame = 0
  let leftDown = false
  let rightDown = false
  let fireDown = false
  let fireTap = false

  const publish = () => {
    if (starsDirty) { setStars(starList.slice()); starsDirty = false }
    if (aliensDirty) { setAliens(alienList.slice()); aliensDirty = false }
    if (ufoDirty) { setUfos(ufoList.slice()); ufoDirty = false }
    if (boltsDirty) { setBolts(boltList.slice()); boltsDirty = false }
    if (shotsDirty) { setShots(shotList.slice()); shotsDirty = false }
    if (shipsDirty) { setShips(shipList.slice()); shipsDirty = false }
    if (sparksDirty) { setSparks(sparkList.slice()); sparksDirty = false }
  }

  // Every write to an entity goes through these, so `writes / frame` is a count
  // of signal sets actually performed, not an estimate.
  const move = (e: Ent, x: number, y: number) => {
    e.setX(x)
    e.setY(y)
    writeCount += 2
  }
  const moveY = (e: Ent, y: number) => {
    e.setY(y)
    writeCount += 1
  }
  const fade = (e: Ent, o: number) => {
    e.setO(o)
    writeCount += 1
  }
  const frame = (e: Ent, fr: number) => {
    e.setFr(fr)
    writeCount += 1
  }

  const addScore = (n: number) => {
    const v = score() + n
    setScore(v)
    if (v > hiScore) {
      hiScore = v
      setHi(v)
    }
  }

  const prune = (list: Ent[]): boolean => {
    let removed = false
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].dead) {
        list.splice(i, 1)
        removed = true
      }
    }
    return removed
  }

  const clear = (list: Ent[]) => {
    if (list.length === 0) return false
    list.length = 0
    return true
  }

  // ---------- starfield: two parallax layers, the only thing that moves on the title screen
  const seedStars = () => {
    for (let i = 0; i < STARS_FAR; i++) {
      const s = makeEnt('star', Math.random() * W, Math.random() * H, 0.22 + Math.random() * 0.18, 0)
      s.vy = 0.16 + Math.random() * 0.18
      starList.push(s)
    }
    for (let i = 0; i < STARS_NEAR; i++) {
      const s = makeEnt('star', Math.random() * W, Math.random() * H, 0.42 + Math.random() * 0.2, 1)
      s.vy = 0.55 + Math.random() * 0.5
      starList.push(s)
    }
    starsDirty = true
  }

  const spawnWave = () => {
    // one family, three builds: light-green slim saucers on top, green standard
    // ones in the middle, the wide white build closest to the player. Colour is
    // the point value, the way a cabinet does it.
    const kinds = ['a', 'a', 'b', 'b', 'c']
    const points = [30, 30, 20, 20, 10]
    const left = (W - (COLS - 1) * ALIEN_COL) / 2
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const e = makeEnt(kinds[r], left + c * ALIEN_COL, ALIEN_TOP + r * ALIEN_ROW, 1, idleFrame)
        e.hx = left + c * ALIEN_COL
        e.hy = ALIEN_TOP + r * ALIEN_ROW
        e.pts = points[r]
        alienList.push(e)
      }
    }
    alive = COLS * ROWS
    swarmX = 0
    swarmY = 0
    swarmDir = 1
    aliensDirty = true
  }

  /**
   * The arcade pop: a ring of plain square sparks in the victim's colour, a few
   * of them white, thrown outward and faded. Deliberately abstract — nothing
   * here is ever shaped like a piece of the thing that died.
   */
  const burst = (x: number, y: number, n: number, spread: number, tint: string) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.35
      const sp = 1.1 + Math.random() * spread
      const p = makeEnt(i % 5 === 0 ? 'sw' : tint, x, y, 1, 0)
      p.vx = Math.cos(a) * sp
      p.vy = Math.sin(a) * sp - 0.4
      p.span = 38 + Math.floor(Math.random() * 28)
      p.life = p.span
      sparkList.push(p)
    }
    sparksDirty = true
  }

  /** the colour a saucer's sparks take — its own */
  const tintOf = (kind: string): string => (kind === 'a' ? 'sl' : kind === 'b' ? 'sg' : 'sw')

  /**
   * A kill: the alien becomes the white pop for a few frames (one class swap on
   * the same element — one extra write, no new node) and then leaves.
   */
  const popAlien = (e: Ent) => {
    burst(e.x(), e.y(), 26, 2.6, tintOf(e.kind))
    e.kind = 'pop'
    e.state = 3
    e.t = 0
    frame(e, e.fr() === 0 ? 1 : 0)
    alive -= 1
  }

  const fire = (now: number) => {
    if (!player || now - lastShot < SHOT_MS || shotList.length >= MAX_SHOTS) return
    lastShot = now
    const s = makeEnt('shot', player.x(), SHIP_Y - 20, 1, 0)
    s.vy = -13
    shotList.push(s)
    shotsDirty = true
  }

  const alienFire = (e: Ent) => {
    const b = makeEnt('bolt', e.x(), e.y() + 16, 1, boltFrame)
    b.vy = 4.2 + Math.random() * 2.2
    boltList.push(b)
    boltsDirty = true
  }

  const steer = (dir: number, f: number) => {
    if (dir === 0 || !player) return
    const nx = Math.max(40, Math.min(W - 40, player.x() + dir * SHIP_SPEED * f))
    player.setX(nx)
    writeCount += 1
  }

  // ---------- modes
  const wipe = () => {
    clear(alienList); aliensDirty = true
    clear(ufoList); ufoDirty = true
    clear(boltList); boltsDirty = true
    clear(shotList); shotsDirty = true
    clear(sparkList); sparksDirty = true
    clear(shipList); shipsDirty = true
    player = null
  }

  const begin = (mode: string) => {
    if (reduced()) return
    batch(() => {
      wipe()
      setScore(0)
      setWave(1)
      setLives(3)
      setScreen(mode)
      player = makeEnt('ship', W / 2, SHIP_Y, 1, 0)
      shipList.push(player)
      shipsDirty = true
      spawnWave()
      invuln = 0
      leftDown = false
      rightDown = false
      fireDown = false
      fireTap = false
      const now = performance.now()
      nextDive = now + 1600
      nextUfo = now + 9000
      publish()
    })
  }

  const toTitle = () => {
    batch(() => {
      wipe()
      setScreen('title')
      publish()
    })
  }

  const endGame = (now: number) => {
    wasDemo = screen() === 'demo'
    overAt = now
    clear(alienList); aliensDirty = true
    clear(ufoList); ufoDirty = true
    clear(boltList); boltsDirty = true
    clear(shotList); shotsDirty = true
    clear(shipList); shipsDirty = true
    player = null
    setScreen('over')
  }

  const loseLife = (now: number) => {
    if (invuln > 0 || !player) return
    const left = lives() - 1
    setLives(left)
    burst(player.x(), SHIP_Y, 34, 3.8, 'sw')
    setFlash(0.45)
    if (left <= 0) {
      endGame(now)
      return
    }
    invuln = 110
    player.setX(W / 2)
    writeCount += 1
  }

  // ---------- attract-mode pilot: tracks the nearest threat, sidesteps, fires
  const autopilot = (f: number, now: number) => {
    if (!player) return
    const here = player.x()
    let dir = 0
    for (const b of boltList) {
      if (b.y() > SHIP_Y - 260 && Math.abs(b.x() - here) < 34) dir = b.x() > here ? -1 : 1
    }
    let target: Ent | null = null
    let best = 1e9
    for (const e of alienList) {
      if (e.state === 3) continue
      const d = Math.abs(e.x() - here) + (H - e.y()) * (e.state === 1 ? 0.02 : 0.07)
      if (d < best) {
        best = d
        target = e
      }
    }
    for (const b of ufoList) {
      const d = Math.abs(b.x() - here) * 0.6
      if (d < best) {
        best = d
        target = b
      }
    }
    if (target) {
      const dx = target.x() - here
      if (dir === 0 && Math.abs(dx) > 6) dir = dx > 0 ? 1 : -1
      if (Math.abs(dx) < 40) fire(now)
    }
    steer(dir, f)
  }

  const manual = (f: number, now: number) => {
    steer((leftDown ? -1 : 0) + (rightDown ? 1 : 0), f)
    // `fireTap` catches a press-and-release that lands entirely between two
    // frames, so a quick tap always produces a shot.
    if (fireDown || fireTap) {
      fireTap = false
      fire(now)
    }
  }

  // ---------- the simulation
  const runStars = (f: number) => {
    for (const s of starList) {
      const ny = s.y() + s.vy * f
      if (ny > H + 2) {
        move(s, Math.random() * W, -2)
      } else {
        moveY(s, ny)
      }
    }
  }

  const runAliens = (f: number, now: number) => {
    // the swarm sweeps side to side and steps down, speeding up as it thins
    const speed = 0.45 + (1 - alive / (COLS * ROWS)) * 2.8 + (wave() - 1) * 0.22
    swarmX += swarmDir * speed * f
    if (swarmX > SWARM_LIMIT) { swarmX = SWARM_LIMIT; swarmDir = -1; swarmY += 15 }
    if (swarmX < -SWARM_LIMIT) { swarmX = -SWARM_LIMIT; swarmDir = 1; swarmY += 15 }

    if (now > idleAt) {
      idleAt = now + 460
      idleFrame = idleFrame === 0 ? 1 : 0
      for (const e of alienList) if (e.state === 0) frame(e, idleFrame)
    }

    for (const e of alienList) {
      if (e.state === 3) {
        // popped: hold the white flash a few frames, then leave
        e.t += f
        if (e.t > POP_FRAMES) {
          e.dead = true
          aliensDirty = true
        }
      } else if (e.state === 1) {
        // a dive: a sine sweep that leaves the swarm, exits the bottom and
        // comes back around the top
        e.t += f
        const nx = e.sx + Math.sin(e.t * 0.052) * 215 * e.dir
        const ny = e.sy + e.t * 3.05
        move(e, nx, ny)
        // a diver leaves through the bottom band where the caption and the
        // metrics live, so it dims out before it gets there
        if (ny > 548) fade(e, Math.max(0, 1 - (ny - 548) / 90))
        if (Math.random() < 0.019 * f) alienFire(e)
        if (ny > H + 50) {
          e.state = 2
          move(e, e.hx + swarmX, -50)
          fade(e, 1)
        }
      } else if (e.state === 2) {
        const ty = e.hy + swarmY
        const ny = e.y() + 4.6 * f
        const nx = e.x() + (e.hx + swarmX - e.x()) * Math.min(1, 0.06 * f)
        if (ny >= ty) {
          e.state = 0
          move(e, e.hx + swarmX, ty)
          frame(e, idleFrame)
        } else {
          move(e, nx, ny)
        }
      } else {
        move(e, e.hx + swarmX, e.hy + swarmY)
        if (Math.random() < 0.0013 * f) alienFire(e)
      }
    }

    // peel one off every so often
    if (now > nextDive && alive > 0) {
      nextDive = now + Math.max(520, 1500 - wave() * 130)
      let picked: Ent | null = null
      let tries = 0
      while (tries < 14 && picked === null) {
        const c = alienList[Math.floor(Math.random() * alienList.length)]
        if (c && c.state === 0) picked = c
        tries += 1
      }
      if (picked) {
        picked.state = 1
        picked.t = 0
        picked.sx = picked.x()
        picked.sy = picked.y()
        picked.dir = picked.x() > W / 2 ? -1 : 1
        frame(picked, 1)
      }
    }

    // the mothership crosses the top for a bonus
    if (now > nextUfo && ufoList.length === 0) {
      nextUfo = now + 13000 + Math.random() * 6000
      const b = makeEnt('ufo', -90, UFO_LANE, 1, 0)
      b.vx = 2.9
      b.pts = 300
      ufoList.push(b)
      ufoDirty = true
    }
    if (now > ufoAt) {
      ufoAt = now + 240
      ufoFrame = ufoFrame === 0 ? 1 : 0
      for (const b of ufoList) frame(b, ufoFrame)
    }
    for (const b of ufoList) {
      move(b, b.x() + b.vx * f, b.y())
      if (b.x() > W + 90) {
        b.dead = true
        ufoDirty = true
      }
    }

    if (ALIEN_TOP + (ROWS - 1) * ALIEN_ROW + swarmY > ALIEN_FLOOR) {
      swarmY = 0
      loseLife(now)
    }
  }

  const runBullets = (f: number, now: number) => {
    if (now > boltAt) {
      boltAt = now + 110
      boltFrame = boltFrame === 0 ? 1 : 0
      for (const b of boltList) frame(b, boltFrame)
    }
    for (const s of shotList) {
      const ny = s.y() + s.vy * f
      moveY(s, ny)
      if (ny < -14) {
        s.dead = true
        shotsDirty = true
      }
    }
    for (const b of boltList) {
      const ny = b.y() + b.vy * f
      moveY(b, ny)
      if (ny > 566) {
        b.dead = true
        boltsDirty = true
      }
    }
  }

  const runSparks = (f: number) => {
    for (const p of sparkList) {
      // drag + a touch of gravity: the burst blooms, then settles
      const k = 1 - 0.055 * f
      p.vx *= k
      p.vy = p.vy * k + 0.085 * f
      p.life -= f
      move(p, p.x() + p.vx * f, p.y() + p.vy * f)
      fade(p, Math.max(0, p.life / p.span))
      if (p.life <= 0) {
        p.dead = true
        sparksDirty = true
      }
    }
  }

  const runHits = (now: number) => {
    for (const s of shotList) {
      if (s.dead) continue
      const sx = s.x()
      const sy = s.y()
      for (const e of alienList) {
        if (e.dead || e.state === 3) continue
        if (Math.abs(e.x() - sx) < 24 && Math.abs(e.y() - sy) < 16) {
          s.dead = true
          shotsDirty = true
          addScore(e.pts)
          popAlien(e)
          break
        }
      }
      if (s.dead) continue
      for (const b of ufoList) {
        if (b.dead) continue
        if (Math.abs(b.x() - sx) < 68 && Math.abs(b.y() - sy) < 26) {
          s.dead = true
          b.dead = true
          shotsDirty = true
          ufoDirty = true
          burst(b.x(), b.y(), 34, 3.6, 'sw')
          addScore(b.pts)
          break
        }
      }
    }
    if (player) {
      const here = player.x()
      for (const b of boltList) {
        if (b.dead) continue
        if (Math.abs(b.x() - here) < 17 && Math.abs(b.y() - SHIP_Y) < 15) {
          b.dead = true
          boltsDirty = true
          loseLife(now)
        }
      }
      for (const e of alienList) {
        if (e.dead || e.state !== 1) continue
        if (Math.abs(e.x() - here) < 20 && Math.abs(e.y() - SHIP_Y) < 17) {
          e.dead = true
          alive -= 1
          aliensDirty = true
          burst(e.x(), e.y(), 20, 2.6)
          loseLife(now)
        }
      }
    }
  }

  const tick = (f: number, now: number) => {
    const s = screen()
    runStars(f)
    const fl = flash()
    if (fl > 0) setFlash(Math.max(0, fl - 0.05 * f))

    if (s === 'play' || s === 'demo') {
      if (s === 'demo') autopilot(f, now)
      else manual(f, now)

      if (now > thrustAt) {
        thrustAt = now + 150
        thrustFrame = thrustFrame === 0 ? 1 : 0
        if (player) frame(player, thrustFrame)
      }
      if (invuln > 0) {
        invuln -= f
        if (player) fade(player, invuln > 0 && Math.floor(invuln / 6) % 2 === 0 ? 0.25 : 1)
        if (invuln <= 0) invuln = 0
      }

      runAliens(f, now)
      runBullets(f, now)
      runHits(now)

      if (prune(shotList)) shotsDirty = true
      if (prune(boltList)) boltsDirty = true
      if (prune(alienList)) aliensDirty = true
      if (prune(ufoList)) ufoDirty = true
      if (alive <= 0 && alienList.length === 0) {
        setWave(wave() + 1)
        spawnWave()
      }
    } else if (s === 'over' && wasDemo && now - overAt > 2400) {
      begin('demo')
    }

    runSparks(f)
    if (prune(sparkList)) sparksDirty = true
    publish()
  }

  const step = (now: number) => {
    raf = requestAnimationFrame(step)
    const dt = last === 0 ? 16.7 : Math.min(50, now - last)
    last = now
    frameAcc += 1
    writeCount = 0
    batch(() => tick(dt / 16.6667, now))
    writeAcc += writeCount
  }

  // The three measured numbers. DOM nodes is a real querySelectorAll count of
  // the entity elements currently in the stage — never derived from the arrays.
  const sample = () => {
    const now = performance.now()
    const stage = document.querySelector('.arcade-stage')
    const live = stage ? stage.querySelectorAll('.a-ent').length : 0
    const secs = (now - lastSample) / 1000
    batch(() => {
      setFps(secs > 0 ? Math.round(frameAcc / secs) : 0)
      setNodes(live)
      setWrites(frameAcc > 0 ? Math.round(writeAcc / frameAcc) : 0)
    })
    frameAcc = 0
    writeAcc = 0
    lastSample = now
  }

  const start = () => {
    if (running) return
    running = true
    last = 0
    raf = requestAnimationFrame(step)
  }
  const stop = () => {
    running = false
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  const onStart = (e: MouseEvent) => {
    const el = e.target as HTMLElement
    if (el && el.blur) el.blur()
    begin('play')
  }
  const onDemo = (e: MouseEvent) => {
    const el = e.target as HTMLElement
    if (el && el.blur) el.blur()
    begin('demo')
  }

  onMount(() => {
    seedStars()
    lastSample = performance.now()

    // WCAG 2.3.3 / 2.2.2: reduced motion gets the title screen and nothing
    // else — no loop, no starfield drift, no way to start a run.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      batch(() => {
        setReduced(true)
        publish()
      })
      raf = requestAnimationFrame(sample)
      onCleanup(() => stop())
      return
    }

    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }

    // Swallow the game keys at the capture phase WHILE PLAYING: the peitho
    // viewer navigates on document keydown, and a leaked arrow would re-inject
    // this slide's HTML and remount the cabinet mid-frame. Escape is read but
    // never swallowed — it belongs to the viewer too — and PageUp / PageDown
    // are never touched.
    const LEFT = new Set(['ArrowLeft', 'a', 'A'])
    const RIGHT = new Set(['ArrowRight', 'd', 'D'])
    const FIRE = new Set([' ', 'Spacebar', 'ArrowUp', 'w', 'W'])
    const owned = (k: string) => LEFT.has(k) || RIGHT.has(k) || FIRE.has(k) || k === 'ArrowDown' || k === 's' || k === 'S'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (screen() !== 'title') toTitle()
        return
      }
      if (screen() !== 'play' || !owned(e.key)) return
      e.preventDefault()
      e.stopPropagation()
      if (LEFT.has(e.key)) leftDown = true
      else if (RIGHT.has(e.key)) rightDown = true
      else if (FIRE.has(e.key)) { fireDown = true; fireTap = true }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (screen() !== 'play' || !owned(e.key)) return
      e.preventDefault()
      e.stopPropagation()
      if (LEFT.has(e.key)) leftDown = false
      else if (RIGHT.has(e.key)) rightDown = false
      else if (FIRE.has(e.key)) fireDown = false
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    document.addEventListener('visibilitychange', onVisibility)
    timer = setInterval(sample, 500) as unknown as number
    publish()
    if (!document.hidden) start()

    onCleanup(() => {
      stop()
      clearInterval(timer)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      document.removeEventListener('visibilitychange', onVisibility)
    })
  })

  return (
    <div className={rootClass()}>
      <div className="arcade-stage" aria-hidden="true">
        {stars().map((e) => (
          <Sprite key={e.id} e={e} />
        ))}
        {ufos().map((e) => (
          <Sprite key={e.id} e={e} />
        ))}
        {aliens().map((e) => (
          <Sprite key={e.id} e={e} />
        ))}
        {bolts().map((e) => (
          <Sprite key={e.id} e={e} />
        ))}
        {shots().map((e) => (
          <Sprite key={e.id} e={e} />
        ))}
        {ships().map((e) => (
          <Sprite key={e.id} e={e} />
        ))}
        {sparks().map((e) => (
          <Sprite key={e.id} e={e} />
        ))}
      </div>
      <i className="arcade-flash" style={`opacity:${flash()}`}></i>
      <i className="arcade-crt" aria-hidden="true"></i>
      <i className="arcade-vig" aria-hidden="true"></i>

      <div className={demoClass()}>demo</div>

      <div className="arcade-score">
        <div className="s-row">
          <span className="s-k">score</span>
          <span className="s-v">{scoreText()}</span>
        </div>
        <div className="s-row">
          <span className="s-k">hi</span>
          <span className="s-v">{hiText()}</span>
        </div>
        <div className="s-row">
          <span className="s-k">wave</span>
          <span className="s-v">{waveText()}</span>
        </div>
        <div className="s-row">
          <span className="s-k">lives</span>
          <span className="s-v">{livesText()}</span>
        </div>
      </div>

      <div className={panelClass()}>
        <div className="a-logo" aria-hidden="true">
          <i className="a-glyph px-a0"></i>
          <i className="a-glyph px-b0"></i>
          <i className="a-glyph px-c0"></i>
          <i className="a-glyph px-b0"></i>
          <i className="a-glyph px-a0"></i>
        </div>
        <div className="a-wordmark">game over</div>
        <div className="a-final">final score {scoreText()}</div>
        <div className="a-buttons">
          <button className="a-btn" type="button" onClick={onStart}>game start</button>
          <button className="a-btn" type="button" onClick={onDemo}>demo</button>
        </div>
        <div className="a-keys">← → move · space fire · esc title</div>
        <div className="a-rm">reduced motion — animation off</div>
      </div>

      <div className="arcade-meta">
        <div className={keysClass()}>← → move · space fire · esc title</div>
        <div className="arcade-metrics">
          <span className="m-k">fps</span>
          <span className="m-v">{fps()}</span>
          <span className="m-sep">·</span>
          <span className="m-k">dom nodes</span>
          <span className="m-v">{nodes()}</span>
          <span className="m-sep">·</span>
          <span className="m-k">writes/frame</span>
          <span className="m-v">{writes()}</span>
        </div>
      </div>
    </div>
  )
}

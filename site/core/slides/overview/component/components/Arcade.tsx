"use client"

// "Every bullet is a DOM node."
//
// A full-bleed arcade shooter where every sprite on screen is one real DOM
// element driven by its own signals. Nothing is diffed and nothing is redrawn
// wholesale: each entity owns an (x, y, o) triple of signals, and each entity
// is rendered by one <Sprite/> instance, so the compiler emits exactly one
// effect per element. Moving an entity re-runs that one effect and touches one
// `style` attribute — the HUD counts the result every 500 ms.
//
// The keyed `.map()` rows below hold COMPONENTS, not bare elements: a component
// row is rendered through the eager `mapArray` path, where the row body is its
// own reactive root. That is what makes `props.e.x()` a tracked read inside the
// row's own effect (an inlined element row is applied by the reconciler
// untracked, so a per-entity signal would never reach it). The array signals
// therefore only ever carry MEMBERSHIP — they are published when an entity
// spawns or dies, never to move one.

import { batch, createSignal, onCleanup, onMount } from '@barefootjs/client'

const W = 1280
const H = 720
const SHIP_Y = 528
const SHIP_SPEED = 7.6
const SHOT_MS = 110
const IDLE_MS = 3000
const DUST_N = 56
const FOE_TOP = 188
const FOE_ROW = 62
const FOE_COL = 104
const DROP_MAX = 60

type Ent = {
  id: number
  kind: string
  /** position + opacity: the only reactive state an entity has */
  x: () => number
  setX: (v: number) => void
  y: () => number
  setY: (v: number) => void
  o: () => number
  setO: (v: number) => void
  /** plain simulation fields — mutated in place, never rendered directly */
  vx: number
  vy: number
  life: number
  span: number
  hx: number
  hy: number
  rot: number
  dead: boolean
}

let seq = 0

function makeEnt(kind: string, x: number, y: number, o: number): Ent {
  const [gx, sx] = createSignal(x)
  const [gy, sy] = createSignal(y)
  const [go, so] = createSignal(o)
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
    vx: 0,
    vy: 0,
    life: 0,
    span: 1,
    hx: x,
    hy: y,
    rot: 0,
    dead: false,
  }
}

/**
 * One entity, one element, one effect. The class picks the shape out of the
 * stylesheet; the style string is the only thing that ever changes, and it is
 * rewritten only when this entity's own signals change.
 */
function Sprite(props: { e: Ent }) {
  return <i className={`a-ent a-${props.e.kind}`} style={`transform:translate3d(${props.e.x()}px,${props.e.y()}px,0) rotate(${props.e.rot}deg);opacity:${props.e.o()}`}></i>
}

export function Arcade() {
  // membership signals — one per entity class, published on spawn/death only
  const [dust, setDust] = createSignal<Ent[]>([])
  const [foes, setFoes] = createSignal<Ent[]>([])
  const [shots, setShots] = createSignal<Ent[]>([])
  const [bolts, setBolts] = createSignal<Ent[]>([])
  const [bits, setBits] = createSignal<Ent[]>([])

  // the ship is a singleton, so it keeps its own signals in component scope
  const [px, setPx] = createSignal(W / 2)
  const [hurt, setHurt] = createSignal(false)
  const [flash, setFlash] = createSignal(0)

  // HUD
  const [score, setScore] = createSignal(0)
  const [fps, setFps] = createSignal(0)
  const [nodes, setNodes] = createSignal(0)
  const [writes, setWrites] = createSignal(0)
  const [mode, setMode] = createSignal('attract')

  const foeList: Ent[] = []
  const shotList: Ent[] = []
  const boltList: Ent[] = []
  const bitList: Ent[] = []
  const dustList: Ent[] = []

  let foesDirty = false
  let shotsDirty = false
  let boltsDirty = false
  let bitsDirty = false
  let dustDirty = false

  let writeCount = 0
  let frameAcc = 0
  let writeAcc = 0
  let lastSample = 0
  let last = 0
  let raf = 0
  let timer = 0
  let formT = 0
  let drop = 0
  let wave = 0
  let lastShot = 0
  let lastInput = -1e9
  let inv = 0
  let leftDown = false
  let rightDown = false
  let fireDown = false
  let fireTap = false
  let running = false

  const publish = () => {
    if (foesDirty) { setFoes(foeList.slice()); foesDirty = false }
    if (shotsDirty) { setShots(shotList.slice()); shotsDirty = false }
    if (boltsDirty) { setBolts(boltList.slice()); boltsDirty = false }
    if (bitsDirty) { setBits(bitList.slice()); bitsDirty = false }
    if (dustDirty) { setDust(dustList.slice()); dustDirty = false }
  }

  // Every position write goes through these two, so `writes / frame` in the HUD
  // is a count of signal sets actually performed, not an estimate.
  const move = (e: Ent, x: number, y: number) => {
    e.setX(x)
    e.setY(y)
    writeCount += 2
  }
  const fade = (e: Ent, o: number) => {
    e.setO(o)
    writeCount += 1
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

  const seedDust = () => {
    for (let i = 0; i < DUST_N; i++) {
      const d = makeEnt('dust', Math.random() * W, Math.random() * H, 0.08)
      d.vy = 0.12 + Math.random() * 0.3
      dustList.push(d)
    }
    dustDirty = true
  }

  const spawnWave = () => {
    wave += 1
    const cols = 8 + (wave % 2)
    const rows = 5
    const kinds = ['sq', 'di', 'ci']
    const left = (W - (cols - 1) * FOE_COL) / 2
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const kind = kinds[(r + c) % 3]
        const e = makeEnt(kind, left + c * FOE_COL, FOE_TOP + r * FOE_ROW, 1)
        e.hx = left + c * FOE_COL
        e.hy = FOE_TOP + r * FOE_ROW
        e.rot = kind === 'di' ? 45 : 0
        foeList.push(e)
      }
    }
    formT = 0
    drop = 0
    foesDirty = true
  }

  const burst = (x: number, y: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 0.9 + Math.random() * 2.2
      const p = makeEnt(i % 3 === 0 ? 'bit2' : 'bit', x, y, 1)
      p.vx = Math.cos(a) * sp
      p.vy = Math.sin(a) * sp - 0.6
      p.span = 28 + Math.floor(Math.random() * 22)
      p.life = p.span
      bitList.push(p)
    }
    bitsDirty = true
  }

  const fire = (now: number) => {
    if (now - lastShot < SHOT_MS) return
    lastShot = now
    const s = makeEnt('shot', px(), SHIP_Y - 18, 1)
    s.vy = -13.5
    shotList.push(s)
    shotsDirty = true
  }

  const foeFire = (e: Ent) => {
    const b = makeEnt('bolt', e.x(), e.y() + 12, 0.85)
    b.vy = 4.6 + Math.random() * 1.6
    boltList.push(b)
    boltsDirty = true
  }

  const steer = (dir: number, f: number) => {
    if (dir === 0) return
    const nx = Math.max(38, Math.min(W - 38, px() + dir * SHIP_SPEED * f))
    setPx(nx)
    writeCount += 1
  }

  // Attract mode: track the nearest foe, sidestep anything falling at us, fire
  // whenever roughly lined up. Runs until a key is pressed, and again 3 s after
  // the last one, so the slide is never still.
  const autopilot = (f: number, now: number) => {
    const here = px()
    let dir = 0
    for (const b of boltList) {
      if (b.y() > SHIP_Y - 230 && Math.abs(b.x() - here) < 30) dir = b.x() > here ? -1 : 1
    }
    let target: Ent | null = null
    let best = 1e9
    for (const e of foeList) {
      const d = Math.abs(e.x() - here) + (H - e.y()) * 0.06
      if (d < best) {
        best = d
        target = e
      }
    }
    if (target) {
      const dx = target.x() - here
      if (dir === 0 && Math.abs(dx) > 7) dir = dx > 0 ? 1 : -1
      if (Math.abs(dx) < 46) fire(now)
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

  const hitShip = (b: Ent) => {
    b.dead = true
    boltsDirty = true
    if (inv > 0) return
    inv = 78
    burst(px(), SHIP_Y, 20)
    setFlash(0.34)
    setHurt(true)
    setPx(W / 2)
    writeCount += 1
  }

  const tick = (f: number, now: number) => {
    const attract = now - lastInput > IDLE_MS
    setMode(attract ? 'attract' : 'playing')
    if (attract) autopilot(f, now)
    else manual(f, now)

    if (inv > 0) {
      inv -= f
      if (inv <= 0) {
        inv = 0
        setHurt(false)
      }
    }
    const fl = flash()
    if (fl > 0) setFlash(Math.max(0, fl - 0.035 * f))

    // formation: one shared sway, but every foe writes its own two signals
    formT += f
    drop = Math.min(DROP_MAX, drop + 0.06 * f)
    const sway = Math.sin(formT * 0.0135) * 116
    const bob = Math.sin(formT * 0.031) * 7
    for (const e of foeList) {
      move(e, e.hx + sway, e.hy + drop + bob)
      if (Math.random() < 0.0013 * f) foeFire(e)
    }

    for (const s of shotList) {
      const ny = s.y() + s.vy * f
      move(s, s.x(), ny)
      if (ny < -20) {
        s.dead = true
        shotsDirty = true
      }
    }

    for (const b of boltList) {
      const ny = b.y() + b.vy * f
      move(b, b.x(), ny)
      if (ny > 556) {
        b.dead = true
        boltsDirty = true
      }
    }

    for (const p of bitList) {
      // drag + a touch of gravity: the burst blooms, then settles, instead of
      // scattering into something that reads as noise
      const k = 1 - 0.06 * f
      p.vx *= k
      p.vy = p.vy * k + 0.08 * f
      p.life -= f
      move(p, p.x() + p.vx * f, p.y() + p.vy * f)
      fade(p, Math.max(0, p.life / p.span))
      if (p.life <= 0) {
        p.dead = true
        bitsDirty = true
      }
    }

    for (const d of dustList) {
      const ny = d.y() + d.vy * f
      move(d, d.x(), ny > H ? -4 : ny)
    }

    // collisions
    for (const s of shotList) {
      if (s.dead) continue
      const sx = s.x()
      const sy = s.y()
      for (const e of foeList) {
        if (e.dead) continue
        if (Math.abs(e.x() - sx) < 15 && Math.abs(e.y() - sy) < 15) {
          s.dead = true
          e.dead = true
          shotsDirty = true
          foesDirty = true
          burst(e.x(), e.y(), 18)
          setScore(score() + 10)
          break
        }
      }
    }
    const here = px()
    for (const b of boltList) {
      if (b.dead) continue
      if (Math.abs(b.x() - here) < 16 && Math.abs(b.y() - SHIP_Y) < 16) hitShip(b)
    }

    if (prune(shotList)) shotsDirty = true
    if (prune(boltList)) boltsDirty = true
    if (prune(bitList)) bitsDirty = true
    if (prune(foeList)) foesDirty = true
    if (foeList.length === 0 || drop >= DROP_MAX) {
      for (const e of foeList) e.dead = true
      prune(foeList)
      foesDirty = true
      spawnWave()
    }
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

  onMount(() => {
    seedDust()
    spawnWave()
    lastSample = performance.now()

    // WCAG 2.3.3 / 2.2.2: no loop at all when reduced motion is asked for —
    // one composed frame is placed and left alone.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      batch(() => {
        for (const e of foeList) move(e, e.hx, e.hy + 26)
        for (let i = 0; i < 4; i++) {
          const s = makeEnt('shot', W / 2 - 168 + i * 124, 342 + i * 74, 1)
          shotList.push(s)
        }
        burst(W / 2 + 104, 262, 11)
        // no time passes here, so the debris is walked forward by hand to the
        // shape it would have a few frames after the hit
        for (const p of bitList) {
          move(p, p.x() + p.vx * 13, p.y() + p.vy * 13)
          fade(p, 0.5)
        }
        shotsDirty = true
        setMode('paused (reduced motion)')
        publish()
      })
      raf = requestAnimationFrame(sample)
      onCleanup(() => stop())
      return
    }

    const onVisibility = () => {
      if (document.hidden) {
        stop()
        setMode('paused (hidden)')
      } else {
        start()
      }
    }

    // Swallow the game keys at the capture phase while mounted, exactly like
    // Tetris: the peitho viewer navigates on document keydown, and a leaked
    // arrow would re-inject this slide's HTML and remount the game mid-frame.
    // PageUp / PageDown / Escape are deliberately left alone.
    const LEFT = new Set(['ArrowLeft', 'a', 'A'])
    const RIGHT = new Set(['ArrowRight', 'd', 'D'])
    const FIRE = new Set([' ', 'Spacebar', 'ArrowUp', 'w', 'W'])
    const owned = (k: string) => LEFT.has(k) || RIGHT.has(k) || FIRE.has(k) || k === 'ArrowDown' || k === 's' || k === 'S'

    const onKeyDown = (e: KeyboardEvent) => {
      if (!owned(e.key)) return
      e.preventDefault()
      e.stopPropagation()
      lastInput = performance.now()
      if (LEFT.has(e.key)) leftDown = true
      else if (RIGHT.has(e.key)) rightDown = true
      else if (FIRE.has(e.key)) { fireDown = true; fireTap = true }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (!owned(e.key)) return
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
    <div className="arcade">
      <div className="arcade-stage" aria-hidden="true">
        {dust().map((e) => (
          <Sprite key={e.id} e={e} />
        ))}
        {foes().map((e) => (
          <Sprite key={e.id} e={e} />
        ))}
        {bolts().map((e) => (
          <Sprite key={e.id} e={e} />
        ))}
        {shots().map((e) => (
          <Sprite key={e.id} e={e} />
        ))}
        {bits().map((e) => (
          <Sprite key={e.id} e={e} />
        ))}
        <i className={hurt() ? 'a-ent a-ship a-ship-hurt' : 'a-ent a-ship'} style={`transform:translate3d(${px()}px,${SHIP_Y}px,0)`}></i>
        <i className="a-flash" style={`opacity:${flash()}`}></i>
      </div>
      <i className="arcade-rule" aria-hidden="true"></i>
      <div className="arcade-hud">
        <span className="hud-k">fps</span>
        <span className="hud-v">{fps()}</span>
        <span className="hud-k">DOM nodes</span>
        <span className="hud-v">{nodes()}</span>
        <span className="hud-k">writes / frame</span>
        <span className="hud-v">{writes()}</span>
        <span className="hud-k">score</span>
        <span className="hud-v">{score()}</span>
        <span className="hud-k">mode</span>
        <span className="hud-v">{mode()}</span>
      </div>
      <div className="arcade-hint">← → move · space fire</div>
    </div>
  )
}

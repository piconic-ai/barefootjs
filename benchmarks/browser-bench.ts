/**
 * Browser benchmark entry point — bundled and executed in real Chromium via Playwright.
 * Tests: Vanilla JS, BarefootJS, SolidJS, React (actual frameworks, real DOM).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Measure with enough repetitions to overcome browser timer precision (~0.1ms).
 * Runs `fn` in batches of `batchSize`, measures total time, returns per-op median.
 */
function measure(fn: () => void, rounds: number, batchSize = 1): number {
  // Warm up
  for (let i = 0; i < 3 * batchSize; i++) fn()

  const times: number[] = []
  for (let r = 0; r < rounds; r++) {
    const start = performance.now()
    for (let b = 0; b < batchSize; b++) fn()
    times.push((performance.now() - start) / batchSize)
  }
  times.sort((a, b) => a - b)
  return times[Math.floor(times.length / 2)]
}

let idCounter = 1
const adjectives = ['pretty','large','big','small','tall','short','long','handsome','plain','quaint','clean','elegant','easy','angry','crazy','helpful','mushy','odd','unsightly','adorable','important','inexpensive','cheap','expensive','fancy']
const colours = ['red','yellow','blue','green','pink','brown','purple','brown','white','black','orange']
const nouns = ['table','chair','house','bbq','desk','car','pony','cookie','sandwich','burger','pizza','mouse','keyboard']

function randomLabel() {
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${colours[Math.floor(Math.random() * colours.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`
}

// ---------------------------------------------------------------------------
// Vanilla JS
// ---------------------------------------------------------------------------

function vanillaCreate(tbody: HTMLElement, count: number): HTMLElement[] {
  const rows: HTMLElement[] = []
  const frag = document.createDocumentFragment()
  for (let i = 0; i < count; i++) {
    const tr = document.createElement('tr')
    const td1 = document.createElement('td')
    td1.className = 'col-md-1'
    td1.textContent = String(idCounter++)
    const td2 = document.createElement('td')
    td2.className = 'col-md-6'
    const a = document.createElement('a')
    a.textContent = randomLabel()
    td2.appendChild(a)
    tr.appendChild(td1)
    tr.appendChild(td2)
    frag.appendChild(tr)
    rows.push(tr)
  }
  tbody.appendChild(frag)
  return rows
}

// ---------------------------------------------------------------------------
// BarefootJS
// ---------------------------------------------------------------------------
// Import directly from the reactive source to avoid going through the
// package's subpath exports, which rely on the built dist being present.
import {
  createSignal as bfSignal,
  createEffect as bfEffect,
  createRoot as bfRoot,
} from '../packages/client/src/reactive.ts'

interface BfRow {
  label: [() => string, (v: string | ((p: string) => string)) => void]
  selected: [() => boolean, (v: boolean | ((p: boolean) => boolean)) => void]
  tr: HTMLElement
  dispose: () => void
}

function bfCreate(tbody: HTMLElement, count: number): BfRow[] {
  const rows: BfRow[] = []
  const frag = document.createDocumentFragment()
  for (let i = 0; i < count; i++) {
    const id = idCounter++
    let dispose = () => {}
    const tr = document.createElement('tr')
    const td1 = document.createElement('td')
    td1.className = 'col-md-1'
    td1.textContent = String(id)
    const td2 = document.createElement('td')
    td2.className = 'col-md-6'
    const a = document.createElement('a')
    td2.appendChild(a)
    tr.appendChild(td1)
    tr.appendChild(td2)

    const row = bfRoot((d) => {
      dispose = d
      const [label, setLabel] = bfSignal(randomLabel())
      const [selected, setSelected] = bfSignal(false)
      bfEffect(() => { a.textContent = label() })
      bfEffect(() => { tr.className = selected() ? 'danger' : '' })
      return { label: [label, setLabel], selected: [selected, setSelected], tr, dispose } as BfRow
    })!

    frag.appendChild(tr)
    rows.push(row)
  }
  tbody.appendChild(frag)
  return rows
}

// ---------------------------------------------------------------------------
// SolidJS
// ---------------------------------------------------------------------------
import {
  createSignal as solidSignal,
  createRenderEffect as solidEffect,
  createRoot as solidRoot,
} from 'solid-js'

interface SolidRow {
  label: [() => string, (v: string | ((p: string) => string)) => void]
  selected: [() => boolean, (v: boolean | ((p: boolean) => boolean)) => void]
  tr: HTMLElement
  dispose: () => void
}

function solidCreate(tbody: HTMLElement, count: number): SolidRow[] {
  const rows: SolidRow[] = []
  const frag = document.createDocumentFragment()
  for (let i = 0; i < count; i++) {
    const id = idCounter++
    let dispose = () => {}
    const tr = document.createElement('tr')
    const td1 = document.createElement('td')
    td1.className = 'col-md-1'
    td1.textContent = String(id)
    const td2 = document.createElement('td')
    td2.className = 'col-md-6'
    const a = document.createElement('a')
    td2.appendChild(a)
    tr.appendChild(td1)
    tr.appendChild(td2)

    const row = solidRoot((d) => {
      dispose = d
      const [label, setLabel] = solidSignal(randomLabel())
      const [selected, setSelected] = solidSignal(false)
      solidEffect(() => { a.textContent = label() })
      solidEffect(() => { tr.className = selected() ? 'danger' : '' })
      return { label: [label, setLabel], selected: [selected, setSelected], tr, dispose } as SolidRow
    })!

    frag.appendChild(tr)
    rows.push(row)
  }
  tbody.appendChild(frag)
  return rows
}

// ---------------------------------------------------------------------------
// React
// ---------------------------------------------------------------------------
import React from 'react'
import ReactDOM from 'react-dom/client'
import { flushSync } from 'react-dom'

interface ReactRowData { id: number; label: string; selected: boolean }
let reactRoot: ReturnType<typeof ReactDOM.createRoot> | null = null
let reactSetState: ((fn: (p: ReactRowData[]) => ReactRowData[]) => void) | null = null

function ReactApp() {
  const [rows, setRows] = React.useState<ReactRowData[]>([])
  reactSetState = setRows
  return React.createElement('tbody', null,
    rows.map(row =>
      React.createElement('tr', { key: row.id, className: row.selected ? 'danger' : '' },
        React.createElement('td', { className: 'col-md-1' }, String(row.id)),
        React.createElement('td', { className: 'col-md-6' },
          React.createElement('a', null, row.label)
        )
      )
    )
  )
}

function reactInit(container: HTMLElement) {
  reactRoot = ReactDOM.createRoot(container)
  flushSync(() => { reactRoot!.render(React.createElement(ReactApp)) })
}
function reactCreateRows(count: number) {
  const data: ReactRowData[] = []
  for (let i = 0; i < count; i++) data.push({ id: idCounter++, label: randomLabel(), selected: false })
  flushSync(() => { reactSetState!(() => data) })
  return data
}

// ---------------------------------------------------------------------------
// Run all benchmarks
// ---------------------------------------------------------------------------

const ROWS = 1000
const ROUNDS = 10
const results: Record<string, Record<string, number>> = {}

// batchSize: run fn N times per measurement to overcome timer precision (~0.1ms)
function run(name: string, benchmarks: Record<string, { fn: () => void, batch: number }>) {
  results[name] = {}
  for (const [label, { fn, batch }] of Object.entries(benchmarks)) {
    results[name][label] = measure(fn, ROUNDS, batch)
  }
}

// batch: repeat per measurement to overcome timer precision (~0.1ms).
// Keep low — React is ~15ms/op so large batches make it very slow.
const B_CREATE = 1
const B_UPDATE = 20
const B_SELECT = 20
const B_CLEAR = 1

// --- Vanilla ---
run('Vanilla', {
  create: { fn: () => {
    const t = document.createElement('tbody')
    idCounter = 1; vanillaCreate(t, ROWS); t.textContent = ''
  }, batch: B_CREATE },
  partial_update: (() => {
    const t = document.createElement('tbody')
    const rows = vanillaCreate(t, ROWS)
    return { fn: () => { for (let i = 0; i < rows.length; i += 10) rows[i].querySelector('a')!.textContent = randomLabel() }, batch: B_UPDATE }
  })(),
  select: (() => {
    const t = document.createElement('tbody')
    const rows = vanillaCreate(t, ROWS)
    return { fn: () => { for (const r of rows) r.className = ''; rows[Math.floor(Math.random() * ROWS)].className = 'danger' }, batch: B_SELECT }
  })(),
  clear: { fn: () => {
    const t = document.createElement('tbody')
    vanillaCreate(t, ROWS); t.textContent = ''
  }, batch: B_CLEAR },
})

// --- BarefootJS ---
run('BarefootJS', {
  create: { fn: () => {
    const t = document.createElement('tbody')
    idCounter = 1; const r = bfCreate(t, ROWS); for (const x of r) x.dispose(); t.textContent = ''
  }, batch: B_CREATE },
  partial_update: (() => {
    const t = document.createElement('tbody')
    const rows = bfCreate(t, ROWS)
    return { fn: () => { for (let i = 0; i < rows.length; i += 10) rows[i].label[1](randomLabel()) }, batch: B_UPDATE }
  })(),
  select: (() => {
    const t = document.createElement('tbody')
    const rows = bfCreate(t, ROWS)
    let prev: number | null = null
    return { fn: () => {
      const idx = Math.floor(Math.random() * ROWS)
      if (prev !== null) rows[prev].selected[1](false)
      rows[idx].selected[1](true)
      prev = idx
    }, batch: B_SELECT }
  })(),
  clear: { fn: () => {
    const t = document.createElement('tbody')
    const r = bfCreate(t, ROWS); for (const x of r) x.dispose(); t.textContent = ''
  }, batch: B_CLEAR },
})

// --- SolidJS ---
run('SolidJS', {
  create: { fn: () => {
    const t = document.createElement('tbody')
    idCounter = 1; const r = solidCreate(t, ROWS); for (const x of r) x.dispose(); t.textContent = ''
  }, batch: B_CREATE },
  partial_update: (() => {
    const t = document.createElement('tbody')
    const rows = solidCreate(t, ROWS)
    return { fn: () => { for (let i = 0; i < rows.length; i += 10) rows[i].label[1](randomLabel()) }, batch: B_UPDATE }
  })(),
  select: (() => {
    const t = document.createElement('tbody')
    const rows = solidCreate(t, ROWS)
    let prev: number | null = null
    return { fn: () => {
      const idx = Math.floor(Math.random() * ROWS)
      if (prev !== null) rows[prev].selected[1](false)
      rows[idx].selected[1](true)
      prev = idx
    }, batch: B_SELECT }
  })(),
  clear: { fn: () => {
    const t = document.createElement('tbody')
    const r = solidCreate(t, ROWS); for (const x of r) x.dispose(); t.textContent = ''
  }, batch: B_CLEAR },
})

// --- React ---
// Each benchmark captures its own setState to avoid interference from create's unmount.
{
  const createBench = { fn: () => {
    const c = document.createElement('div')
    reactInit(c); idCounter = 1; reactCreateRows(ROWS)
    flushSync(() => { reactSetState!(() => []) }); reactRoot!.unmount()
  }, batch: B_CREATE }

  const partialBench = (() => {
    const c = document.createElement('div')
    reactInit(c); reactCreateRows(ROWS)
    const mySetState = reactSetState!
    return { fn: () => {
      flushSync(() => {
        mySetState((prev) => {
          const next = [...prev]
          for (let i = 0; i < next.length; i += 10) next[i] = { ...next[i], label: randomLabel() }
          return next
        })
      })
    }, batch: B_UPDATE }
  })()

  const selectBench = (() => {
    const c = document.createElement('div')
    reactInit(c); reactCreateRows(ROWS)
    const mySetState = reactSetState!
    return { fn: () => {
      flushSync(() => {
        mySetState((prev) => prev.map((r, i) => ({ ...r, selected: i === Math.floor(Math.random() * ROWS) })))
      })
    }, batch: B_SELECT }
  })()

  const clearBench = (() => {
    const c = document.createElement('div')
    reactInit(c); reactCreateRows(ROWS)
    const mySetState = reactSetState!
    return { fn: () => {
      flushSync(() => { mySetState(() => []) })
      const data: ReactRowData[] = []
      for (let i = 0; i < ROWS; i++) data.push({ id: idCounter++, label: randomLabel(), selected: false })
      flushSync(() => { mySetState(() => data) })
    }, batch: B_CLEAR }
  })()

  run('React', {
    create: createBench,
    partial_update: partialBench,
    select: selectBench,
    clear: clearBench,
  })
}

// --- Scaling ---
const scaling: Record<string, Record<number, number>> = { Vanilla: {}, BarefootJS: {}, SolidJS: {}, React: {} }

for (const n of [1, 100, 1000]) {
  const batch = n <= 10 ? 50 : n <= 100 ? 20 : 10

  // Vanilla
  const tv = document.createElement('tbody')
  const rv = vanillaCreate(tv, 1000)
  scaling.Vanilla[n] = measure(() => {
    for (let i = 0; i < n; i++) { const idx = Math.floor(i * 1000 / n); rv[idx].querySelector('a')!.textContent = randomLabel() }
  }, 30, batch)

  // BarefootJS
  const tb = document.createElement('tbody')
  const rb = bfCreate(tb, 1000)
  scaling.BarefootJS[n] = measure(() => {
    for (let i = 0; i < n; i++) { const idx = Math.floor(i * 1000 / n); rb[idx].label[1](randomLabel()) }
  }, 30, batch)

  // SolidJS
  const ts = document.createElement('tbody')
  const rs = solidCreate(ts, 1000)
  scaling.SolidJS[n] = measure(() => {
    for (let i = 0; i < n; i++) { const idx = Math.floor(i * 1000 / n); rs[idx].label[1](randomLabel()) }
  }, 30, batch)

  // React — capture setState before loop continues
  const cr = document.createElement('div')
  reactInit(cr); reactCreateRows(1000)
  const mySetState = reactSetState!
  scaling.React[n] = measure(() => {
    flushSync(() => {
      mySetState((prev) => {
        const next = [...prev]
        for (let i = 0; i < n; i++) { const idx = Math.floor(i * 1000 / n); next[idx] = { ...next[idx], label: randomLabel() } }
        return next
      })
    })
  }, 30, batch)
  reactRoot!.unmount()
}

// Output as JSON for Playwright to capture
;(window as any).__benchResults = { results, scaling }
document.title = 'done'

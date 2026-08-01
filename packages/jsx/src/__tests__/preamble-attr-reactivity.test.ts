/**
 * An attribute reading a `.map()` callback preamble local is reactive — the
 * #2447 follow-up.
 *
 * ## What was broken
 *
 * ```tsx
 * {rows().map(row => {
 *   const cls = row.done ? 'done' : 'open'
 *   return <li key={row.id} class={cls}>{row.label}</li>
 * })}
 * ```
 *
 * `mapArray` reuses a row's DOM node on a same-key item update and re-runs
 * only the wired slots. `class={cls}` was not one: `classifyReactivity` sees a
 * bare local, not a signal or loop-param read, so it scored 'none' and the
 * value was interpolated into the row template instead. Row 1's class stayed
 * `open` after its item turned `done: true`, while the sibling `{row.label}`
 * text updated normally — the child-position twin of this had already been
 * fixed as a `preambleRegion` (#2389); the attribute position had not.
 *
 * ## The two halves, and why they are in different passes
 *
 *  1. **Phase 1 grants the slot** (`markPreambleAttrSlots`). An attribute is
 *     only wirable if its element carries a `bf` slot id, and that is decided
 *     when the element is BUILT — before the enclosing loop's preamble exists.
 *     The client-JS pass cannot grant one retroactively: the SSR template is
 *     rendered from this same IR and would not carry the marker.
 *  2. **The client-JS pass wires it** (`collectLoopChildReactiveAttrs` +
 *     `stringifyReactiveEffects`), re-running the preamble at the TOP of the
 *     row effect so the declarations exist before the first write.
 *
 * ## The lazy row graph keeps the shape
 *
 * `lazyRowEligibility` used to refuse a binding that reads a preamble local,
 * on the grounds that `applyOuter` could not prime a dependency the local
 * hides. That refusal is gone: `analyzeLazyPreamble` now reports the
 * preamble's own free identifiers and `classifyLazyBinding` substitutes them,
 * so the binding's dependencies are what the INITIALIZER read (`selected`),
 * and the apply bodies re-run the preamble on demand. Without that, this fix
 * would have de-optimised the exact row the §9.5 widening was built for. The
 * DOM behaviour is pinned in
 * `packages/client/__tests__/runtime/lazy-row-preamble.test.ts`.
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import type { IRElement, IRLoop, IRNode } from '../types'

const ROWS = (row: string, preamble = `const cls = row.done ? 'done' : 'open'`) => `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string; done: boolean }
export function Rows(props: { rows: Row[] }) {
  const [rows, setRows] = createSignal<Row[]>(props.rows)
  return (
    <ul>
      {rows().map(row => {
        ${preamble}
        return ${row}
      })}
    </ul>
  )
}
`

function clientJs(source: string, file = 'Rows.tsx'): string {
  const r = compileJSX(source, file, { adapter: new TestAdapter() })
  const errors = r.errors.filter(e => e.severity !== 'warning')
  if (errors.length > 0) throw new Error(errors.map(e => `${e.code}: ${e.message}`).join('\n'))
  const js = r.files.find(f => f.type === 'clientJs')?.content
  if (!js) throw new Error('no client JS emitted')
  return js
}

function findLoop(node: IRNode | null): IRLoop | null {
  if (!node) return null
  if (node.type === 'loop') return node
  const kids = (node as IRElement).children
  if (!Array.isArray(kids)) return null
  for (const c of kids) {
    const hit = findLoop(c)
    if (hit) return hit
  }
  return null
}

/** The `<li>` row root of the compiled loop. */
function rowRoot(source: string): IRElement {
  const loop = findLoop(jsxToIR(analyzeComponent(source, 'Rows.tsx')))
  if (!loop) throw new Error('no loop in IR')
  return loop.children[0] as IRElement
}

beforeAll(() => {
  // The first analyzeComponent in a process pays TS program setup on its own.
  analyzeComponent(ROWS(`<li key={row.id}>{row.label}</li>`), 'Warmup.tsx')
}, 60_000)

describe('Phase 1 — the slot the attribute needs', () => {
  test('an element whose attribute reads a preamble local gets a slot id', () => {
    const li = rowRoot(ROWS(`<li key={row.id} class={cls}>{row.label}</li>`))
    expect(li.slotId).not.toBeNull()
  })

  test('a row with no preamble-reading attribute is untouched', () => {
    // The guard against granting slots (and shifting every later slot id) to
    // rows that do not need one.
    const li = rowRoot(ROWS(`<li key={row.id} class="static">{row.label}</li>`))
    expect(li.slotId).toBeNull()
  })

  test('`key` never counts — it is renamed to data-key and driven by keyFn', () => {
    const li = rowRoot(ROWS(`<li key={cls}>{row.label}</li>`))
    expect(li.slotId).toBeNull()
  })

  test('a nested element gets its own slot, not the row root', () => {
    const li = rowRoot(ROWS(`<li key={row.id}><span class={cls}>{row.label}</span></li>`))
    expect(li.slotId).toBeNull()
    expect((li.children[0] as IRElement).slotId).not.toBeNull()
  })
})

describe('client JS — the attribute is wired, and the preamble precedes it', () => {
  const js = clientJs(ROWS(`<li key={row.id} class={cls}>{row.label}</li>`))
  const plan = js.slice(js.indexOf('mapArrayLazy('), js.indexOf(`}, 'l0')`))

  test('the attribute is written by a binding, not baked into the row template', () => {
    const tpl = js.slice(js.indexOf('__tpl_l0.innerHTML'), js.indexOf('mapArrayLazy('))
    expect(tpl).not.toContain('class=')
    expect(plan).toContain(`setAttribute('class', String(__v))`)
  })

  test('applyItem re-runs the preamble ahead of the write', () => {
    const applyItem = plan.slice(plan.indexOf('applyItem:'))
    const preambleAt = applyItem.indexOf("const cls = row().done ? 'done' : 'open'")
    const writeAt = applyItem.indexOf(`setAttribute('class'`)
    expect(preambleAt).toBeGreaterThanOrEqual(0)
    expect(writeAt).toBeGreaterThan(preambleAt)
  })

  test('the row stays on the lazy graph — no per-row reactive resource', () => {
    expect(js).toContain('mapArrayLazy(')
    expect(js).not.toMatch(/\bmapArray\(/)
    expect(plan).not.toContain('createEffect')
    expect(plan).not.toContain('createRoot')
  })

  test('this row is item-driven only, so no applyOuter is emitted', () => {
    // `row.done` is the only dependency. The contrast — a preamble reading an
    // outer signal, which must reach the prime list — is
    // `lazy-preamble.test.ts`'s `applyOuter` pair.
    expect(plan).not.toContain('applyOuter:')
  })
})

describe('a STATIC-ARRAY loop must NOT be wired', () => {
  // Regression: the first cut of this change classified the attribute here
  // too, and the emitted `static-array-child-init` `forEach` — which has no
  // per-row body and so no preamble in scope — wrote
  // `setAttribute('data-active', active ? …)` against a FREE VARIABLE. The
  // ReferenceError killed the whole component's init, taking any nested child
  // component's hydration with it. Caught by the gallery-nav e2e (the shells
  // are exactly this shape and the badges mounted inside them vanished), and
  // pinned here so the compiler catches it next time.
  const NAV = `
'use client'
const NAV_ITEMS = [
  { key: 'a', href: '/a', label: 'A' },
  { key: 'b', href: '/b', label: 'B' },
]
export function Nav(props: { current: string }) {
  return (
    <nav>
      {NAV_ITEMS.map(item => {
        const active = item.key === props.current
        return <a key={item.key} href={item.href} data-active={active ? 'true' : 'false'}>{item.label}</a>
      })}
    </nav>
  )
}
`
  const js = clientJs(NAV, 'Nav.tsx')

  test('no attribute effect reads the preamble local', () => {
    // The `data-active` write must not be emitted into the init body at all:
    // there is no scope there that declares `active`. The sibling `href`
    // effect IS emitted, which is what makes this a targeted decline rather
    // than the whole loop going unwired.
    const init = js.slice(0, js.indexOf(`hydrate('Nav'`))
    expect(init).not.toContain(`setAttribute('data-active'`)
    expect(init).toContain(`setAttribute('href'`)
  })

  test('the value stays baked into the SSR template', () => {
    expect(js).toContain('data-active=')
  })
})

describe('unaffected shapes keep their emission', () => {
  test('a loop with no preamble emits no preamble statements', () => {
    const js = clientJs(`
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string; done: boolean }
export function Plain(props: { rows: Row[] }) {
  const [rows, setRows] = createSignal<Row[]>(props.rows)
  return <ul>{rows().map(row => <li key={row.id} class={row.done ? 'done' : 'open'}>{row.label}</li>)}</ul>
}
`, 'Plain.tsx')
    expect(js).not.toContain('const cls =')
  })
})

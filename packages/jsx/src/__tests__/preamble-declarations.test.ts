/**
 * `.map()` callback preamble → backend-neutral value declarations (#2447).
 *
 * ## What was broken
 *
 * A block-body `.map()` whose preamble computes a value used in the row
 * (`const cls = row.done ? 'done' : 'open'`) carried that preamble only as
 * `segments` — JS text, which a template language cannot execute. Every DSL
 * adapter emitted the row anyway, reading a name it never assigned: ERB read
 * `v[:cls]` (an unseeded vars-Hash key), Go read `$.Cls` (a PARENT-struct
 * field), the rest read a bare undefined local. The class rendered empty, on
 * eight backends, with no diagnostic — the exact silent divergence the
 * sound-or-loud invariant forbids.
 *
 * ## The two halves pinned here
 *
 *  1. **Lowerable → carried.** `MapCallbackPreamble.declarations` holds one
 *     `{ name, valueParsed }` per declaration, so each adapter emits it in its
 *     own per-row local syntax through the `ParsedExpr` door it already has.
 *  2. **Not lowerable → loud.** Anything that is not a sequence of value
 *     declarations leaves `declarations` unset, and a DSL target refuses with
 *     the `/* @client *\/` escape rather than emitting a row that reads
 *     nothing. A JS runtime keeps running the preamble verbatim either way.
 *
 * All-or-nothing is the point of the shape assertions below: lowering the
 * declarable prefix of a mixed preamble and dropping the rest would be a new
 * silent divergence wearing the fix's clothes.
 *
 * The per-adapter emission is asserted end-to-end by the
 * `loop-preamble-attr-value` conformance fixture (real ERB / Jinja / Twig /
 * Blade / Kolon / Mojo / minijinja / Go renders vs. the JS reference), not
 * here; this file pins the IR contract and the gate.
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import type { IRElement, IRLoop, IRNode } from '../types'

const ROWS = (preamble: string, row = `<li key={r.id} class={cls}>{r.label}</li>`) => `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string; done: boolean }
export function Rows(props: { rows: Row[] }) {
  const [rows, setRows] = createSignal<Row[]>(props.rows)
  return (
    <ul>
      {rows().map(r => {
        ${preamble}
        return ${row}
      })}
    </ul>
  )
}
`

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

function loopOf(source: string): IRLoop {
  const loop = findLoop(jsxToIR(analyzeComponent(source, 'Rows.tsx')))
  if (!loop) throw new Error('no loop in IR')
  return loop
}

/** Compile against a DSL-tier adapter (one that cannot run a callback body). */
function dslErrors(source: string): string[] {
  const adapter = new TestAdapter()
  adapter.acceptsCallbackBody = () => false
  return compileJSX(source, 'Rows.tsx', { adapter })
    .errors.filter(e => e.severity !== 'warning')
    .map(e => `${e.code}: ${e.message}`)
}

// The first `analyzeComponent` in a process pays the TS program setup, which
// alone exceeds the default per-test timeout. Pay it once, outside a test.
beforeAll(() => {
  analyzeComponent(ROWS(`const warm = r.label`), 'Warmup.tsx')
}, 60_000)

describe('preamble value declarations — carried as neutral IR', () => {
  test('a single ternary declaration', () => {
    const loop = loopOf(ROWS(`const cls = r.done ? 'done' : 'open'`))
    expect(loop.preamble?.declarations).toEqual([
      expect.objectContaining({ name: 'cls', raw: `r.done ? 'done' : 'open'` }),
    ])
    expect(loop.preamble?.declarations?.[0].valueParsed.kind).toBe('conditional')
  })

  test('declarations keep SOURCE order, so a later one can read an earlier one', () => {
    const loop = loopOf(`
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string; done: boolean }
export function Rows(props: { rows: Row[] }) {
  const [rows, setRows] = createSignal<Row[]>(props.rows)
  return (
    <ul>
      {rows().map(r => {
        const base = r.done ? 'done' : 'open'
        const cls = base + ' row'
        return <li key={r.id} class={cls}>{r.label}</li>
      })}
    </ul>
  )
}
`)
    expect(loop.preamble?.declarations?.map(d => d.name)).toEqual(['base', 'cls'])
  })

  test('several declarators in one statement each become a declaration', () => {
    const loop = loopOf(ROWS(`const a = r.label, b = r.id`))
    expect(loop.preamble?.declarations?.map(d => d.name)).toEqual(['a', 'b'])
  })

  test('the names are loop-bound for the body, like a loop param', async () => {
    // `collectLoopBoundNames` is what stops a same-named module const from
    // inlining over the local the loop just declared.
    const { collectLoopBoundNames } = await import('../adapters/loop-bound-names.ts')
    const ctx = analyzeComponent(ROWS(`const cls = r.done ? 'done' : 'open'`), 'Rows.tsx')
    const root = jsxToIR(ctx)
    expect(root).not.toBeNull()
    const names = collectLoopBoundNames({ ...ctx.componentIR!, root: root! })
    expect(names.has('cls')).toBe(true)
  })
})

describe('preamble value declarations — all-or-nothing', () => {
  // Each of these has SOMETHING declarable in it. Carrying just that part and
  // dropping the rest would put the missing statement's effect nowhere, with
  // no diagnostic — so the whole preamble must decline.
  const notDeclarable: Array<[string, string]> = [
    ['an assignment after a declaration', `let n = 0\n        n = r.id`],
    ['an imperative loop', `const out = []\n        for (const c of r.label) out.push(c)`],
    ['a destructuring binding', `const { label } = r`],
    ['a declaration with no initializer', `let cls\n        const other = r.label`],
    [
      'an initializer the expression subset cannot model',
      `const cls = (() => r.done)()`,
    ],
  ]

  for (const [name, preamble] of notDeclarable) {
    test(name, () => {
      const loop = loopOf(ROWS(preamble, `<li key={r.id}>{r.label}</li>`))
      expect(loop.preamble).toBeDefined()
      expect(loop.preamble?.declarations).toBeUndefined()
    })
  }
})

describe('the DSL gate — loud, not an empty attribute', () => {
  test('a declarable preamble compiles clean on a DSL target', () => {
    expect(dslErrors(ROWS(`const cls = r.done ? 'done' : 'open'`))).toEqual([])
  })

  test('a non-declarable preamble refuses, with the /* @client */ escape', () => {
    const errors = dslErrors(
      ROWS(`let n = 0\n        n = r.id`, `<li key={r.id}>{r.label}</li>`),
    )
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toMatch(/not a sequence of value declarations/)
  })

  test('a JS runtime runs the same preamble verbatim — no refusal', () => {
    // The whole point of the per-backend fidelity model: the price is paid by
    // the backend that genuinely cannot express the shape.
    const r = compileJSX(
      ROWS(`let n = 0\n        n = r.id`, `<li key={r.id}>{r.label}</li>`),
      'Rows.tsx',
      { adapter: new TestAdapter() },
    )
    expect(r.errors.filter(e => e.severity !== 'warning')).toEqual([])
  })

  test('/* @client */ silences the DSL refusal', () => {
    const source = `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string; done: boolean }
export function Rows(props: { rows: Row[] }) {
  const [rows, setRows] = createSignal<Row[]>(props.rows)
  return (
    <ul>
      {/* @client */ rows().map(r => {
        let n = 0
        n = r.id
        return <li key={r.id}>{r.label}</li>
      })}
    </ul>
  )
}
`
    expect(dslErrors(source)).toEqual([])
  })
})

describe('preamble value declarations — function-literal elision (#2797)', () => {
  // An event handler hoisted into the preamble (rather than written inline in
  // the JSX attribute) has no template-expression form on any DSL backend —
  // but every adapter's own SSR prop-builder already skips an event-handler
  // prop outright, so a name read ONLY that way needs no SSR representation
  // at all. Elided, not refused: `declarations` legally ends up `[]`.
  test('a handler read only as an event-handler prop value elides clean, no refusal', () => {
    const source = ROWS(`const handleClick = () => {}`, `<li key={r.id} onClick={handleClick}>{r.label}</li>`)
    expect(loopOf(source).preamble?.declarations).toEqual([])
    expect(dslErrors(source)).toEqual([])
  })

  test('an elided handler coexists with a genuinely lowered declaration', () => {
    const loop = loopOf(
      ROWS(
        `const cls = r.done ? 'done' : 'open'\n        const handleClick = () => {}`,
        `<li key={r.id} class={cls} onClick={handleClick}>{r.label}</li>`,
      ),
    )
    // Only the lowerable declaration survives — the elided one contributes no entry.
    expect(loop.preamble?.declarations?.map(d => d.name)).toEqual(['cls'])
  })

  // Soundness: a function-valued local read ANYWHERE other than an
  // event-handler prop value still refuses — elision only widens what's
  // SAFE, it never lets an SSR-relevant function read through unassigned.
  test('a handler also read in a non-event position still refuses', () => {
    const errors = dslErrors(
      ROWS(`const handleClick = () => {}`, `<li key={r.id}>{handleClick.name}</li>`),
    )
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toMatch(/not a sequence of value declarations/)
  })

  test('a handler passed to a NON-event child prop still refuses', () => {
    const errors = dslErrors(
      ROWS(`const handleClick = () => {}`, `<li key={r.id} data-fn={handleClick}>{r.label}</li>`),
    )
    expect(errors.length).toBeGreaterThan(0)
  })
})

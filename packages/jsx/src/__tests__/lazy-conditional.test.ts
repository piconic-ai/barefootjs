/**
 * `analyzeLazyConditional` — the §9.5 "row contains a reactive conditional"
 * widening (`plan/lazy-conditional.ts`).
 *
 * Unit half over hand-built `LoopChildConditional` values so each refusal is
 * pinned to the exact shape that produces it, plus emission assertions that an
 * accepted conditional is driven from the apply bodies with its arms hoisted
 * once per loop. The DOM behaviour (does the swap actually land, both ways)
 * lives in `packages/client/__tests__/runtime/lazy-row-conditional.test.ts` —
 * emitted shape and emitted behaviour are different claims.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../index.ts'
import { TestAdapter } from '../adapters/test-adapter'
import { analyzeLazyConditional } from '../ir-to-client-js/control-flow/plan/lazy-conditional.ts'
import type { LoopChildBranchSummary, LoopChildConditional } from '../ir-to-client-js/types.ts'

const bare = (over: Partial<LoopChildBranchSummary> = {}): LoopChildBranchSummary => ({
  childComponents: [],
  ...over,
})

function cond(over: Partial<LoopChildConditional> = {}): LoopChildConditional {
  return {
    slotId: 's0',
    condition: 'row.done',
    whenTrueHtml: '<span class="yes">done</span>',
    whenFalseHtml: '<em class="no">open</em>',
    whenTrue: bare(),
    whenFalse: bare(),
    conditionFreeIdentifiers: new Set(['row']),
    ...over,
  }
}

/**
 * The caller prepares each arm through `addCondAttrToTemplate` before handing it
 * over — that is where `bf-c` comes from, and where the element-vs-fragment
 * decision is made. These helpers stand in for it.
 */
const asElement = (html: string, slotId = 's0') => html.replace(/^(<\w+)/, `$1 bf-c="${slotId}"`)
const asFragment = (html: string, slotId = 's0') =>
  `<!--bf-cond-start:${slotId}-->${html}<!--bf-cond-end:${slotId}-->`

const armsOf = (c: LoopChildConditional) => ({
  whenTrueHtml: asElement(c.whenTrueHtml, c.slotId),
  whenFalseHtml: asElement(c.whenFalseHtml, c.slotId),
})

describe('analyzeLazyConditional — accepted', () => {
  test('two wiring-free static element arms', () => {
    const c = cond()
    const r = analyzeLazyConditional(c, '__idx', armsOf(c))
    expect(r.lazySafe).toBe(true)
    if (r.lazySafe) {
      expect(r.facts.whenTrueHtml).toContain('bf-c="s0"')
      expect(r.facts.condition).toBe('row.done')
    }
  })
})

describe('analyzeLazyConditional — refusals', () => {
  const wiring: Array<[string, Partial<LoopChildBranchSummary>, RegExp]> = [
    ['a child component', { childComponents: [{ name: 'X', slotId: null, props: [], children: [] }] }, /child components/],
    ['an inner loop', { innerLoops: [{} as never] }, /an inner loop/],
    ['a nested conditional', { conditionals: [{} as never] }, /a nested conditional/],
    ['events', { events: [{} as never] }, /events/],
    ['a reactive attr', { reactiveAttrs: [{} as never] }, /reactive attrs/],
    ['reactive text', { reactiveTexts: [{} as never] }, /reactive text/],
  ]

  for (const [name, over, reason] of wiring) {
    test(`the true arm owns ${name}`, () => {
      const c = cond({ whenTrue: bare(over) })
      const r = analyzeLazyConditional(c, '__idx', armsOf(c))
      expect(r.lazySafe).toBe(false)
      if (!r.lazySafe) expect(r.reason).toMatch(reason)
    })
  }

  test('the FALSE arm is checked too, not just the true one', () => {
    const c = cond({ whenFalse: bare({ events: [{} as never] }) })
    const r = analyzeLazyConditional(c, '__idx', armsOf(c))
    expect(r.lazySafe).toBe(false)
    if (!r.lazySafe) expect(r.reason).toMatch(/its false arm owns events/)
  })

  test('a fragment conditional has no single node to replace', () => {
    const c = cond()
    const r = analyzeLazyConditional(c, '__idx', {
      whenTrueHtml: asFragment('text only'),
      whenFalseHtml: asElement(c.whenFalseHtml),
    })
    expect(r.lazySafe).toBe(false)
    if (!r.lazySafe) expect(r.reason).toMatch(/fragment conditional/)
  })

  test('an arm that interpolates a value cannot be hoisted once per loop', () => {
    const c = cond({ whenTrueHtml: '<span>${row().label}</span>' })
    const r = analyzeLazyConditional(c, '__idx', armsOf(c))
    expect(r.lazySafe).toBe(false)
    if (!r.lazySafe) expect(r.reason).toMatch(/interpolates a value/)
  })

  test('a condition with no analyzable identifier set refuses rather than assumes', () => {
    const c = cond({ conditionFreeIdentifiers: undefined })
    const r = analyzeLazyConditional(c, '__idx', armsOf(c))
    expect(r.lazySafe).toBe(false)
    if (!r.lazySafe) expect(r.reason).toMatch(/no analyzable identifier set/)
  })

  test('a condition reading the loop index refuses — the apply bodies have none', () => {
    const c = cond({ conditionFreeIdentifiers: new Set(['row', '__idx']) })
    const r = analyzeLazyConditional(c, '__idx', armsOf(c))
    expect(r.lazySafe).toBe(false)
    if (!r.lazySafe) expect(r.reason).toMatch(/reads the loop index parameter '__idx'/)
  })
})

// --- emission ---------------------------------------------------------------

function clientJs(source: string, file: string): string {
  const result = compileJSX(source, file, { adapter: new TestAdapter() })
  const js = result.files.find(f => f.path.endsWith('.client.js'))
  if (!js) throw new Error(`no client JS emitted for ${file}`)
  return js.content
}

const ROWS = (arm: string) => `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string; done: boolean }
export function CondRows(props: { rows: Row[] }) {
  const [rows, setRows] = createSignal<Row[]>(props.rows)
  return (
    <ul>
      {rows().map(row => (
        <li key={row.id}>${arm}</li>
      ))}
    </ul>
  )
}
`

describe('lazy row emission — wiring-free row conditional', () => {
  const js = clientJs(
    ROWS('{row.done ? <span class="yes">done</span> : <em class="no">open</em>}'),
    'CondRows.tsx',
  )

  test('the loop is lazy and calls no per-row insert()', () => {
    expect(js).toContain('mapArrayLazy(')
    expect(js).not.toMatch(/\bmapArray\(/)
    expect(js).not.toContain('insert(')
  })

  test('both arms are parsed once per LOOP, outside every plan body', () => {
    const beforeCall = js.slice(0, js.indexOf('mapArrayLazy('))
    expect(beforeCall).toMatch(/const __cbt_l0_s\d+ = document\.createElement\('template'\)/)
    expect(beforeCall).toMatch(/const __cbf_l0_s\d+ = document\.createElement\('template'\)/)
  })

  test('createRow only records the dedup boolean — the clone already has the right arm', () => {
    const createRow = js.slice(js.indexOf('createRow:'), js.indexOf('applyItem:'))
    expect(createRow).toMatch(/__l\[\d\] = !!\(row\(\)\.done\)/)
    expect(createRow).not.toContain('replaceWith')
  })

  test('applyItem swaps by replaceWith and reassigns the ref', () => {
    const applyItem = js.slice(js.indexOf('applyItem:'), js.indexOf("}, 'l0')"))
    expect(applyItem).toContain('__c.replaceWith(__n)')
    // Without this the next flip writes into the node the previous one detached.
    expect(applyItem).toMatch(/__r\[\d\] = __n/)
  })
})

describe('lazy row emission — conditionals that keep the eager path', () => {
  const cases: Array<[string, string]> = [
    ['an arm with an event', '{row.done ? <button onClick={() => {}}>x</button> : <em>open</em>}'],
    ['an arm reading the item', '{row.done ? <span>{row.label}</span> : <em>open</em>}'],
    ['a bare-value ternary (fragment form)', '{row.done ? "yes" : "no"}'],
  ]
  for (const [name, arm] of cases) {
    test(name, () => {
      const js = clientJs(ROWS(arm), 'EagerCond.tsx')
      expect(js).not.toContain('mapArrayLazy(')
    })
  }
})

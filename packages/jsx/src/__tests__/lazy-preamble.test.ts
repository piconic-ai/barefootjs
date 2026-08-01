/**
 * `analyzeLazyPreamble` — the §9.5 "row has a map-callback preamble"
 * widening (`plan/lazy-preamble.ts`).
 *
 * Two layers, same split as `lazy-row-eligibility.test.ts`:
 *
 *  1. Unit tests over hand-built `MapCallbackPreamble` values, so each
 *     refusal reason is pinned to the exact source shape that produces it —
 *     a refusal that silently changes wording or scope fails here.
 *  2. End-to-end emission: a component whose loop has a value-only preamble
 *     must now emit `mapArrayLazy`, with the preamble in `createRow` and
 *     nowhere else. That placement is the whole soundness argument (the apply
 *     bodies must never reference a preamble local), so it is asserted
 *     directly rather than inferred from "it compiled".
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../index.ts'
import { TestAdapter } from '../adapters/test-adapter'
import { analyzeLazyPreamble } from '../ir-to-client-js/control-flow/plan/lazy-preamble.ts'
import { tsxSourceText, type MapCallbackPreamble } from '../types.ts'

function preamble(text: string, declaredNames: string[], builderNames: string[] = []): MapCallbackPreamble {
  return {
    segments: [{ kind: 'js', text }],
    ssrText: tsxSourceText(text),
    declaredNames,
    builderNames,
  }
}

const SIGNALS: ReadonlySet<string> = new Set(['selected', 'filter'])

describe('analyzeLazyPreamble — accepted', () => {
  test('no preamble at all', () => {
    expect(analyzeLazyPreamble(undefined, '__idx', SIGNALS).lazySafe).toBe(true)
  })

  test('const declarations reading only the item', () => {
    const r = analyzeLazyPreamble(preamble("const full = `${row.a} ${row.b}`;", ['full']), '__idx', SIGNALS)
    expect(r.lazySafe).toBe(true)
    if (r.lazySafe) expect([...r.facts.declaredNames]).toEqual(['full'])
  })

  test('a zero-arg signal read is allowed — the krausest shape', () => {
    const r = analyzeLazyPreamble(
      preamble("const cls = selected() === row.id ? 'danger' : '';", ['cls']),
      '__idx',
      SIGNALS,
    )
    expect(r.lazySafe).toBe(true)
  })

  test('a destructuring const contributes every bound name, not the property keys', () => {
    const r = analyzeLazyPreamble(preamble('const { a, b: [c] } = row;', ['a', 'c']), '__idx', SIGNALS)
    expect(r.lazySafe).toBe(true)
    if (r.lazySafe) expect([...r.facts.declaredNames].sort()).toEqual(['a', 'c'])
  })
})

describe('analyzeLazyPreamble — refusals', () => {
  const cases: Array<[string, MapCallbackPreamble, RegExp]> = [
    [
      'a signal declared per row',
      preamble('const [x, setX] = createSignal(0);', ['x', 'setX']),
      /call to createSignal/,
    ],
    [
      'a memo declared per row',
      preamble('const total = createMemo(() => row.a + row.b);', ['total']),
      /call to createMemo/,
    ],
    [
      'a non-signal call — could hide a reactive accessor',
      preamble('const on = isSelected(row.id);', ['on']),
      /call to isSelected/,
    ],
    [
      'a method call on the item',
      preamble("const tags = row.tags.join(', ');", ['tags']),
      /call to row\.tags\.join/,
    ],
    [
      'a nondeterministic call would differ between createRow and applyItem',
      preamble('const n = Math.random();', ['n']),
      /call to Math\.random/,
    ],
    [
      'a signal getter called with arguments is not a plain read',
      preamble('const v = selected(row.id);', ['v']),
      /call to selected/,
    ],
    ['a mutable binding', preamble("let cls = '';", ['cls']), /mutable binding/],
    [
      'a statement that is not a declaration',
      preamble("const a = row.a; console.log(a);", ['a']),
      /non-declaration statement/,
    ],
    [
      'an arrow expression — fresh identity per run',
      preamble('const fn = (x) => x + row.a;', ['fn']),
      /function or class expression/,
    ],
    ['a new expression', preamble('const d = new Foo(row.a);', ['d']), /new expression/],
    [
      'a JSX-leaf accumulator',
      preamble('const cells = [];', ['cells'], ['cells']),
      /accumulates JSX leaves/,
    ],
    [
      'a preamble local shadowing a signal getter',
      preamble('const selected = row.sel;', ['selected']),
      /shadows the signal\/memo getter 'selected'/,
    ],
    [
      'a preamble reading the loop index',
      preamble('const n = __idx + 1;', ['n']),
      /reads the loop index parameter '__idx'/,
    ],
  ]

  for (const [name, p, reason] of cases) {
    test(name, () => {
      const r = analyzeLazyPreamble(p, '__idx', SIGNALS)
      expect(r.lazySafe).toBe(false)
      if (!r.lazySafe) expect(r.reason).toMatch(reason)
    })
  }

  test('a JSX segment is refused even with no builder name', () => {
    const p: MapCallbackPreamble = {
      segments: [{ kind: 'jsx', ir: { type: 'text', value: 'x' } as never }],
      ssrText: tsxSourceText(''),
      declaredNames: [],
      builderNames: [],
    }
    const r = analyzeLazyPreamble(p, '__idx', SIGNALS)
    expect(r.lazySafe).toBe(false)
    if (!r.lazySafe) expect(r.reason).toMatch(/JSX leaf/)
  })
})

// --- emission ---------------------------------------------------------------

function clientJs(source: string, file: string): string {
  const result = compileJSX(source, file, { adapter: new TestAdapter() })
  const js = result.files.find(f => f.path.endsWith('.client.js'))
  if (!js) throw new Error(`no client JS emitted for ${file}`)
  return js.content
}

/**
 * The preamble computes an attribute value from the item and an outer signal.
 * An attribute reading a preamble local is not classified as reactive, so it
 * lands in the row TEMPLATE — which is exactly why `createRow` needs the
 * preamble and the apply bodies do not.
 */
const VALUE_PREAMBLE = `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string; done: boolean }
export function PreambleRows() {
  const [rows, setRows] = createSignal<Row[]>([])
  const [selected, setSelected] = createSignal(0)
  return (
    <tbody>
      {rows().map(row => {
        const cls = selected() === row.id ? 'danger' : (row.done ? 'done' : '')
        return (
          <tr key={row.id} className={cls}>
            <td>{row.label}</td>
          </tr>
        )
      })}
    </tbody>
  )
}
`

describe('lazy row emission — value-only preamble', () => {
  const js = clientJs(VALUE_PREAMBLE, 'PreambleRows.tsx')

  test('the loop is lazy — a preamble no longer refuses on sight', () => {
    expect(js).toContain('mapArrayLazy(')
    expect(js).not.toMatch(/\bmapArray\(/)
  })

  test('rows still carry no per-row reactive resources', () => {
    const planBody = js.slice(js.indexOf('mapArrayLazy('), js.indexOf("}, 'l0')"))
    expect(planBody).not.toContain('createEffect')
    expect(planBody).not.toContain('createRoot')
    expect(planBody).not.toContain('createSignal')
  })

  test('createRow runs the preamble, before the clone the template needs it for', () => {
    const createRow = js.slice(js.indexOf('createRow:'), js.indexOf('applyItem:'))
    expect(createRow).toContain('const cls = selected() === row().id')
    expect(createRow.indexOf('const cls =')).toBeLessThan(createRow.indexOf('const __el ='))
  })

  test('applyItem does NOT re-run the preamble — no binding may read a local', () => {
    // Bounded at the plan's closing `}, 'l0')` — past that sits the
    // `hydrate` template, which legitimately contains the preamble.
    const applyItem = js.slice(js.indexOf('applyItem:'), js.indexOf("}, 'l0')"))
    expect(applyItem).not.toContain('const cls =')
  })
})

/**
 * Each of these keeps the eager emission. Grouped rather than split so the
 * list reads as "what still refuses", the counterpart to the widening above.
 */
describe('lazy row emission — preambles that keep the eager path', () => {
  const rows = (body: string) => `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
type Row = { id: number; label: string }
export function EagerRows() {
  const [rows, setRows] = createSignal<Row[]>([])
  return (
    <tbody>
      {rows().map(row => {
${body}
      })}
    </tbody>
  )
}
`

  const cases: Array<[string, string]> = [
    [
      'a per-row signal',
      `        const [open, setOpen] = createSignal(false)
        return <tr key={row.id}><td>{row.label}</td></tr>`,
    ],
    [
      'a mutable local',
      `        let cls = ''
        return <tr key={row.id} className={cls}><td>{row.label}</td></tr>`,
    ],
    [
      'a preamble local read in child position (a preamble-patched region)',
      `        const full = row.label + '!'
        return <tr key={row.id}><td>{full}</td></tr>`,
    ],
  ]

  for (const [name, body] of cases) {
    test(name, () => {
      const js = clientJs(rows(body), 'EagerRows.tsx')
      expect(js).not.toContain('mapArrayLazy(')
      expect(js).toMatch(/\bmapArray\(/)
    })
  }
})

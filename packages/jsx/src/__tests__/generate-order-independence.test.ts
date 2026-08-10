/**
 * Pins the core finding of the #2483 order-dependency investigation
 * (`spec/slot-unification.md` §5a's "Investigated" addendum): `compiler.ts`
 * calls `adapter.generate` before `generateClientJs` for a given component,
 * and TODAY neither reads anything the other writes in a way that changes
 * the returned `CompileResult` — no `IRNode`/`IRExpression` field is
 * mutated by either pass (the sole IR-mutating pass, `decideClientOnlyElision`,
 * already runs before both), and `componentIR.errors` is collected exactly
 * once, after BOTH passes have run regardless of order (see `compiler.ts`'s
 * `runClientJsGeneration` docstring — this needed a real fix, not just a
 * belief, after a Copilot review on PR #2606 caught a diagnostic-dropping
 * bug in the swap scaffolding itself; see the go-template case below, which
 * is the regression pin for that fix). So the two calls can be reordered
 * with a fully faithful re-run of `generateClientJs` before `adapter.generate`
 * (the `BF_INVESTIGATE_SWAP_GENERATE_ORDER` scaffolding flag) and produce
 * byte-identical output AND identical diagnostics.
 *
 * This is a regression pin, not a feature test: a future change that
 * introduces real order coupling (e.g. a general-case marker-elision
 * pre-pass that writes `markerless`/`elidedPath` from inside
 * `generateClientJs` instead of a shared pre-pass both consume) is expected
 * to break this test — that is the test doing its job. See the issue for
 * the full order-dependency map; this file only pins the "swap changes
 * nothing today" half of it, across representative shapes (plain loop,
 * conditional, `/* @client *\/` expression, nested loop+conditional,
 * multi-component file, and an adapter-diagnostic-provoking shape).
 */

import { describe, test, expect, afterEach } from 'bun:test'
import { compileJSX, type CompileResult } from '..'
import type { TemplateAdapter } from '../adapters/interface'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'
import { GoTemplateAdapter } from '../../../adapter-go-template/src/adapter/go-template-adapter'

const ENV_KEY = 'BF_INVESTIGATE_SWAP_GENERATE_ORDER'

afterEach(() => {
  delete process.env[ENV_KEY]
})

function compileBoth(source: string, filename: string, makeAdapter: () => TemplateAdapter) {
  delete process.env[ENV_KEY]
  const normalOrder = compileJSX(source, filename, { adapter: makeAdapter() })
  process.env[ENV_KEY] = '1'
  const swappedOrder = compileJSX(source, filename, { adapter: makeAdapter() })
  delete process.env[ENV_KEY]
  return { normalOrder, swappedOrder }
}

function fileContent(result: CompileResult, type: string): string | undefined {
  return result.files.find(f => f.type === type)?.content
}

/** Diagnostics compared on the fields that matter for "did the same error
 *  survive the reorder" — not the full object shape (e.g. `loc` offsets,
 *  which are legitimately allowed to differ in representation but not in
 *  substance for this pin's purpose; substance is code+severity+message). */
function normalizedDiagnostics(result: CompileResult) {
  return [...result.errors]
    .map(e => ({ code: e.code, severity: e.severity, message: e.message }))
    .sort((a, b) => (a.code + a.message).localeCompare(b.code + b.message))
}

describe('generate-order independence (#2483 investigation)', () => {
  const shapes: Array<[string, string, () => TemplateAdapter]> = [
    [
      'plain keyed loop',
      `
        'use client'
        import { createSignal } from '@barefootjs/client'
        export function List() {
          const [items] = createSignal([{ id: 1, name: 'a' }])
          return <ul>{items().map(it => <li key={it.id}>{it.name}</li>)}</ul>
        }
      `,
      () => new HonoAdapter(),
    ],
    [
      'conditional branch',
      `
        'use client'
        import { createSignal } from '@barefootjs/client'
        export function Toggle() {
          const [open] = createSignal(true)
          return <div>{open() ? <span>on</span> : <em>off</em>}</div>
        }
      `,
      () => new HonoAdapter(),
    ],
    [
      '@client expression (Step B narrow elision case)',
      `
        'use client'
        export function Client() {
          return <div>{/* @client */ window.location.href}</div>
        }
      `,
      () => new HonoAdapter(),
    ],
    [
      'nested loop + conditional (loop-row planner)',
      `
        'use client'
        import { createSignal } from '@barefootjs/client'
        export function Nested() {
          const [rows] = createSignal([{ id: 1, on: true, label: 'a', tags: ['x'] }])
          return (
            <ul>
              {rows().map(r => (
                <li key={r.id}>
                  {r.on ? <span>{r.label}</span> : <em>off</em>}
                  <ul>{r.tags.map(t => <li key={t}>{t}</li>)}</ul>
                </li>
              ))}
            </ul>
          )
        }
      `,
      () => new HonoAdapter(),
    ],
    [
      'multi-component file (compileMultipleComponents path)',
      `
        'use client'
        import { createSignal } from '@barefootjs/client'
        function Row({ label }: { label: string }) {
          return <li>{label}</li>
        }
        export function MultiList() {
          const [items] = createSignal([{ id: 1, label: 'a' }])
          return <ul>{items().map(it => <Row key={it.id} label={it.label} />)}</ul>
        }
      `,
      () => new HonoAdapter(),
    ],
  ]

  for (const [label, source, makeAdapter] of shapes) {
    test(`${label}: markedTemplate, clientJs, and diagnostics are identical under swapped generation order`, () => {
      const { normalOrder, swappedOrder } = compileBoth(source, `Order_${label.replace(/\W+/g, '_')}.tsx`, makeAdapter)

      expect(normalOrder.errors.filter(e => e.severity === 'error')).toEqual([])
      expect(swappedOrder.errors.filter(e => e.severity === 'error')).toEqual([])

      expect(fileContent(swappedOrder, 'markedTemplate')).toBe(fileContent(normalOrder, 'markedTemplate'))
      expect(fileContent(swappedOrder, 'clientJs')).toBe(fileContent(normalOrder, 'clientJs'))
      expect(normalizedDiagnostics(swappedOrder)).toEqual(normalizedDiagnostics(normalOrder))
    })
  }

  // Regression pin for the diagnostic-dropping bug a Copilot review on
  // PR #2606 caught: seven of the nine adapters (every one but Hono —
  // go-template, erb, blade, jinja, mojolicious, minijinja, twig, xslate)
  // append their own diagnostics to `ir.errors` INSIDE `adapter.generate()`
  // (`go-template-adapter.ts:531-533` et al). None of the shapes above ever
  // exercised that path — they all use `HonoAdapter`, which never appends
  // to `ir.errors` during `generate()`, so this class of bug was invisible
  // to every other case in this file. `GoTemplateAdapter` DOES, and this
  // exact shape (a non-identifier spread condition) is go-template's own
  // pinned BF101 fixture (`go-template-adapter.test.ts`'s "refuses a
  // non-identifier condition with BF101"). Before the fix this test failed:
  // swapped-order `result.errors` was `[]` while normal-order had BF101,
  // because the single-component path's `runClientJsGeneration` closure
  // collected `componentIR.errors` INSIDE itself, and under the swap that
  // closure runs before `adapter.generate()` ever appends anything.
  test('adapter-appended diagnostic (BF101, go-template) survives the swap', () => {
    const source = `
      function Box({ a, b }: { a?: string; b?: string }) {
        return <div {...(a === b ? { 'data-x': a } : {})} />
      }
    `
    const { normalOrder, swappedOrder } = compileBoth(source, 'Order_go_template_BF101.tsx', () => new GoTemplateAdapter())

    expect(normalOrder.errors.some(e => e.code === 'BF101')).toBe(true)
    expect(swappedOrder.errors.some(e => e.code === 'BF101')).toBe(true)
    expect(normalizedDiagnostics(swappedOrder)).toEqual(normalizedDiagnostics(normalOrder))
  })

  // Same regression, multi-component path — kept as a pin even though the
  // investigation established `compileMultipleComponents` was never
  // affected (its single `errors.push(...componentIR.errors)` already sat
  // after both calls unconditionally): a future refactor of that loop could
  // reintroduce the same class of bug, and this catches it the same way.
  test('adapter-appended diagnostic (BF101, go-template, multi-component file) survives the swap', () => {
    const source = `
      function Box({ a, b }: { a?: string; b?: string }) {
        return <div {...(a === b ? { 'data-x': a } : {})} />
      }
      export function Sibling() {
        return <Box a="1" b="2" />
      }
    `
    const { normalOrder, swappedOrder } = compileBoth(source, 'Order_go_template_BF101_multi.tsx', () => new GoTemplateAdapter())

    expect(normalOrder.errors.some(e => e.code === 'BF101')).toBe(true)
    expect(swappedOrder.errors.some(e => e.code === 'BF101')).toBe(true)
    expect(normalizedDiagnostics(swappedOrder)).toEqual(normalizedDiagnostics(normalOrder))
  })
})

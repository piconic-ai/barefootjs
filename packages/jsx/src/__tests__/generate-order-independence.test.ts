/**
 * Pins the core finding of the #2483 order-dependency investigation
 * (`spec/slot-unification.md` §5a's "Investigated" addendum): `compiler.ts`
 * calls `adapter.generate` before `generateClientJs` for a given component,
 * and TODAY neither reads anything the other writes — no `IRNode`/
 * `IRExpression` field is mutated by either pass (the sole IR-mutating pass,
 * `decideClientOnlyElision`, already runs before both). So the two calls
 * can be reordered with a fully faithful re-run of `generateClientJs`
 * before `adapter.generate` (the `BF_INVESTIGATE_SWAP_GENERATE_ORDER`
 * scaffolding flag) and produce BYTE-IDENTICAL output.
 *
 * This is a regression pin, not a feature test: a future change that
 * introduces real order coupling (e.g. a general-case marker-elision
 * pre-pass that writes `markerless`/`elidedPath` from inside
 * `generateClientJs` instead of a shared pre-pass both consume) is expected
 * to break this test — that is the test doing its job. See the issue for
 * the full order-dependency map; this file only pins the "swap changes
 * nothing today" half of it, across representative shapes (plain loop,
 * conditional, `/* @client *\/` expression, nested loop+conditional).
 */

import { describe, test, expect, afterEach } from 'bun:test'
import { compileJSX } from '..'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'

const ENV_KEY = 'BF_INVESTIGATE_SWAP_GENERATE_ORDER'

afterEach(() => {
  delete process.env[ENV_KEY]
})

function compileBoth(source: string, filename: string) {
  delete process.env[ENV_KEY]
  const normalOrder = compileJSX(source, filename, { adapter: new HonoAdapter() })
  process.env[ENV_KEY] = '1'
  const swappedOrder = compileJSX(source, filename, { adapter: new HonoAdapter() })
  delete process.env[ENV_KEY]
  return { normalOrder, swappedOrder }
}

function fileContent(result: ReturnType<typeof compileJSX>, type: string): string | undefined {
  return result.files.find(f => f.type === type)?.content
}

describe('generate-order independence (#2483 investigation)', () => {
  const shapes: Array<[string, string]> = [
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
    ],
    [
      '@client expression (Step B narrow elision case)',
      `
        'use client'
        export function Client() {
          return <div>{/* @client */ window.location.href}</div>
        }
      `,
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
    ],
  ]

  for (const [label, source] of shapes) {
    test(`${label}: markedTemplate and clientJs are byte-identical under swapped generation order`, () => {
      const { normalOrder, swappedOrder } = compileBoth(source, `Order_${label.replace(/\W+/g, '_')}.tsx`)

      expect(normalOrder.errors.filter(e => e.severity === 'error')).toEqual([])
      expect(swappedOrder.errors.filter(e => e.severity === 'error')).toEqual([])

      expect(fileContent(swappedOrder, 'markedTemplate')).toBe(fileContent(normalOrder, 'markedTemplate'))
      expect(fileContent(swappedOrder, 'clientJs')).toBe(fileContent(normalOrder, 'clientJs'))
    })
  }
})
